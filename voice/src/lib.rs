//! Codec de voz do Guacamole: reduz ruido (RNNoise) e comprime em Opus.
//!
//! O Godot captura e toca o audio; esta extensao so transforma. Tudo trabalha em mono,
//! 48 kHz. O RNNoise processa quadros de 10 ms (480 amostras) e cada pacote Opus leva dois deles,
//! 20 ms (960 amostras), ou seja, 50 pacotes por segundo.

mod head_model;
mod sound;

use std::collections::HashMap;
use std::io::Cursor;
use std::sync::{Arc, Mutex};

use godot::prelude::*;
use hrtf::{HrirSphere, HrtfContext, HrtfProcessor, Vec3};
use nnnoiseless::DenoiseState;
use opus::{Application, Channels, Decoder, Encoder};

const RATE: u32 = 48_000;
const FRAME: usize = 480;
const PACKET: usize = FRAME * 2;
const MAX_PACKET: usize = 400;
/// Tamanho das respostas de cabeca do modelo, em amostras.
const HRIR_LEN: usize = 129;

/// Volume alvo da voz (RMS, 1.0 e o fundo de escala): cerca de -20 dBFS.
const TARGET_RMS: f32 = 0.1;
const MIN_GAIN: f32 = 0.3;
/// Com a supressao ligada o ruido ja foi tirado, entao da para subir bastante (+24 dB).
const MAX_GAIN: f32 = 16.0;
/// Sem supressao o chiado sobe junto com a voz: o limite e menor (+15 dB).
const MAX_GAIN_RAW: f32 = 5.6;
/// Abaixo disto (RMS, depois da supressao) nao e voz e o ganho nao se mexe.
const VOICE_FLOOR: f32 = 0.004;
const VOICE_FLOOR_RAW: f32 = 0.01;

struct GuacamoleVoice;

/// O HRTF compartilhado: um processador (esfera de respostas + FFT) para todas as vozes.
struct HrtfEngine {
    processor: HrtfProcessor,
    /// Espelha o eixo x das direcoes (esferas de arquivo podem usar outra convencao).
    flip_x: bool,
    source: String,
}

/// Um som da cena tocando: de onde do arquivo (em amostras a 48 kHz) e se repete.
struct SoundVoice {
    media: String,
    position: usize,
    looping: bool,
}

/// O estado de uma voz no HRTF: o historico da convolucao e o que foi usado no bloco anterior.
struct HrtfVoice {
    history: Vec<f32>,
    prev: Vec3,
    prev_gain: f32,
}

#[gdextension]
unsafe impl ExtensionLibrary for GuacamoleVoice {}

#[derive(GodotClass)]
#[class(base = RefCounted)]
struct VoiceCodec {
    input_rate: f64,
    suppress: bool,
    normalize: bool,
    gain: f32,
    denoise: Box<DenoiseState<'static>>,
    encoder: Encoder,
    /// Amostras mono ja reamostradas a 48 kHz, esperando completar um quadro.
    pending: Vec<f32>,
    /// Posicao fracionaria entre a ultima amostra de entrada e a proxima de saida.
    phase: f64,
    last: f32,
    level: f32,
    decoders: HashMap<String, Decoder>,
    hrtf: Option<HrtfEngine>,
    hrtf_voices: HashMap<String, HrtfVoice>,
    /// Sons da cena ja decodificados (mono, 48 kHz), por id da midia.
    sounds: HashMap<String, Vec<i16>>,
    sound_voices: HashMap<String, SoundVoice>,
    /// Decodificacoes em andamento (thread do proprio Rust), por id da midia.
    decoding: HashMap<String, Arc<Mutex<Option<Vec<i16>>>>>,
    base: Base<RefCounted>,
}

#[godot_api]
impl IRefCounted for VoiceCodec {
    fn init(base: Base<RefCounted>) -> Self {
        let mut encoder =
            Encoder::new(RATE, Channels::Mono, Application::Voip).expect("encoder opus");
        let _ = encoder.set_bitrate(opus::Bitrate::Bits(24_000));
        Self {
            input_rate: RATE as f64,
            suppress: true,
            normalize: true,
            gain: 1.0,
            denoise: DenoiseState::new(),
            encoder,
            pending: Vec::new(),
            phase: 0.0,
            last: 0.0,
            level: 0.0,
            decoders: HashMap::new(),
            hrtf: None,
            hrtf_voices: HashMap::new(),
            sounds: HashMap::new(),
            sound_voices: HashMap::new(),
            decoding: HashMap::new(),
            base,
        }
    }
}

impl VoiceCodec {
    /// Posiciona um bloco mono de PACKET amostras: HRTF (com a historia da convolucao em key) ou
    /// pan por ganho. Sem HRTF disponivel ou com bloco de outro tamanho, cai no pan.
    fn spatialize(&mut self, key: &str, mono: &[f32], x: f32, y: f32, z: f32, gain: f32, hrtf: bool) -> PackedVector2Array {
        if hrtf && mono.len() == PACKET && self.ensure_hrtf() {
            let engine = self.hrtf.as_mut().expect("hrtf pronto");
            let direction = Vec3::new(if engine.flip_x { -x } else { x }, y, z);
            let voice = self.hrtf_voices.entry(key.to_string()).or_insert(HrtfVoice {
                history: Vec::new(),
                prev: direction,
                prev_gain: gain,
            });
            let mut out = vec![(0.0f32, 0.0f32); PACKET];
            engine.processor.process_samples(HrtfContext {
                source: mono,
                output: &mut out,
                new_sample_vector: direction,
                prev_sample_vector: voice.prev,
                new_gain: gain,
                prev_gain: voice.prev_gain,
                history: &mut voice.history,
            });
            voice.prev = direction;
            voice.prev_gain = gain;
            return out.iter().map(|(l, r)| Vector2::new(*l, *r)).collect();
        }
        let (left, right) = pan_gains(x, z);
        mono.iter().map(|s| Vector2::new(*s * left * gain, *s * right * gain)).collect()
    }

    fn ensure_hrtf(&mut self) -> bool {
        if self.hrtf.is_none() {
            let bytes = head_model::sphere_bytes(RATE, HRIR_LEN);
            let Ok(sphere) = HrirSphere::new(Cursor::new(bytes), RATE) else {
                return false;
            };
            self.hrtf = Some(HrtfEngine {
                processor: HrtfProcessor::new(sphere, PACKET),
                flip_x: false,
                source: String::from("modelo"),
            });
        }
        true
    }

    /// Descodifica um pacote Opus de peer para amostras mono a 48 kHz.
    fn decode_mono(&mut self, key: &str, packet: &[u8]) -> Option<Vec<f32>> {
        if !self.decoders.contains_key(key) {
            let decoder = Decoder::new(RATE, Channels::Mono).ok()?;
            self.decoders.insert(key.to_string(), decoder);
        }
        let decoder = self.decoders.get_mut(key)?;
        let mut pcm = [0.0f32; FRAME * 6];
        let n = decoder.decode_float(packet, &mut pcm, false).ok()?;
        Some(pcm[..n].to_vec())
    }

    /// Ajusta o ganho para levar o RMS da voz ao alvo: desce depressa quando estoura e sobe devagar
    /// quando esta baixo. Quadros sem voz nao mexem no ganho, para nao subir o chiado.
    fn track_gain(&mut self, frame: &[f32; FRAME]) {
        let rms = (frame.iter().map(|s| s * s).sum::<f32>() / FRAME as f32).sqrt();
        let (floor, cap) = if self.suppress { (VOICE_FLOOR, MAX_GAIN) } else { (VOICE_FLOOR_RAW, MAX_GAIN_RAW) };
        if rms <= floor {
            self.gain = self.gain.min(cap);
            return;
        }
        let wanted = (TARGET_RMS / rms).clamp(MIN_GAIN, cap);
        let rate = if wanted < self.gain { 0.25 } else { 0.015 };
        self.gain += (wanted - self.gain) * rate;
    }
}

/// Uma esfera de arquivo pode usar o eixo x espelhado: com uma fonte a direita, o ouvido direito deve
/// receber mais energia do que o esquerdo.
fn right_is_louder(processor: &mut HrtfProcessor) -> bool {
    let source: Vec<f32> = (0..PACKET).map(|i| (i as f32 * 0.05).sin()).collect();
    let mut history = Vec::new();
    let mut out = vec![(0.0f32, 0.0f32); PACKET];
    let to_right = Vec3::new(1.0, 0.0, 0.0);
    for _ in 0..2 {
        out.iter_mut().for_each(|s| *s = (0.0, 0.0));
        processor.process_samples(HrtfContext {
            source: &source,
            output: &mut out,
            new_sample_vector: to_right,
            prev_sample_vector: to_right,
            new_gain: 1.0,
            prev_gain: 1.0,
            history: &mut history,
        });
    }
    let (l, r) = out.iter().fold((0.0f32, 0.0f32), |(l, r), s| (l + s.0 * s.0, r + s.1 * s.1));
    r >= l
}

/// Ganhos (esquerdo, direito) do pan pela direcao: 1 e 1 a frente, so um lado a 90 graus.
fn pan_gains(x: f32, z: f32) -> (f32, f32) {
    let length = (x * x + z * z).sqrt();
    if length < 1e-4 {
        return (1.0, 1.0);
    }
    let pan = (x / length).clamp(-1.0, 1.0);
    let angle = (pan + 1.0) * std::f32::consts::PI / 4.0;
    ((std::f32::consts::SQRT_2 * angle.cos()).min(1.0), (std::f32::consts::SQRT_2 * angle.sin()).min(1.0))
}

/// Comprime so os picos acima de 0.7, sem mexer no resto, para o ganho nao gerar estalos.
fn soft_limit(x: f32) -> f32 {
    let a = x.abs();
    if a <= 0.7 {
        x
    } else {
        x.signum() * (0.7 + 0.3 * ((a - 0.7) / 0.3).tanh())
    }
}

#[godot_api]
impl VoiceCodec {
    /// Taxa de amostragem do que chega em `encode` (a do barramento de captura do Godot).
    #[func]
    fn set_input_rate(&mut self, rate: f64) {
        if rate >= 8_000.0 {
            self.input_rate = rate;
        }
    }

    #[func]
    fn set_suppression(&mut self, on: bool) {
        self.suppress = on;
    }

    #[func]
    fn is_suppressing(&self) -> bool {
        self.suppress
    }

    /// Liga ou desliga a normalizacao: o volume da voz e levado, aos poucos, para um nivel
    /// constante, subindo microfones baixos e descendo os que estouram.
    #[func]
    fn set_normalization(&mut self, on: bool) {
        self.normalize = on;
        if !on {
            self.gain = 1.0;
        }
    }

    #[func]
    fn is_normalizing(&self) -> bool {
        self.normalize
    }

    /// O ganho aplicado agora, em decibeis (0 quando desligada ou ainda sem ajuste).
    #[func]
    fn gain_db(&self) -> f32 {
        20.0 * self.gain.log10()
    }

    /// Volume (0 a 1) do ultimo pacote enviado, depois da supressao e da normalizacao.
    #[func]
    fn level(&self) -> f32 {
        self.level
    }

    /// Recebe amostras estereo da captura e devolve os pacotes Opus que ficaram completos.
    #[func]
    fn encode(&mut self, frames: PackedVector2Array) -> Array<PackedByteArray> {
        let step = self.input_rate / RATE as f64;
        for v in frames.as_slice() {
            let sample = (v.x + v.y) * 0.5;
            // Interpolacao linear: gera as amostras de saida que caem entre `last` e `sample`.
            while self.phase < 1.0 {
                let out = self.last + (sample - self.last) * self.phase as f32;
                self.pending.push(out);
                self.phase += step;
            }
            self.phase -= 1.0;
            self.last = sample;
        }

        let mut packets = Array::new();
        let mut taken = 0;
        while self.pending.len() - taken >= PACKET {
            // O RNNoise trabalha em quadros de 10 ms; cada pacote Opus leva dois deles (20 ms).
            let mut norm = [0.0f32; PACKET];
            let mut energy = 0.0f32;
            for half in 0..PACKET / FRAME {
                let from = taken + half * FRAME;
                let mut input = [0.0f32; FRAME];
                for (dst, src) in input.iter_mut().zip(&self.pending[from..from + FRAME]) {
                    *dst = src * 32_768.0;
                }
                let mut clean = [0.0f32; FRAME];
                if self.suppress {
                    self.denoise.process_frame(&mut clean, &input);
                } else {
                    clean = input;
                }
                let mut frame = [0.0f32; FRAME];
                for (dst, src) in frame.iter_mut().zip(clean.iter()) {
                    *dst = (src / 32_768.0).clamp(-1.0, 1.0);
                }
                if self.normalize {
                    self.track_gain(&frame);
                }
                for (dst, src) in norm[half * FRAME..(half + 1) * FRAME].iter_mut().zip(frame.iter()) {
                    *dst = if self.normalize { soft_limit(src * self.gain) } else { *src };
                    energy += *dst * *dst;
                }
            }
            taken += PACKET;
            self.level = (energy / PACKET as f32).sqrt();
            let mut buf = [0u8; MAX_PACKET];
            if let Ok(n) = self.encoder.encode_float(&norm, &mut buf) {
                packets.push(&PackedByteArray::from(&buf[..n]));
            }
        }
        self.pending.drain(..taken);
        packets
    }

    /// Descodifica um pacote de `peer` para amostras estereo a 48 kHz, com o ganho de cada lado
    /// (1.0 e 1.0 deixa a voz no centro, sem alteracao).
    #[func]
    fn decode(&mut self, peer: GString, packet: PackedByteArray, left: f32, right: f32) -> PackedVector2Array {
        match self.decode_mono(&peer.to_string(), packet.as_slice()) {
            Some(mono) => mono.iter().map(|s| Vector2::new(*s * left, *s * right)).collect(),
            None => PackedVector2Array::new(),
        }
    }

    /// Como `decode`, mas posiciona a voz com HRTF: `(x, y, z)` e a direcao da cabeca de quem ouve
    /// ate a fonte (x para a direita, y para cima, z para a frente) e `gain` o volume. Sem HRTF
    /// disponivel, ou com pacote de outro tamanho, a voz sai no centro.
    #[func]
    fn decode_hrtf(&mut self, peer: GString, packet: PackedByteArray, x: f32, y: f32, z: f32, gain: f32) -> PackedVector2Array {
        let key = peer.to_string();
        let Some(mono) = self.decode_mono(&key, packet.as_slice()) else {
            return PackedVector2Array::new();
        };
        self.spatialize(&key, &mono, x, y, z, gain, true)
    }

    /// Comeca a decodificar um arquivo de audio (OGG, MP3 ou WAV) numa thread, sem travar o jogo.
    /// `sound_poll` diz quando terminou. Nao chama nada do Godot de dentro da thread.
    #[func]
    fn sound_decode_start(&mut self, media: GString, file: PackedByteArray) {
        let key = media.to_string();
        if self.sounds.contains_key(&key) || self.decoding.contains_key(&key) {
            return;
        }
        let bytes = file.as_slice().to_vec();
        let slot: Arc<Mutex<Option<Vec<i16>>>> = Arc::new(Mutex::new(None));
        let writer = Arc::clone(&slot);
        std::thread::spawn(move || {
            let decoded = sound::decode_mono_48k(&bytes).unwrap_or_default();
            if let Ok(mut guard) = writer.lock() {
                *guard = Some(decoded);
            }
        });
        self.decoding.insert(key, slot);
    }

    /// Estado da decodificacao de `media`: 0 em andamento (ou nao iniciada), 1 pronto e carregado,
    /// -1 o arquivo nao pode ser decodificado.
    #[func]
    fn sound_poll(&mut self, media: GString) -> i64 {
        let key = media.to_string();
        if self.sounds.contains_key(&key) {
            return 1;
        }
        let Some(slot) = self.decoding.get(&key) else {
            return 0;
        };
        let finished = slot.lock().ok().and_then(|mut guard| guard.take());
        match finished {
            None => 0,
            Some(samples) => {
                self.decoding.remove(&key);
                if samples.is_empty() {
                    -1
                } else {
                    self.sounds.insert(key, samples);
                    1
                }
            }
        }
    }
    #[func]
    fn sound_has(&self, media: GString) -> bool {
        self.sounds.contains_key(&media.to_string())
    }

    /// Duracao do som em segundos (0 se nao foi carregado).
    #[func]
    fn sound_length(&self, media: GString) -> f64 {
        self.sounds.get(&media.to_string()).map(|s| s.len() as f64 / sound::RATE as f64).unwrap_or(0.0)
    }

    /// Comeca a tocar `media` como a voz `voice`, a partir de `offset` segundos; `looping` repete.
    #[func]
    fn voice_start(&mut self, voice: GString, media: GString, offset: f64, looping: bool) -> bool {
        let media = media.to_string();
        let Some(samples) = self.sounds.get(&media) else {
            return false;
        };
        let mut position = (offset.max(0.0) * sound::RATE as f64) as usize;
        if position >= samples.len() {
            if !looping {
                return false;
            }
            position %= samples.len();
        }
        self.sound_voices.insert(voice.to_string(), SoundVoice { media, position, looping });
        true
    }

    #[func]
    fn voice_stop(&mut self, voice: GString) {
        let key = voice.to_string();
        self.sound_voices.remove(&key);
        self.hrtf_voices.remove(&format!("snd:{key}"));
    }

    /// O proximo bloco (20 ms, estereo) da voz `voice`, posicionado na direcao `(x, y, z)` (x para
    /// a direita, y para cima, z para a frente) com o ganho `gain`. HRTF ou, se `hrtf` for falso,
    /// pan por ganho. Vazio quando o som acabou.
    #[func]
    fn voice_render(&mut self, voice: GString, x: f32, y: f32, z: f32, gain: f32, hrtf: bool) -> PackedVector2Array {
        let key = voice.to_string();
        let Some(state) = self.sound_voices.get_mut(&key) else {
            return PackedVector2Array::new();
        };
        let Some(samples) = self.sounds.get(&state.media) else {
            return PackedVector2Array::new();
        };
        let mut mono = vec![0.0f32; PACKET];
        let mut finished = false;
        for slot in mono.iter_mut() {
            if state.position >= samples.len() {
                if state.looping {
                    state.position = 0;
                } else {
                    finished = true;
                    break;
                }
            }
            *slot = samples[state.position] as f32 / 32_768.0;
            state.position += 1;
        }
        if finished && state.position >= samples.len() && mono.iter().all(|s| *s == 0.0) {
            self.sound_voices.remove(&key);
            self.hrtf_voices.remove(&format!("snd:{key}"));
            return PackedVector2Array::new();
        }
        self.spatialize(&format!("snd:{key}"), &mono, x, y, z, gain, hrtf)
    }
    /// O HRTF esta pronto para uso? Cria o modelo de cabeca na primeira chamada.
    #[func]
    fn hrtf_available(&mut self) -> bool {
        self.ensure_hrtf()
    }

    /// De onde vem as respostas de cabeca em uso: "modelo" ou o caminho do arquivo carregado.
    #[func]
    fn hrtf_source(&self) -> GString {
        GString::from(self.hrtf.as_ref().map(|h| h.source.as_str()).unwrap_or(""))
    }

    /// Usa uma esfera HRIR de arquivo (formato do crate `hrtf`, como as da base IRCAM) no lugar do
    /// modelo. Devolve false se o arquivo nao serve; o modelo continua valendo.
    #[func]
    fn load_hrir_file(&mut self, path: GString) -> bool {
        let Ok(sphere) = HrirSphere::from_file(path.to_string(), RATE) else {
            return false;
        };
        let mut engine = HrtfEngine {
            processor: HrtfProcessor::new(sphere, PACKET),
            flip_x: false,
            source: path.to_string(),
        };
        engine.flip_x = !right_is_louder(&mut engine.processor);
        self.hrtf = Some(engine);
        self.hrtf_voices.clear();
        true
    }
    #[func]
    fn drop_peer(&mut self, peer: GString) {
        let key = peer.to_string();
        self.decoders.remove(&key);
        self.hrtf_voices.remove(&key);
    }

    #[func]
    fn reset(&mut self) {
        self.pending.clear();
        self.phase = 0.0;
        self.last = 0.0;
        self.level = 0.0;
        self.decoders.clear();
        self.hrtf_voices.clear();
    }
}
