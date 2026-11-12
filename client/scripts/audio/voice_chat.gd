extends Node
## Chat de voz posicional. O Godot captura e toca; a extensão em Rust (VoiceCodec) tira o ruído
## com RNNoise e comprime em Opus. O servidor só repassa os pacotes, e cada voz toca da zona onde
## quem fala está sentado: o mesmo "Minha posição" do áudio da cena, agora compartilhado.
##
## Enviar: segure F4 (push-to-talk) ou deixe o microfone aberto, que só manda quando há voz.
## Escutar sempre funciona, mesmo com o próprio microfone desligado.

signal speakers_changed

const PTT_KEY := KEY_F4
const BUS := "VozCaptura"
const RATE := 48000
const BUFFER := 0.5  # segundos do gerador de áudio de cada voz
const MAX_QUEUE := 0.3  # segundos de voz esperando para tocar; acima disso descarta
const OPEN_GATE := 0.008  # volume mínimo para o microfone aberto enviar
const OPEN_HANG := 0.35  # segundos que o microfone aberto continua enviando depois da voz
const SPEAKING_FOR := 0.4
const SETTINGS := "user://voz.cfg"
const MODE_NAMES := {"off": "desligado", "ptt": "push-to-talk", "open": "microfone aberto"}
const MODE_ORDER := ["off", "ptt", "open"]

## off | ptt | open. Sempre começa desligado: ninguém abre o microfone sem querer.
var mode := "off"
var suppress := true
var announce := false
var volume := 1.0
var transmitting := false

var _client: Node
var _engine: Node
var _codec: RefCounted
var _capture: AudioEffectCapture
var _mic: AudioStreamPlayer
var _peers: Dictionary = {}  # nome -> {player, playback, heard}
var _speaking: Dictionary = {}  # nome -> true enquanto fala
var _hang := 0.0
var _talking := false


func setup(client: Node, engine: Node) -> void:
	_client = client
	_engine = engine


func _ready() -> void:
	if ClassDB.class_exists("VoiceCodec"):
		_codec = ClassDB.instantiate("VoiceCodec")
	_load_settings()
	if _codec != null:
		_codec.set_suppression(suppress)
	_client.voice_received.connect(_on_voice)
	_client.presence_changed.connect(_on_presence)
	_engine.listener_moved.connect(func(zone_id: String) -> void: _client.send_seat(zone_id))
	_client.welcomed.connect(func(_you: Dictionary, _room: Dictionary, _players: Array, _history: Array) -> void:
		if not _engine.listener_zone.is_empty():
			_client.send_seat(_engine.listener_zone))


func _exit_tree() -> void:
	_stop_mic()


## A extensão nativa carregou? Sem ela a voz fica indisponível, o resto do app segue.
func available() -> bool:
	return _codec != null


# --- Configuração ---------------------------------------------------------------------------------

func _load_settings() -> void:
	var file := ConfigFile.new()
	if file.load(SETTINGS) != OK:
		return
	suppress = bool(file.get_value("voz", "supressao", true))
	announce = bool(file.get_value("voz", "avisar", false))
	volume = clampf(float(file.get_value("voz", "volume", 1.0)), 0.0, 1.0)
	var input := str(file.get_value("voz", "entrada", ""))
	if not input.is_empty() and input in AudioServer.get_input_device_list():
		AudioServer.input_device = input
	var output := str(file.get_value("voz", "saida", ""))
	if not output.is_empty() and output in AudioServer.get_output_device_list():
		AudioServer.output_device = output


func _save_settings() -> void:
	var file := ConfigFile.new()
	file.set_value("voz", "supressao", suppress)
	file.set_value("voz", "avisar", announce)
	file.set_value("voz", "volume", volume)
	file.set_value("voz", "entrada", AudioServer.input_device)
	file.set_value("voz", "saida", AudioServer.output_device)
	file.save(SETTINGS)


func set_mode(value: String) -> void:
	if value == mode or not available():
		return
	mode = value
	_hang = 0.0
	_talking = false
	if mode == "off":
		_stop_mic()
	else:
		_start_mic()


func cycle_mode() -> void:
	set_mode(MODE_ORDER[(MODE_ORDER.find(mode) + 1) % MODE_ORDER.size()])


func set_suppression(on: bool) -> void:
	suppress = on
	if _codec != null:
		_codec.set_suppression(on)
	_save_settings()


func set_announce(on: bool) -> void:
	announce = on
	_save_settings()


func set_volume(value: float) -> void:
	volume = clampf(value, 0.0, 1.0)
	for name in _peers:
		_peers[name]["player"].volume_db = _db()
	_save_settings()


func input_devices() -> PackedStringArray:
	return AudioServer.get_input_device_list()


func output_devices() -> PackedStringArray:
	return AudioServer.get_output_device_list()


func set_input_device(device: String) -> void:
	AudioServer.input_device = device
	_save_settings()
	if mode != "off":
		_stop_mic()
		_start_mic()


func set_output_device(device: String) -> void:
	AudioServer.output_device = device
	_save_settings()


func _db() -> float:
	return linear_to_db(maxf(volume, 0.0001))


# --- Microfone ------------------------------------------------------------------------------------

func _start_mic() -> void:
	if _mic != null:
		return
	var index := AudioServer.get_bus_index(BUS)
	if index == -1:
		AudioServer.add_bus()
		index = AudioServer.bus_count - 1
		AudioServer.set_bus_name(index, BUS)
		AudioServer.add_bus_effect(index, AudioEffectCapture.new())
		AudioServer.set_bus_mute(index, true)  # captura sem devolver o próprio som
	_capture = AudioServer.get_bus_effect(index, 0) as AudioEffectCapture
	_mic = AudioStreamPlayer.new()
	_mic.stream = AudioStreamMicrophone.new()
	_mic.bus = BUS
	add_child(_mic)
	_mic.play()
	_codec.set_input_rate(AudioServer.get_mix_rate())


func _stop_mic() -> void:
	if _mic != null:
		_mic.stop()
		_mic.queue_free()
		_mic = null
	_capture = null
	transmitting = false


func _process(delta: float) -> void:
	_update_speaking()
	if _mic == null or _capture == null:
		return
	var talking := mode == "open" or (mode == "ptt" and Input.is_physical_key_pressed(PTT_KEY))
	if talking != _talking:
		_talking = talking
		if mode == "ptt":
			Sfx.play("tick", 1.3 if talking else 0.8)
	var frames := _capture.get_buffer(_capture.get_frames_available())
	if frames.is_empty():
		return
	if not talking:
		transmitting = false
		return
	feed(frames, delta)


## Codifica o que o microfone captou e manda. Público para os testes alimentarem sem microfone.
func feed(frames: PackedVector2Array, delta: float = 0.0) -> void:
	if _codec == null:
		return
	var packets: Array = _codec.encode(frames)
	var level: float = _codec.level()
	if mode == "open":
		_hang = OPEN_HANG if level > OPEN_GATE else maxf(0.0, _hang - delta)
		if _hang <= 0.0:
			transmitting = false
			return
	transmitting = true
	for packet in packets:
		_client.send_voice(packet)


# --- Vozes dos outros -----------------------------------------------------------------------------

func _on_voice(peer: String, packet: PackedByteArray) -> void:
	if _codec == null or peer == str(_client.you.get("name", "")):
		return
	var pcm: PackedVector2Array = _codec.decode(peer, packet)
	if pcm.is_empty():
		return
	var voice := _voice_of(peer)
	voice["heard"] = Time.get_ticks_msec()
	var playback: AudioStreamGeneratorPlayback = voice["playback"]
	var queued := int(BUFFER * RATE) - playback.get_frames_available()
	if float(queued) / RATE > MAX_QUEUE:
		return
	playback.push_buffer(pcm)


func _voice_of(peer: String) -> Dictionary:
	if _peers.has(peer):
		return _peers[peer]
	var stream := AudioStreamGenerator.new()
	stream.mix_rate = RATE
	stream.buffer_length = BUFFER
	var player := AudioStreamPlayer2D.new()
	player.stream = stream
	player.max_distance = 2600.0
	player.volume_db = _db()
	player.position = _spot(peer)
	add_child(player)
	player.play()
	var voice := {"player": player, "playback": player.get_stream_playback(), "heard": 0}
	_peers[peer] = voice
	return voice


func _spot(peer: String) -> Vector2:
	return _engine.spot_of(str(_client.seats.get(peer, "")))


func _on_presence(players: Array) -> void:
	var here: Dictionary = {}
	for player in players:
		here[str(player["name"])] = true
	for name in _peers.keys():
		if not here.has(name):
			_peers[name]["player"].queue_free()
			_peers.erase(name)
			_speaking.erase(name)
			if _codec != null:
				_codec.drop_peer(name)


func _update_speaking() -> void:
	var now := Time.get_ticks_msec()
	var changed := false
	for name in _peers:
		var voice: Dictionary = _peers[name]
		(voice["player"] as Node2D).position = _spot(name)
		var talking: bool = now - int(voice["heard"]) < int(SPEAKING_FOR * 1000.0) and int(voice["heard"]) > 0
		if talking != _speaking.has(name):
			changed = true
			if talking:
				_speaking[name] = true
				if announce:
					Speech.say("%s fala." % name, false)
			else:
				_speaking.erase(name)
	if changed:
		speakers_changed.emit()


## Quem está falando agora, por nome.
func speakers() -> Array:
	return _speaking.keys()
