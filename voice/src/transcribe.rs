//! Transcrição de fala local com Whisper (whisper.cpp). O Godot entrega o que o microfone capta; aqui
//! o áudio vira 16 kHz mono, é cortado nas pausas e cada trecho é transcrito numa thread própria, para
//! o jogo nunca esperar o modelo.

use std::collections::VecDeque;
use std::sync::mpsc::{channel, Receiver, Sender, TryRecvError};
use std::thread::JoinHandle;

use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

pub const WHISPER_RATE: u32 = 16_000;
const FRAME: usize = 320; // 20 ms a 16 kHz
/// Pausa que encerra um trecho de fala.
const END_SILENCE: usize = 30; // 600 ms
/// Fala menor que isto é ruído (tosse, clique) e é descartada.
const MIN_SPEECH: usize = 12; // 240 ms
/// Um trecho nunca passa disto: corta no meio de quem não para de falar.
const MAX_UTTERANCE: usize = 25 * 50;
/// Antes do começo detectado entra um pouco de áudio, para não comer a primeira sílaba.
const PRE_ROLL: usize = 10;
const MIN_THRESHOLD: f32 = 0.012;

/// Reduz o áudio do microfone para 16 kHz com uma média por janela (filtro simples contra serrilhado).
pub struct Downsampler {
    ratio: f64,
    phase: f64,
    sum: f32,
    count: f32,
}

impl Downsampler {
    pub fn new(input_rate: f32) -> Self {
        Self { ratio: (input_rate as f64 / WHISPER_RATE as f64).max(1.0), phase: 0.0, sum: 0.0, count: 0.0 }
    }

    pub fn process(&mut self, input: &[f32]) -> Vec<f32> {
        let mut out = Vec::with_capacity((input.len() as f64 / self.ratio) as usize + 1);
        for sample in input {
            self.sum += sample;
            self.count += 1.0;
            self.phase += 1.0;
            if self.phase >= self.ratio {
                out.push(self.sum / self.count);
                self.sum = 0.0;
                self.count = 0.0;
                self.phase -= self.ratio;
            }
        }
        out
    }
}

/// Corta o fluxo em trechos de fala: começa quando o volume passa de um limiar que acompanha o ruído
/// de fundo e termina depois de uma pausa.
pub struct Segmenter {
    pending: Vec<f32>,
    noise: f32,
    speaking: bool,
    silent_frames: usize,
    speech_frames: usize,
    utterance: Vec<f32>,
    pre_roll: VecDeque<Vec<f32>>,
}

impl Segmenter {
    pub fn new() -> Self {
        Self {
            pending: Vec::new(),
            noise: 0.004,
            speaking: false,
            silent_frames: 0,
            speech_frames: 0,
            utterance: Vec::new(),
            pre_roll: VecDeque::new(),
        }
    }

    /// Recebe amostras a 16 kHz e devolve os trechos de fala que terminaram.
    pub fn feed(&mut self, samples: &[f32]) -> Vec<Vec<f32>> {
        self.pending.extend_from_slice(samples);
        let mut done = Vec::new();
        while self.pending.len() >= FRAME {
            let frame: Vec<f32> = self.pending.drain(..FRAME).collect();
            if let Some(utterance) = self.frame(frame) {
                done.push(utterance);
            }
        }
        done
    }

    /// Encerra o trecho em andamento (o usuário parou de ditar), se houver fala suficiente.
    pub fn flush(&mut self) -> Option<Vec<f32>> {
        self.pending.clear();
        self.finish()
    }

    fn frame(&mut self, frame: Vec<f32>) -> Option<Vec<f32>> {
        let rms = (frame.iter().map(|s| s * s).sum::<f32>() / frame.len() as f32).sqrt();
        let threshold = (self.noise * 3.0).max(MIN_THRESHOLD);
        let loud = rms > threshold;
        if !self.speaking {
            if !loud {
                self.noise += (rms - self.noise) * 0.05;
                self.pre_roll.push_back(frame);
                if self.pre_roll.len() > PRE_ROLL {
                    self.pre_roll.pop_front();
                }
                return None;
            }
            self.speaking = true;
            self.silent_frames = 0;
            self.speech_frames = 0;
            for earlier in self.pre_roll.drain(..) {
                self.utterance.extend(earlier);
            }
        }
        self.utterance.extend_from_slice(&frame);
        if loud {
            self.silent_frames = 0;
            self.speech_frames += 1;
        } else {
            self.silent_frames += 1;
        }
        if self.silent_frames >= END_SILENCE || self.utterance.len() >= MAX_UTTERANCE * FRAME {
            return self.finish();
        }
        None
    }

    fn finish(&mut self) -> Option<Vec<f32>> {
        let enough = self.speech_frames >= MIN_SPEECH;
        let utterance = std::mem::take(&mut self.utterance);
        self.speaking = false;
        self.silent_frames = 0;
        self.speech_frames = 0;
        self.pre_roll.clear();
        if enough { Some(utterance) } else { None }
    }
}

enum Command {
    Audio(Vec<f32>),
    Flush,
    Stop,
}

pub enum Event {
    Ready,
    Failed(String),
    Text(String),
}

/// A thread que carrega o modelo e transcreve. `push` entrega áudio; `poll` colhe os textos prontos.
pub struct Worker {
    commands: Sender<Command>,
    events: Receiver<Event>,
    handle: Option<JoinHandle<()>>,
}

impl Worker {
    pub fn start(model: String, language: String, threads: i32) -> Self {
        let (commands, command_rx) = channel::<Command>();
        let (event_tx, events) = channel::<Event>();
        let handle = std::thread::spawn(move || run(model, language, threads, command_rx, event_tx));
        Self { commands, events, handle: Some(handle) }
    }

    pub fn push(&self, samples: Vec<f32>) {
        let _ = self.commands.send(Command::Audio(samples));
    }

    pub fn flush(&self) {
        let _ = self.commands.send(Command::Flush);
    }

    pub fn poll(&self) -> Vec<Event> {
        let mut out = Vec::new();
        loop {
            match self.events.try_recv() {
                Ok(event) => out.push(event),
                Err(TryRecvError::Empty | TryRecvError::Disconnected) => return out,
            }
        }
    }
}

impl Drop for Worker {
    fn drop(&mut self) {
        let _ = self.commands.send(Command::Stop);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

fn run(model: String, language: String, threads: i32, commands: Receiver<Command>, events: Sender<Event>) {
    let mut params = WhisperContextParameters::default();
    params.use_gpu(false);
    let context = match WhisperContext::new_with_params(&model, params) {
        Ok(context) => context,
        Err(error) => {
            let _ = events.send(Event::Failed(format!("Não consegui carregar o modelo: {error}")));
            return;
        }
    };
    let mut state = match context.create_state() {
        Ok(state) => state,
        Err(error) => {
            let _ = events.send(Event::Failed(format!("Não consegui preparar o modelo: {error}")));
            return;
        }
    };
    let _ = events.send(Event::Ready);

    let mut segmenter = Segmenter::new();
    let mut transcribe = |audio: Vec<f32>| {
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some(&language));
        params.set_n_threads(threads);
        params.set_translate(false);
        params.set_no_context(true);
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_suppress_blank(true);
        params.set_no_speech_thold(0.6);
        if let Err(error) = state.full(params, &audio) {
            let _ = events.send(Event::Failed(format!("Falha ao transcrever: {error}")));
            return;
        }
        let mut text = String::new();
        for segment in state.as_iter() {
            if segment.no_speech_probability() > 0.6 {
                continue;
            }
            if let Ok(piece) = segment.to_str_lossy() {
                text.push_str(&piece);
            }
        }
        if let Some(clean) = clean_text(&text) {
            let _ = events.send(Event::Text(clean));
        }
    };

    loop {
        match commands.recv() {
            Ok(Command::Audio(samples)) => {
                for utterance in segmenter.feed(&samples) {
                    transcribe(utterance);
                }
            }
            Ok(Command::Flush) => {
                if let Some(utterance) = segmenter.flush() {
                    transcribe(utterance);
                }
            }
            Ok(Command::Stop) | Err(_) => return,
        }
    }
}

/// O texto limpo, ou `None` se for vazio ou uma das "alucinações" que o Whisper inventa no silêncio
/// ("[Música]", créditos de legenda).
pub fn clean_text(raw: &str) -> Option<String> {
    let text = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    let lower = text.to_lowercase();
    let bracketed = (text.starts_with('[') && text.ends_with(']')) || (text.starts_with('(') && text.ends_with(')'));
    let credits = lower.contains("amara.org") || lower.contains("legendas pela comunidade");
    let stray = text.chars().all(|c| !c.is_alphanumeric());
    if text.is_empty() || bracketed || credits || stray { None } else { Some(text) }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(frames: usize, amplitude: f32) -> Vec<f32> {
        (0..frames * FRAME).map(|i| amplitude * (i as f32 * 0.3).sin()).collect()
    }

    #[test]
    fn downsampler_keeps_the_duration() {
        let mut down = Downsampler::new(48_000.0);
        let out = down.process(&vec![0.5; 48_000]);
        assert!((out.len() as i64 - 16_000).abs() <= 1);
        assert!(out.iter().all(|s| (s - 0.5).abs() < 1e-5));
        let mut odd = Downsampler::new(44_100.0);
        let out = odd.process(&vec![0.25; 44_100]);
        assert!((out.len() as i64 - 16_000).abs() <= 1);
    }

    #[test]
    fn a_pause_closes_the_utterance_with_a_pre_roll() {
        let mut seg = Segmenter::new();
        assert!(seg.feed(&tone(20, 0.0)).is_empty());
        let mut audio = tone(40, 0.2);
        audio.extend(tone(END_SILENCE + 2, 0.0));
        let done = seg.feed(&audio);
        assert_eq!(done.len(), 1);
        assert!(done[0].len() >= (40 + PRE_ROLL.min(20)) * FRAME);
    }

    #[test]
    fn short_noises_are_dropped_and_flush_closes_the_rest() {
        let mut seg = Segmenter::new();
        let mut blip = tone(3, 0.3);
        blip.extend(tone(END_SILENCE + 2, 0.0));
        assert!(seg.feed(&blip).is_empty());
        assert!(seg.feed(&tone(30, 0.2)).is_empty());
        assert!(seg.flush().is_some());
        assert!(seg.flush().is_none());
    }

    #[test]
    fn long_speech_is_cut_at_the_limit() {
        let mut seg = Segmenter::new();
        let done = seg.feed(&tone(MAX_UTTERANCE + 10, 0.2));
        assert_eq!(done.len(), 1);
    }

    #[test]
    fn hallucinations_and_empty_text_are_dropped() {
        assert_eq!(clean_text("  Olá,   mundo. "), Some("Olá, mundo.".to_string()));
        assert_eq!(clean_text("[Música]"), None);
        assert_eq!(clean_text("(risos)"), None);
        assert_eq!(clean_text("Legendas pela comunidade Amara.org"), None);
        assert_eq!(clean_text(" ... "), None);
        assert_eq!(clean_text(""), None);
    }
}
