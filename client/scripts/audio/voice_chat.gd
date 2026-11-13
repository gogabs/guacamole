extends Node
## Chat de voz posicional. O Godot captura e toca; a extensão em Rust (VoiceCodec) tira o ruído
## com RNNoise e comprime em Opus. O servidor só repassa os pacotes.
##
## A posição das vozes simula uma mesa redonda: todos sentam em volta dela na ordem de entrada na
## mesa (a mesma lista para todos), e cada um ouve os outros da direção e da distância em que eles
## estariam, de frente para o centro. Quem senta ao lado soa de lado; quem fica do outro lado da
## mesa soa à frente, um pouco mais baixo. O pan é aplicado aos próprios pacotes (ganho esquerdo e
## direito), então não depende de janela nem de câmera.
##
## Enviar: segure F4 (push-to-talk) ou deixe sempre ativo, que manda tudo o que o microfone capta
## (sem filtro de nível: um filtro cortaria microfones baixos).
## Escutar sempre funciona, mesmo com o próprio microfone desligado.

signal speakers_changed
## O modo de posicionamento mudou (hrtf, pan ou off): os sons da cena seguem o mesmo modo.
signal spatial_changed(mode: String)
## O que o microfone captou neste quadro (antes de qualquer filtro), para quem também ouve o microfone.
signal mic_frames(frames: PackedVector2Array)

const PTT_KEY := KEY_F4
const BUS := "VozCaptura"
const RATE := 48000
const BUFFER := 0.5  # segundos do gerador de áudio de cada voz
const FRAME_SAMPLES := 960  # 20 ms a 48 kHz
const MAX_QUEUE := 0.45  # segundos de voz esperando para tocar; acima disso descarta
## Colchão contra a chegada irregular dos pacotes, em segundos: começa no mínimo e cresce a cada
## esvaziamento no meio da fala, até o máximo; encolhe de volta depois de um silêncio.
const CUSHION_MIN := 0.06
const CUSHION_MAX := 0.24
const CUSHION_STEP := 0.04
const MID_SPEECH_MS := 150
const SILENCE_MS := 1500
const SPEAKING_FOR := 0.4
const SETTINGS := "user://voz.cfg"
const MODE_NAMES := {"off": "desligado", "ptt": "push-to-talk", "open": "sempre ativo"}
const MODE_ORDER := ["off", "ptt", "open"]
const SPATIAL_NAMES := {
	"hrtf": "HRTF, para fones",
	"pan": "pan simples",
	"off": "desligada, todas no centro",
}
const SPATIAL_ORDER := ["hrtf", "pan", "off"]
## Esfera de respostas de cabeça opcional (formato do crate hrtf, como as da base IRCAM): se o
## arquivo existir, vale no lugar do modelo embutido.
const HRIR_FILE := "user://hrir.bin"

## off | ptt | open. Sempre começa desligado: ninguém abre o microfone sem querer.
var mode := "off"
var suppress := true
## Normalização: leva o volume do próprio microfone a um nível constante (sobe os baixos).
var normalize := true
var announce := false
## Como a voz é posicionada na mesa redonda: "hrtf" (fones), "pan" (esquerda e direita) ou "off".
var spatial := "pan"
var volume := 1.0
var transmitting := false

var _client: Node
var _codec: RefCounted
var _capture: AudioEffectCapture
var _mic: AudioStreamPlayer
var _peers: Dictionary = {}  # nome -> {player, playback, heard}
var _speaking: Dictionary = {}  # nome -> true enquanto fala
var _talking := false
var _mic_listeners := 0


func setup(client: Node) -> void:
	_client = client


func _ready() -> void:
	if ClassDB.class_exists("VoiceCodec"):
		_codec = ClassDB.instantiate("VoiceCodec")
	_load_settings()
	if _codec != null:
		_codec.set_suppression(suppress)
		_codec.set_normalization(normalize)
		if FileAccess.file_exists(HRIR_FILE):
			_codec.load_hrir_file(ProjectSettings.globalize_path(HRIR_FILE))
		elif spatial == "hrtf":
			_codec.hrtf_available()
	_client.voice_received.connect(_on_voice)
	_client.presence_changed.connect(_on_presence)


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
	normalize = bool(file.get_value("voz", "normalizar", true))
	announce = bool(file.get_value("voz", "avisar", false))
	spatial = str(file.get_value("voz", "espacial", "pan" if bool(file.get_value("voz", "posicional", true)) else "off"))
	if not SPATIAL_ORDER.has(spatial):
		spatial = "pan"
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
	file.set_value("voz", "normalizar", normalize)
	file.set_value("voz", "avisar", announce)
	file.set_value("voz", "espacial", spatial)
	file.set_value("voz", "volume", volume)
	file.set_value("voz", "entrada", AudioServer.input_device)
	file.set_value("voz", "saida", AudioServer.output_device)
	file.save(SETTINGS)


func set_mode(value: String) -> void:
	if value == mode or not available():
		return
	mode = value
	_talking = false
	_sync_mic()


## Quem quer ouvir o microfone sem transmitir (o ditado) pede e devolve com isto; o microfone só
## fica aberto enquanto a voz ou alguém precisar dele.
func listen_to_mic(on: bool) -> void:
	_mic_listeners = maxi(0, _mic_listeners + (1 if on else -1))
	_sync_mic()


func _sync_mic() -> void:
	if not available():
		return
	if mode != "off" or _mic_listeners > 0:
		_start_mic()
	else:
		_stop_mic()


func cycle_mode() -> void:
	set_mode(MODE_ORDER[(MODE_ORDER.find(mode) + 1) % MODE_ORDER.size()])


func set_suppression(on: bool) -> void:
	suppress = on
	if _codec != null:
		_codec.set_suppression(on)
	_save_settings()


func set_normalization(on: bool) -> void:
	normalize = on
	if _codec != null:
		_codec.set_normalization(on)
	_save_settings()


## O ganho que a normalização aplica agora, em dB (0 se desligada).
func gain_db() -> float:
	return _codec.gain_db() if _codec != null and normalize else 0.0


func set_announce(on: bool) -> void:
	announce = on
	_save_settings()


func set_spatial(value: String) -> void:
	if SPATIAL_ORDER.has(value):
		spatial = value
		if value == "hrtf" and _codec != null:
			_codec.hrtf_available()  # monta o modelo agora, e não no meio da primeira fala
		_save_settings()
		spatial_changed.emit(value)


func cycle_spatial() -> void:
	set_spatial(SPATIAL_ORDER[(SPATIAL_ORDER.find(spatial) + 1) % SPATIAL_ORDER.size()])


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
	if _mic != null:
		_stop_mic()
		_sync_mic()


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


func _process(_delta: float) -> void:
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
	mic_frames.emit(frames)
	if not talking:
		transmitting = false
		return
	feed(frames)


## Codifica o que o microfone captou e manda. Público para os testes alimentarem sem microfone.
func feed(frames: PackedVector2Array) -> void:
	if _codec == null:
		return
	var packets: Array = _codec.encode(frames)
	transmitting = true
	for packet in packets:
		_client.send_voice(packet)


# --- Vozes dos outros -----------------------------------------------------------------------------

func _on_voice(peer: String, packet: PackedByteArray) -> void:
	if _codec == null or peer == str(_client.you.get("name", "")):
		return
	var pcm: PackedVector2Array
	var place := _placement(peer)
	if spatial == "hrtf" and not place.is_empty():
		var direction: Vector3 = place["direction"]
		pcm = _codec.decode_hrtf(peer, packet, direction.x, direction.y, direction.z, place["closeness"])
	else:
		var gains := gains_for(peer)
		pcm = _codec.decode(peer, packet, gains.x, gains.y)
	if pcm.is_empty():
		return
	var voice := _voice_of(peer)
	var now := Time.get_ticks_msec()
	var playback: AudioStreamGeneratorPlayback = voice["playback"]
	var queued := int(BUFFER * RATE) - playback.get_frames_available()
	if float(queued) / RATE > MAX_QUEUE:
		return
	# Os pacotes chegam em rajadas (a rede e o ritmo dos quadros do jogo), mas o som sai num ritmo
	# fixo. Sem folga, cada atraso vira um corte. Quando a fila esvazia, antes do próximo pacote vai
	# um pouco de silêncio que serve de colchão; se esvaziar no meio de uma fala, o colchão cresce.
	if queued < FRAME_SAMPLES:
		var mid_speech := now - int(voice["heard"]) < MID_SPEECH_MS and int(voice["heard"]) > 0
		if mid_speech:
			voice["cushion"] = minf(float(voice["cushion"]) + CUSHION_STEP, CUSHION_MAX)
		elif now - int(voice["heard"]) > SILENCE_MS:
			voice["cushion"] = maxf(float(voice["cushion"]) - CUSHION_STEP, CUSHION_MIN)
		var padding := PackedVector2Array()
		padding.resize(int(float(voice["cushion"]) * RATE))
		playback.push_buffer(padding)
	voice["heard"] = now
	playback.push_buffer(pcm)


func _voice_of(peer: String) -> Dictionary:
	if _peers.has(peer):
		return _peers[peer]
	var stream := AudioStreamGenerator.new()
	stream.mix_rate = RATE
	stream.buffer_length = BUFFER
	var player := AudioStreamPlayer.new()
	player.stream = stream
	player.volume_db = _db()
	add_child(player)
	player.play()
	var voice := {"player": player, "playback": player.get_stream_playback(), "heard": 0, "cushion": CUSHION_MIN}
	_peers[peer] = voice
	return voice


## Ganho (esquerdo, direito) com que peer é ouvido, pela posição dele na mesa redonda.
func gains_for(peer: String) -> Vector2:
	var place := _placement(peer)
	if spatial == "off" or place.is_empty():
		return Vector2.ONE
	return table_gains(place["me"], place["other"], place["count"])


## Onde peer está na mesa em relação a quem ouve: {me, other, count, direction, closeness}, ou vazio
## se um dos dois não está na lista de jogadores.
func _placement(peer: String) -> Dictionary:
	var names: Array = []
	for player in _client.players:
		names.append(str(player["name"]))
	var me := names.find(str(_client.you.get("name", "")))
	var other := names.find(peer)
	if me < 0 or other < 0 or names.size() < 2 or me == other:
		return {}
	return {
		"me": me, "other": other, "count": names.size(),
		"direction": table_direction(me, other, names.size()),
		"closeness": table_closeness(me, other, names.size()),
	}


## Mesa redonda: count pessoas em volta, me e other são os lugares (0 a count-1). Quem ouve
## está na base do círculo, de frente para o centro; o lugar seguinte na lista fica à esquerda, o
## anterior à direita. Devolve o ganho (esquerdo, direito): o pan pelo lado em que a pessoa está e
## uma queda suave com a distância (quem está do outro lado da mesa chega a 65%).
static func table_gains(me: int, other: int, count: int) -> Vector2:
	if count < 2 or me == other:
		return Vector2.ONE
	var offset := _table_offset(me, other, count)
	var pan := clampf(offset.x / maxf(offset.length(), 0.0001), -1.0, 1.0)
	var angle := (pan + 1.0) * PI / 4.0
	return Vector2(minf(1.0, sqrt(2.0) * cos(angle)), minf(1.0, sqrt(2.0) * sin(angle))) * table_closeness(me, other, count)


## A direção da cabeça de quem ouve até other: x para a direita, y para cima, z para a frente.
static func table_direction(me: int, other: int, count: int) -> Vector3:
	if count < 2 or me == other:
		return Vector3(0, 0, 1)
	var offset := _table_offset(me, other, count)
	return Vector3(offset.x, 0.0, -offset.y).normalized()


## O volume pela distância: 1 ao lado, 0,65 do outro lado da mesa.
static func table_closeness(me: int, other: int, count: int) -> float:
	if count < 2 or me == other:
		return 1.0
	return 1.0 - 0.35 * clampf(_table_offset(me, other, count).length() / 2.0, 0.0, 1.0)


## De quem ouve (na base da mesa, de frente para o centro) até other, em raios da mesa; para a frente é -y.
static func _table_offset(me: int, other: int, count: int) -> Vector2:
	var phi := TAU * float(other - me) / float(count)
	return Vector2(-sin(phi), cos(phi) - 1.0)


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
