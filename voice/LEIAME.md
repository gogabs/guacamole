# Extensão de voz (Rust)

Codec de voz (RNNoise e Opus), posicionamento (HRTF), decodificação dos sons da cena e transcrição
de fala (Whisper). Vira `guacamole_voice.dll`, que o Godot carrega como GDExtension.

## Compilar (Windows)

Precisa de Rust, CMake e do libclang (o `whisper-rs-sys` gera as ligações com o bindgen):

```powershell
$env:LIBCLANG_PATH = "<pasta com libclang.dll>"   # ex.: o pacote `libclang` do PyPI, ou o LLVM
$env:CMAKE_POLICY_VERSION_MINIMUM = "3.5"          # o Opus usa um CMake antigo
cargo build --release
Copy-Item target\release\guacamole_voice.dll ..\client\addons\guacamole_voice\bin\
```

`.cargo/config.toml` liga o runtime estático e compila o Whisper para AVX2 (sem otimizar para a CPU
de quem compila, porque o pacote roda em outros computadores).

## Modelo do Whisper

Não vai no repositório nem no pacote. O app baixa o `ggml-base.bin` (cerca de 142 MB, de
`huggingface.co/ggerganov/whisper.cpp`) para `user://modelos/` quando a pessoa pede, na região Áudio.
