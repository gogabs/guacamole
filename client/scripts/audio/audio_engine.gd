extends Node
## Toca o áudio da cena ativa: ambiência e música que o anfitrião ligou, e os efeitos que ele
## dispara. Ambiência numa zona é posicional: o grid vira um chão de METERS_PER_CELL metros por
## célula, visto de cima (o alto do grid fica à frente de quem ouve), e quem ouve fica no centro da
## sua zona ("Onde ouço os sons da cena") ou no centro do grid. A posição vai para o áudio 3D do Godot,
## que faz o pan pelo ângulo e o volume pela distância, sem depender do tamanho da janela. Tudo o
## mais é o estado do servidor: o card diz se toca e desde quando (no relógio do servidor), e quem
## entra depois cai no ponto certo.

const CELL := 100.0
## Quanto vale uma célula do grid no espaço do áudio, em metros.
const METERS_PER_CELL := 1.5
## A distância em que o volume cai à metade (modelo de distância inversa do Godot).
const UNIT_SIZE := 3.0
## O pan do Godot, de 0 a 2: acima de 1 abre mais o som para os lados.
const PANNING_STRENGTH := 1.5

## Volume geral só de quem ouve, de 0 a 1.
var master := 1.0
## Zona (local) de onde esta pessoa ouve; vazio é o centro do grid.
var listener_zone := ""

var _client: Node
var _listener: AudioListener3D
var _voices: Dictionary = {}  # id do card -> {player, started, positional, zone}


func setup(client: Node) -> void:
	_client = client


func _ready() -> void:
	_listener = AudioListener3D.new()
	add_child(_listener)
	_listener.make_current()
	_client.scene_changed.connect(func(_scene: Dictionary) -> void: sync())
	_client.media_ready.connect(func(_id: String) -> void: sync())
	_client.audio_fired.connect(_fire)


func _exit_tree() -> void:
	for id in _voices.keys():
		_drop(str(id))


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


## Onde fica uma zona da cena ativa (ou o centro do grid, se não existir): usado pela voz.
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


## Põe as vozes em dia com a cena: liga o que deve tocar, desliga o resto e ajusta volume e posição.
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
	_listener.position = _to3(_listener_position(scene))
	for id in wanted:
		_ensure(scene, wanted[id])


func _ensure(scene: Dictionary, card: Dictionary) -> void:
	var audio: Dictionary = card["audio"]
	var id := str(card["id"])
	var position: Variant = _card_spot(scene, card)
	var positional: bool = position != null
	var voice: Variant = _voices.get(id)
	if voice != null and (voice["started"] != audio["startedAt"] or voice["positional"] != positional):
		_drop(id)
		voice = null
	if voice == null:
		var stream: AudioStream = _client.media_stream(str(card.get("mediaId")))
		if stream == null:
			return  # ainda baixando; media_ready chama sync de novo
		voice = _start(scene, card, stream, positional)
		if voice == null:
			return
		_voices[id] = voice
	var player: Node = voice["player"]
	player.volume_db = _db(audio)
	if positional:
		(player as AudioStreamPlayer3D).position = _to3(position)


func _start(scene: Dictionary, card: Dictionary, source: AudioStream, positional: bool) -> Variant:
	var audio: Dictionary = card["audio"]
	var stream := source.duplicate() as AudioStream
	_set_loop(stream, audio["loop"])
	var offset := 0.0
	if audio["startedAt"] != null:
		offset = maxf(0.0, (_client.server_ms() - float(audio["startedAt"])) / 1000.0)
	var length := stream.get_length()
	if length > 0.0:
		if audio["loop"]:
			offset = fposmod(offset, length)
		elif offset >= length:
			offset = -1.0
	var player: Node
	if positional:
		var spatial := _spatial_player()
		spatial.position = _to3(_card_spot(scene, card))
		player = spatial
	else:
		player = AudioStreamPlayer.new()
	player.stream = stream
	add_child(player)
	if offset >= 0.0:
		player.call("play", offset)
	return {"player": player, "started": audio["startedAt"], "positional": positional}


## Do plano do grid (x para a direita, y para baixo) para o espaço do áudio (x direita, z para trás).
func _to3(point: Vector2) -> Vector3:
	return Vector3(point.x, 0.0, point.y) / CELL * METERS_PER_CELL


func _spatial_player() -> AudioStreamPlayer3D:
	var spatial := AudioStreamPlayer3D.new()
	spatial.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
	spatial.unit_size = UNIT_SIZE
	spatial.panning_strength = PANNING_STRENGTH
	return spatial


func _drop(card_id: String) -> void:
	var voice: Variant = _voices.get(card_id)
	_voices.erase(card_id)
	if voice != null and is_instance_valid(voice["player"]):
		(voice["player"] as Node).queue_free()


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
	var stream: AudioStream = _client.media_stream(str(card.get("mediaId")))
	if stream == null:
		return
	var scene := _active()
	var position: Variant = _card_spot(scene, card)
	var player: Node
	if position != null:
		var spatial := _spatial_player()
		spatial.position = _to3(position)
		player = spatial
	else:
		player = AudioStreamPlayer.new()
	var one_shot := stream.duplicate() as AudioStream
	_set_loop(one_shot, false)
	player.stream = one_shot
	player.set("volume_db", _db(audio))
	add_child(player)
	player.finished.connect(player.queue_free)
	player.call("play")
