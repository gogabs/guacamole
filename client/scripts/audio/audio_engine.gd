extends Node
## Toca o áudio da cena ativa: ambiência e música que o anfitrião ligou, e os efeitos que ele
## dispara. Tudo o que está numa zona é posicional e passa pelo mesmo caminho da voz: a extensão em
## Rust decodifica o arquivo (OGG, MP3 ou WAV, mono), posiciona cada bloco de 20 ms (HRTF ou pan) e
## o Godot só toca o resultado. Nada depende do áudio 3D do Godot. Sons soltos, sem zona, tocam
## direto pelo Godot, em estéreo.
##
## O grid vira um chão de METERS_PER_CELL metros por célula, visto de cima (o alto do grid fica à
## frente de quem ouve). Quem ouve fica no centro da sua zona ("Onde ouço os sons da cena") ou no
## centro do grid. O volume cai de forma suave com a distância. O resto é o estado do servidor: o
## card diz se toca e desde quando (no relógio do servidor), e quem entra depois cai no ponto certo.

const CELL := 100.0
## Quanto vale uma célula do grid no espaço do áudio, em metros.
const METERS_PER_CELL := 1.5
## O volume cai de forma suave com a distância: de 100% ao lado a FAR_GAIN a FAR_METERS ou mais.
const FAR_METERS := 12.0
const FAR_GAIN := 0.55
const RATE := 48000
const BUFFER := 0.5  # segundos do gerador de cada som posicional
const TARGET_QUEUE := 0.3  # quanto áudio já posicionado fica na frente do que toca

## Volume geral só de quem ouve, de 0 a 1.
var master := 1.0
## Zona (local) de onde esta pessoa ouve; vazio é o centro do grid.
var listener_zone := ""
## Como posicionar os sons: "hrtf", "pan" ou "off" (todos no centro). Vem do modo da voz.
var spatial := "pan"

var _client: Node
var _codec: RefCounted
var _voices: Dictionary = {}  # id do card -> {player, playback, key, started, positional, ended}
var _shots: Array = []  # efeitos posicionais tocando: {player, playback, key, spot, volume, ended}
var _decoding: Dictionary = {}  # id da mídia -> true enquanto a extensão decodifica
var _failed: Dictionary = {}  # id da mídia -> true se o decodificador não entendeu o arquivo
var _shot_count := 0


func setup(client: Node) -> void:
	_client = client


func _ready() -> void:
	if ClassDB.class_exists("VoiceCodec"):
		_codec = ClassDB.instantiate("VoiceCodec")
	_client.scene_changed.connect(func(_scene: Dictionary) -> void: sync())
	_client.media_ready.connect(func(_id: String) -> void: sync())
	_client.audio_fired.connect(_fire)


func _exit_tree() -> void:
	for id in _voices.keys():
		_drop(str(id))
	for shot in _shots:
		_end_shot(shot)
	_shots.clear()


func has_voice(card_id: String) -> bool:
	return _voices.has(card_id)


func is_positional(card_id: String) -> bool:
	return _voices.has(card_id) and _voices[card_id]["positional"]


func set_master(value: float) -> void:
	master = clampf(value, 0.0, 1.0)
	sync()


func set_listener_zone(zone_id: String) -> void:
	listener_zone = zone_id
	sync()


func set_spatial(mode: String) -> void:
	spatial = mode


## Onde fica uma zona da cena ativa (ou o centro do grid, se não existir).
func spot_of(zone_id: String) -> Vector2:
	var scene := _active()
	var at: Variant = _zone_position(scene, zone_id) if not zone_id.is_empty() else null
	return at if at != null else _grid_center(scene)


# --- Cena -----------------------------------------------------------------------------------------

func _active() -> Dictionary:
	for scene in _client.scene.get("scenes", []):
		if scene["id"] == _client.scene.get("activeId"):
			return scene
	return {}


func _card(card_id: String) -> Dictionary:
	for card in _active().get("cards", []):
		if card["id"] == card_id:
			return card
	return {}


func _zone_position(scene: Dictionary, zone_id: Variant) -> Variant:
	for zone in scene.get("zones", []):
		if zone["id"] == zone_id and not (zone["cells"] as Array).is_empty():
			var sum := Vector2.ZERO
			for cell in zone["cells"]:
				sum += Vector2((float(cell["x"]) + 0.5) * CELL, (float(cell["y"]) + 0.5) * CELL)
			return sum / float((zone["cells"] as Array).size())
	return null


## Onde o card soa: o ponto exato que o anfitrião deu dentro da zona, senão o centro dela.
func _card_spot(scene: Dictionary, card: Dictionary) -> Variant:
	var at: Variant = card.get("at")
	if at is Dictionary and card.get("zoneId") != null:
		return Vector2(float(at["x"]), float(at["y"])) * CELL
	return _zone_position(scene, card.get("zoneId"))


func _grid_center(scene: Dictionary) -> Vector2:
	var grid: Dictionary = scene.get("grid", {"cols": 8, "rows": 6})
	return Vector2(float(grid["cols"]), float(grid["rows"])) * CELL / 2.0


func _listener_position(scene: Dictionary) -> Vector2:
	var at: Variant = _zone_position(scene, listener_zone) if not listener_zone.is_empty() else null
	return at if at != null else _grid_center(scene)


## Para onde olhar e com que volume ouvir uma fonte em `spot` (pixels do grid), de quem está em
## `listener`: {direction, closeness}. A direção é x à direita, y para cima, z à frente.
func placement(listener: Vector2, spot: Vector2) -> Dictionary:
	var offset := spot - listener
	var direction := Vector3(offset.x, 0.0, -offset.y)
	direction = direction.normalized() if direction.length() > 0.001 else Vector3(0, 0, 1)
	var meters := offset.length() / CELL * METERS_PER_CELL
	return {
		"direction": direction if spatial != "off" else Vector3(0, 0, 1),
		"closeness": lerpf(1.0, FAR_GAIN, clampf(meters / FAR_METERS, 0.0, 1.0)),
	}


## Põe as vozes em dia com a cena: liga o que deve tocar e desliga o resto.
func sync() -> void:
	var scene := _active()
	var wanted: Dictionary = {}
	for card in scene.get("cards", []):
		var audio: Variant = card.get("audio")
		if audio is Dictionary and audio["playing"] and audio["mode"] != "effect":
			wanted[str(card["id"])] = card
	for id in _voices.keys():
		if not wanted.has(id):
			_drop(str(id))
	if scene.is_empty():
		return
	for id in wanted:
		_ensure(scene, wanted[id])


func _ensure(scene: Dictionary, card: Dictionary) -> void:
	var audio: Dictionary = card["audio"]
	var id := str(card["id"])
	var media_id := str(card.get("mediaId"))
	var spot: Variant = _card_spot(scene, card)
	var positional: bool = spot != null and _codec != null and not _failed.has(media_id)
	var voice: Variant = _voices.get(id)
	if voice != null and (voice["started"] != audio["startedAt"] or voice["positional"] != positional):
		_drop(id)
		voice = null
	if voice == null:
		voice = _start(card, positional)
		if voice == null:
			return  # ainda baixando ou decodificando; media_ready ou a decodificação chamam sync de novo
		_voices[id] = voice
	if not voice["positional"]:
		(voice["player"] as AudioStreamPlayer).volume_db = _db(audio)


func _start(card: Dictionary, positional: bool) -> Variant:
	var audio: Dictionary = card["audio"]
	var media_id := str(card.get("mediaId"))
	var offset := 0.0
	if audio["startedAt"] != null:
		offset = maxf(0.0, (_client.server_ms() - float(audio["startedAt"])) / 1000.0)
	if positional:
		if not _codec.sound_has(media_id):
			_decode(media_id)
			return null
		var length: float = _codec.sound_length(media_id)
		if length > 0.0 and audio["loop"]:
			offset = fposmod(offset, length)
		var key := str(card["id"])
		var playing: bool = _codec.voice_start(key, media_id, offset, audio["loop"])
		var made := _make_player()
		made["key"] = key
		made["started"] = audio["startedAt"]
		made["positional"] = true
		made["ended"] = not playing
		return made
	var stream: AudioStream = _client.media_stream(media_id)
	if stream == null:
		return null  # ainda baixando
	var source := stream.duplicate() as AudioStream
	_set_loop(source, audio["loop"])
	var length := source.get_length()
	if length > 0.0:
		if audio["loop"]:
			offset = fposmod(offset, length)
		elif offset >= length:
			offset = -1.0
	var player := AudioStreamPlayer.new()
	player.stream = source
	add_child(player)
	if offset >= 0.0:
		player.play(offset)
	return {"player": player, "started": audio["startedAt"], "positional": false}


## Um tocador que recebe o áudio já posicionado, bloco a bloco.
func _make_player() -> Dictionary:
	var stream := AudioStreamGenerator.new()
	stream.mix_rate = RATE
	stream.buffer_length = BUFFER
	var player := AudioStreamPlayer.new()
	player.stream = stream
	add_child(player)
	player.play()
	return {"player": player, "playback": player.get_stream_playback()}


## Pede à extensão para decodificar a mídia numa thread dela (arquivos grandes travariam o jogo);
## `_collect_decoded` junta o resultado e chama sync.
func _decode(media_id: String) -> void:
	if _decoding.has(media_id) or _failed.has(media_id):
		return
	var bytes: PackedByteArray = _client.media_bytes(media_id)
	if bytes.is_empty():
		return  # ainda baixando; media_ready chama sync
	_decoding[media_id] = true
	_codec.sound_decode_start(media_id, bytes)

func _process(_delta: float) -> void:
	_collect_decoded()
	if _codec == null:
		return
	var scene := _active()
	if scene.is_empty():
		return
	var listener := _listener_position(scene)
	for id in _voices.keys():
		var voice: Dictionary = _voices[id]
		if not voice["positional"] or voice["ended"]:
			continue
		var card := _card(str(id))
		var spot: Variant = _card_spot(scene, card)
		if spot == null or not card.get("audio") is Dictionary:
			continue
		if _pump(voice, listener, spot, float(card["audio"]["volume"]) / 100.0):
			voice["ended"] = true
	for i in range(_shots.size() - 1, -1, -1):
		var shot: Dictionary = _shots[i]
		if not shot["ended"]:
			if _pump(shot, listener, shot["spot"], shot["volume"]):
				shot["ended"] = true
		elif _drained(shot):
			_end_shot(shot)
			_shots.remove_at(i)


## Enche o gerador do tocador com blocos posicionados até TARGET_QUEUE; true quando o som acabou.
func _pump(voice: Dictionary, listener: Vector2, spot: Vector2, volume: float) -> bool:
	var playback: AudioStreamGeneratorPlayback = voice["playback"]
	var placed := placement(listener, spot)
	var direction: Vector3 = placed["direction"]
	var gain: float = volume * master * float(placed["closeness"])
	while float(int(BUFFER * RATE) - playback.get_frames_available()) / RATE < TARGET_QUEUE:
		var block: PackedVector2Array = _codec.voice_render(voice["key"], direction.x, direction.y, direction.z, gain, spatial == "hrtf")
		if block.is_empty():
			return true
		playback.push_buffer(block)
	return false


func _drained(voice: Dictionary) -> bool:
	return (voice["playback"] as AudioStreamGeneratorPlayback).get_frames_available() >= int(BUFFER * RATE) - 64


## Junta o que a extensão terminou de decodificar.
func _collect_decoded() -> void:
	for media_id in _decoding.keys():
		var state: int = _codec.sound_poll(media_id)
		if state == 0:
			continue
		_decoding.erase(media_id)
		if state < 0:
			_failed[media_id] = true  # cai no tocador comum do Godot, sem posição
		sync()

func _drop(card_id: String) -> void:
	var voice: Variant = _voices.get(card_id)
	_voices.erase(card_id)
	if voice == null:
		return
	if voice["positional"] and _codec != null:
		_codec.voice_stop(voice["key"])
	if is_instance_valid(voice["player"]):
		(voice["player"] as Node).queue_free()


func _end_shot(shot: Dictionary) -> void:
	if _codec != null:
		_codec.voice_stop(shot["key"])
	if is_instance_valid(shot["player"]):
		(shot["player"] as Node).queue_free()


func _db(audio: Dictionary) -> float:
	return linear_to_db(maxf(0.0001, float(audio["volume"]) / 100.0 * master))


func _set_loop(stream: AudioStream, on: bool) -> void:
	if stream is AudioStreamOggVorbis:
		stream.loop = on
	elif stream is AudioStreamMP3:
		stream.loop = on
	elif stream is AudioStreamWAV:
		stream.loop_mode = AudioStreamWAV.LOOP_FORWARD if on else AudioStreamWAV.LOOP_DISABLED
		if on:
			stream.loop_begin = 0
			stream.loop_end = int(stream.get_length() * stream.mix_rate)


# --- Efeitos -----------------------------------------------------------------------------------

func _fire(card_id: String) -> void:
	var card := _card(card_id)
	var audio: Variant = card.get("audio")
	if not audio is Dictionary:
		return
	var media_id := str(card.get("mediaId"))
	var spot: Variant = _card_spot(_active(), card)
	if spot != null and _codec != null and _codec.sound_has(media_id):
		_shot_count += 1
		var key := "fx:%d" % _shot_count
		if _codec.voice_start(key, media_id, 0.0, false):
			var shot := _make_player()
			shot["key"] = key
			shot["spot"] = spot
			shot["volume"] = float(audio["volume"]) / 100.0
			shot["ended"] = false
			_shots.append(shot)
		return
	# Sem zona (ou ainda sem decodificar): toca direto, e já prepara o próximo disparo.
	if spot != null and _codec != null:
		_decode(media_id)
	var stream: AudioStream = _client.media_stream(media_id)
	if stream == null:
		return
	var one_shot := stream.duplicate() as AudioStream
	_set_loop(one_shot, false)
	var player := AudioStreamPlayer.new()
	player.stream = one_shot
	player.volume_db = _db(audio)
	add_child(player)
	player.finished.connect(player.queue_free)
	player.play()
