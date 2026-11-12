//! Esfera de respostas de cabeça (HRIR) gerada por um modelo de cabeça esférica, no formato que o
//! crate `hrtf` lê. Sem arquivos de terceiros: o modelo dá a diferença de tempo entre os ouvidos
//! (fórmula de Woodworth) e a sombra da cabeça (o ouvido do lado de lá recebe menos e mais abafado).
//! Não tem a coloração da orelha de medidas reais; serve de base e de ponto de comparação.
//!
//! Convenção das direções: x para a direita, y para cima, z para a frente (da cabeça à fonte).

use std::collections::HashMap;

const HEAD_RADIUS: f32 = 0.0875; // m
const SOUND_SPEED: f32 = 343.0; // m/s
/// Atraso fixo de todas as respostas, em amostras, para o ouvido de perto não ficar colado no zero.
const BASE_DELAY: f32 = 8.0;

/// Os bytes de uma esfera HRIR (`HRIR`, taxa, tamanho, vértices, índices, dados) para `rate` Hz.
pub fn sphere_bytes(rate: u32, length: usize) -> Vec<u8> {
    let (vertices, faces) = icosphere(2);
    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"HRIR");
    bytes.extend_from_slice(&rate.to_le_bytes());
    bytes.extend_from_slice(&(length as u32).to_le_bytes());
    bytes.extend_from_slice(&(vertices.len() as u32).to_le_bytes());
    bytes.extend_from_slice(&((faces.len() * 3) as u32).to_le_bytes());
    for face in &faces {
        for index in face {
            bytes.extend_from_slice(&index.to_le_bytes());
        }
    }
    for v in &vertices {
        for c in v {
            bytes.extend_from_slice(&c.to_le_bytes());
        }
        let (left, right) = hrir(*v, rate as f32, length);
        for s in left.iter().chain(right.iter()) {
            bytes.extend_from_slice(&s.to_le_bytes());
        }
    }
    bytes
}

/// Respostas (esquerda, direita) para uma fonte na direção `dir` (unitária).
fn hrir(dir: [f32; 3], rate: f32, length: usize) -> (Vec<f32>, Vec<f32>) {
    let lateral = dir[0].clamp(-1.0, 1.0);
    let angle = lateral.abs().asin();
    let itd = (HEAD_RADIUS / SOUND_SPEED) * (angle + angle.sin()); // s, atraso do ouvido de longe
    let ear = |axis: f32| -> Vec<f32> {
        let facing = axis * lateral; // 1: a fonte está do lado deste ouvido; -1: do lado oposto
        let far = (1.0 - facing) / 2.0; // 0 perto, 1 longe
        let delay = BASE_DELAY + if facing < 0.0 { itd * rate } else { 0.0 };
        let cutoff = 18_000.0 - 16_200.0 * far.powf(1.5);
        let alpha = (-std::f32::consts::TAU * cutoff / rate).exp();
        let gain = 1.35 - 0.7 * far;
        let mut h = vec![0.0f32; length];
        // Passa-baixas de um polo atrasado por `delay` amostras (interpolação linear entre vizinhas).
        let whole = delay.floor() as usize;
        let frac = delay - delay.floor();
        let mut tap = (1.0 - alpha) * gain;
        for n in 0..length.saturating_sub(whole + 1) {
            h[whole + n] += tap * (1.0 - frac);
            h[whole + n + 1] += tap * frac;
            tap *= alpha;
        }
        h
    };
    (ear(-1.0), ear(1.0))
}

fn normalized(v: [f32; 3]) -> [f32; 3] {
    let len = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    [v[0] / len, v[1] / len, v[2] / len]
}

/// Icosaedro subdividido `levels` vezes, projetado na esfera unitária: vértices e faces (triângulos).
fn icosphere(levels: u32) -> (Vec<[f32; 3]>, Vec<[u32; 3]>) {
    let t = (1.0 + 5.0f32.sqrt()) / 2.0;
    let mut vertices: Vec<[f32; 3]> = [
        [-1.0, t, 0.0], [1.0, t, 0.0], [-1.0, -t, 0.0], [1.0, -t, 0.0],
        [0.0, -1.0, t], [0.0, 1.0, t], [0.0, -1.0, -t], [0.0, 1.0, -t],
        [t, 0.0, -1.0], [t, 0.0, 1.0], [-t, 0.0, -1.0], [-t, 0.0, 1.0],
    ]
    .iter()
    .map(|v| normalized(*v))
    .collect();
    let mut faces: Vec<[u32; 3]> = vec![
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    for _ in 0..levels {
        let mut cache: HashMap<(u32, u32), u32> = HashMap::new();
        let mut next = Vec::with_capacity(faces.len() * 4);
        let mut middle = |a: u32, b: u32, vertices: &mut Vec<[f32; 3]>| -> u32 {
            let key = (a.min(b), a.max(b));
            if let Some(i) = cache.get(&key) {
                return *i;
            }
            let (pa, pb) = (vertices[a as usize], vertices[b as usize]);
            vertices.push(normalized([(pa[0] + pb[0]) / 2.0, (pa[1] + pb[1]) / 2.0, (pa[2] + pb[2]) / 2.0]));
            let i = (vertices.len() - 1) as u32;
            cache.insert(key, i);
            i
        };
        for [a, b, c] in faces {
            let ab = middle(a, b, &mut vertices);
            let bc = middle(b, c, &mut vertices);
            let ca = middle(c, a, &mut vertices);
            next.extend_from_slice(&[[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]);
        }
        faces = next;
    }
    (vertices, faces)
}
