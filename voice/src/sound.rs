//! Decodifica um arquivo de audio (OGG Vorbis, MP3 ou WAV) para mono, 48 kHz, 16 bits. Os sons da
//! cena passam por aqui para serem posicionados pelo mesmo caminho da voz (HRTF ou pan), sem
//! depender do audio 3D do Godot. Mono porque a fonte vira um ponto no espaco.

use std::io::Cursor;

use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

pub const RATE: u32 = 48_000;

/// Os bytes do arquivo viram amostras mono a 48 kHz, ou `None` se o formato nao for reconhecido.
pub fn decode_mono_48k(bytes: &[u8]) -> Option<Vec<i16>> {
    let source = MediaSourceStream::new(Box::new(Cursor::new(bytes.to_vec())), Default::default());
    let probed = symphonia::default::get_probe()
        .format(&Hint::new(), source, &FormatOptions::default(), &MetadataOptions::default())
        .ok()?;
    let mut format = probed.format;
    let track = format.default_track()?.clone();
    let source_rate = track.codec_params.sample_rate?;
    let mut decoder =
        symphonia::default::get_codecs().make(&track.codec_params, &DecoderOptions::default()).ok()?;

    let mut mono: Vec<f32> = Vec::new();
    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(_) => break,
        };
        if packet.track_id() != track.id {
            continue;
        }
        match decoder.decode(&packet) {
            Ok(decoded) => {
                let spec = *decoded.spec();
                let channels = spec.channels.count().max(1);
                let mut buffer = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
                buffer.copy_interleaved_ref(decoded);
                for frame in buffer.samples().chunks(channels) {
                    mono.push(frame.iter().sum::<f32>() / channels as f32);
                }
            }
            Err(Error::DecodeError(_)) => continue, // um quadro ruim nao derruba o arquivo
            Err(_) => break,
        }
    }
    if mono.is_empty() {
        return None;
    }
    Some(resample(&mono, source_rate).iter().map(|s| (s.clamp(-1.0, 1.0) * 32_767.0) as i16).collect())
}

/// Reamostragem linear para 48 kHz (suficiente para ambiencia e efeitos).
fn resample(samples: &[f32], from: u32) -> Vec<f32> {
    if from == RATE {
        return samples.to_vec();
    }
    let ratio = from as f64 / RATE as f64;
    let out_len = (samples.len() as f64 / ratio) as usize;
    (0..out_len)
        .map(|i| {
            let at = i as f64 * ratio;
            let index = at as usize;
            let frac = (at - index as f64) as f32;
            let a = samples[index];
            let b = *samples.get(index + 1).unwrap_or(&a);
            a + (b - a) * frac
        })
        .collect()
}
