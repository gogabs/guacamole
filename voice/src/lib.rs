//! Codec de voz do Guacamole: reduz ruido (RNNoise) e comprime em Opus.
//!
//! O Godot captura e toca o audio; esta extensao so transforma. Tudo trabalha em mono,
//! 48 kHz, quadros de 20 ms (480 amostras), o que o RNNoise e o Opus esperam.

use std::collections::HashMap;

use godot::prelude::*;
use nnnoiseless::DenoiseState;
use opus::{Application, Channels, Decoder, Encoder};

const RATE: u32 = 48_000;
const FRAME: usize = 480;
const MAX_PACKET: usize = 400;

struct GuacamoleVoice;

#[gdextension]
unsafe impl ExtensionLibrary for GuacamoleVoice {}

#[derive(GodotClass)]
#[class(base = RefCounted)]
struct VoiceCodec {
    input_rate: f64,
    suppress: bool,
    denoise: Box<DenoiseState<'static>>,
    encoder: Encoder,
    /// Amostras mono ja reamostradas a 48 kHz, esperando completar um quadro.
    pending: Vec<f32>,
    /// Posicao fracionaria entre a ultima amostra de entrada e a proxima de saida.
    phase: f64,
    last: f32,
    level: f32,
    decoders: HashMap<String, Decoder>,
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
            denoise: DenoiseState::new(),
            encoder,
            pending: Vec::new(),
            phase: 0.0,
            last: 0.0,
            level: 0.0,
            decoders: HashMap::new(),
            base,
        }
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

    /// Volume (0 a 1) do ultimo quadro enviado, depois da supressao.
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
        while self.pending.len() - taken >= FRAME {
            let mut input = [0.0f32; FRAME];
            for (dst, src) in input.iter_mut().zip(&self.pending[taken..taken + FRAME]) {
                *dst = src * 32_768.0;
            }
            taken += FRAME;
            let mut clean = [0.0f32; FRAME];
            if self.suppress {
                self.denoise.process_frame(&mut clean, &input);
            } else {
                clean = input;
            }
            let mut norm = [0.0f32; FRAME];
            let mut energy = 0.0f32;
            for (dst, src) in norm.iter_mut().zip(clean.iter()) {
                *dst = (src / 32_768.0).clamp(-1.0, 1.0);
                energy += *dst * *dst;
            }
            self.level = (energy / FRAME as f32).sqrt();
            let mut buf = [0u8; MAX_PACKET];
            if let Ok(n) = self.encoder.encode_float(&norm, &mut buf) {
                packets.push(&PackedByteArray::from(&buf[..n]));
            }
        }
        self.pending.drain(..taken);
        packets
    }

    /// Descodifica um pacote de `peer` para amostras estereo a 48 kHz.
    #[func]
    fn decode(&mut self, peer: GString, packet: PackedByteArray) -> PackedVector2Array {
        let key = peer.to_string();
        if !self.decoders.contains_key(&key) {
            match Decoder::new(RATE, Channels::Mono) {
                Ok(d) => {
                    self.decoders.insert(key.clone(), d);
                }
                Err(_) => return PackedVector2Array::new(),
            }
        }
        let Some(decoder) = self.decoders.get_mut(&key) else {
            return PackedVector2Array::new();
        };
        let mut pcm = [0.0f32; FRAME * 6];
        match decoder.decode_float(packet.as_slice(), &mut pcm, false) {
            Ok(n) => pcm[..n].iter().map(|s| Vector2::new(*s, *s)).collect(),
            Err(_) => PackedVector2Array::new(),
        }
    }

    #[func]
    fn drop_peer(&mut self, peer: GString) {
        self.decoders.remove(&peer.to_string());
    }

    #[func]
    fn reset(&mut self) {
        self.pending.clear();
        self.phase = 0.0;
        self.last = 0.0;
        self.level = 0.0;
        self.decoders.clear();
    }
}
