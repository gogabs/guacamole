extends Node
## Sons gerados por código (sem arquivos de áudio). Cada tipo de componente e cada
## tipo de anúncio tem timbre próprio, para dar para reconhecer a interface de ouvido.

const RATE := 44100

var _sounds: Dictionary = {}
var _players: Array[AudioStreamPlayer] = []
var _next := 0


func _ready() -> void:
	for i in 10:
		var player := AudioStreamPlayer.new()
		add_child(player)
		_players.append(player)

	# Foco: um timbre por tipo de componente.
	_define("focus_button", [660.0], 0.07, "sine", 0.35)
	_define("focus_field", [440.0, 523.0], 0.09, "tri", 0.4)
	_define("key", [900.0], 0.03, "sine", 0.2)

	# Ações.
	_define("activate", [660.0, 880.0], 0.12, "sine", 0.4)
	_define("open_input", [520.0, 780.0], 0.12, "tri", 0.45)
	_define("close_input", [780.0, 520.0], 0.12, "tri", 0.4)
	_define("error", [220.0, 165.0], 0.22, "square", 0.22)

	# Histórico: o "tick" é tocado com pitch variando conforme a posição.
	_define("tick", [1000.0], 0.035, "sine", 0.3)
	_define("edge", [160.0], 0.14, "sine", 0.5)

	# Anúncios automáticos.
	_define("msg_in", [880.0, 1175.0], 0.15, "sine", 0.4)
	_define("msg_out", [660.0], 0.08, "sine", 0.35)
	_define("roll", [900.0, 700.0, 820.0, 600.0, 760.0, 520.0, 680.0], 0.32, "square", 0.2)
	_define("safety", [330.0, 262.0, 330.0, 262.0], 0.55, "saw", 0.4)
	_define("join", [523.0, 659.0, 784.0], 0.24, "tri", 0.4)
	_define("leave", [784.0, 659.0, 523.0], 0.24, "tri", 0.35)
	_define("connect", [440.0, 660.0, 880.0], 0.34, "sine", 0.4)


func play(sound_name: String, pitch: float = 1.0) -> void:
	var stream: AudioStream = _sounds.get(sound_name)
	if stream == null:
		return
	var player := _players[_next]
	_next = (_next + 1) % _players.size()
	player.stream = stream
	player.pitch_scale = pitch
	player.play()


func _define(sound_name: String, freqs: Array, duration: float, wave: String, volume: float) -> void:
	_sounds[sound_name] = _make_tone(freqs, duration, wave, volume)


## Notas em sequência, com ataque curto e decaimento exponencial.
func _make_tone(freqs: Array, duration: float, wave: String, volume: float) -> AudioStreamWAV:
	var count := int(RATE * duration)
	var data := PackedByteArray()
	data.resize(count * 2)
	var note_length := maxi(1, count / freqs.size())
	for i in count:
		var freq: float = freqs[mini(i / note_length, freqs.size() - 1)]
		var t := float(i) / RATE
		var phase := fmod(t * freq, 1.0)
		var sample: float
		match wave:
			"square":
				sample = 1.0 if phase < 0.5 else -1.0
			"tri":
				sample = 4.0 * absf(phase - 0.5) - 1.0
			"saw":
				sample = 2.0 * phase - 1.0
			_:
				sample = sin(TAU * phase)
		var envelope := minf(1.0, t / 0.005) * exp(-3.0 * float(i) / count)
		data.encode_s16(i * 2, int(clampf(sample * envelope * volume, -1.0, 1.0) * 32767.0))
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = RATE
	stream.stereo = false
	stream.data = data
	return stream
