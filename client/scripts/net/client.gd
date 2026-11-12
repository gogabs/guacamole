extends Node
## Cliente do servidor Guacamole: HTTP para criar/entrar em mesas e WebSocket para o jogo.
## Não conhece interface nem som; só emite sinais com os dicionários do protocolo.

signal welcomed(you: Dictionary, room: Dictionary, players: Array, history: Array)
signal entry_received(entry: Dictionary)
signal presence_changed(players: Array)
signal room_changed(room: Dictionary)
signal sheet_changed(character: Dictionary)
signal sheet_removed(character_id: String)
signal scene_changed(scene: Dictionary)
signal compendiums_changed(ids: Array)
signal compendium_item_received(compendium_id: String, item: Dictionary)
signal media_ready(media_id: String)
signal audio_fired(card_id: String)
signal seats_changed(seats: Dictionary)
signal voice_received(peer: String, packet: PackedByteArray)
signal server_error(message: String)
signal disconnected(reason: String)

var http_base := ""
var ws_base := ""
var you: Dictionary = {}
var room: Dictionary = {}
var players: Array = []
var templates: Array = []
## Estado da cena: {scenes, activeId, editors}.
var scene: Dictionary = {}
## Fichas da mesa por id.
var characters: Dictionary = {}
## Compêndios que o servidor oferece (sem conteúdo) e os ids dos que a mesa adicionou.
var catalog: Array = []
var compendiums: Array = []
## Zona em que cada participante está sentado: nome do jogador -> id da zona.
var seats: Dictionary = {}

var _items: Dictionary = {}  # "compêndio/item" -> conteúdo já recebido
var _token := ""
var _textures: Dictionary = {}  # id da mídia -> Texture2D já baixada
var _downloading: Dictionary = {}
var _streams: Dictionary = {}  # id da mídia -> AudioStream já baixado
var _clock_skew_ms := 0.0
var _ws := WebSocketPeer.new()
var _active := false
var _opened := false


## Aceita "host:porta", "ws://...", "wss://...", "http://..." ou "https://...".
static func parse_server(address: String) -> Dictionary:
	var text := address.strip_edges().rstrip("/")
	if text.is_empty():
		text = "127.0.0.1:8000"
	var secure := false
	for prefix in ["wss://", "https://"]:
		if text.begins_with(prefix):
			secure = true
			text = text.trim_prefix(prefix)
	for prefix in ["ws://", "http://"]:
		text = text.trim_prefix(prefix)
	return {
		"http": ("https://" if secure else "http://") + text,
		"ws": ("wss://" if secure else "ws://") + text,
	}


func configure(address: String) -> void:
	var parsed := parse_server(address)
	http_base = parsed["http"]
	ws_base = parsed["ws"]


func create_room(room_name: String, host_name: String) -> Dictionary:
	return await _request(HTTPClient.METHOD_POST, "/api/rooms", {"name": room_name, "hostName": host_name})


func check_join(room_id: String, player_name: String, token: String) -> Dictionary:
	var body := {"name": player_name}
	if not token.is_empty():
		body["token"] = token
	return await _request(HTTPClient.METHOD_POST, "/api/rooms/" + room_id.uri_encode(), body)


func connect_to_room(room_id: String, player_name: String, token: String = "") -> void:
	leave()
	_ws = WebSocketPeer.new()
	# O padrão (64 KB) é menor que alguns itens de compêndio, como os ativos de Ironsworn.
	_ws.inbound_buffer_size = 4 * 1024 * 1024
	var url := "%s/ws?room=%s&name=%s" % [ws_base, room_id.uri_encode(), player_name.uri_encode()]
	if not token.is_empty():
		url += "&token=" + token.uri_encode()
	_opened = false
	_token = token
	_active = _ws.connect_to_url(url) == OK
	if not _active:
		disconnected.emit("Endereço de servidor inválido.")


func is_connected_to_room() -> bool:
	return _active and _opened


func send_chat(input: String) -> void:
	_send({"type": "chat:send", "input": input})


func send_safety(action: String) -> void:
	_send({"type": "safety:signal", "action": action})


func template_for(template_id: String) -> Dictionary:
	for template in templates:
		if template["id"] == template_id:
			return template
	return {}


func create_sheet(template_id: String, sheet_name: String) -> void:
	_send({"type": "sheet:create", "templateId": template_id, "name": sheet_name})


func delete_sheet(character_id: String) -> void:
	_send({"type": "sheet:delete", "characterId": character_id})


func rename_sheet(character_id: String, new_name: String) -> void:
	_send({"type": "sheet:rename", "characterId": character_id, "name": new_name})


func describe_sheet(character_id: String, description: String) -> void:
	_send({"type": "sheet:describe", "characterId": character_id, "description": description})


## Passa a ficha para `owner`, ou pega para si quando `owner` é o próprio nome.
func assign_sheet(character_id: String, owner: String) -> void:
	_send({"type": "sheet:assign", "characterId": character_id, "owner": owner})


## `sheet` vem de SheetLibrary: {id, templateId, name, description, values}.
func import_sheet(sheet: Dictionary) -> void:
	_send({"type": "sheet:import", "sheet": sheet})


func sheet_op(character_id: String, op: Dictionary) -> void:
	_send({"type": "sheet:op", "characterId": character_id, "op": op})


func roll_field(character_id: String, field_id: String, track_id: String = "", private_roll: bool = false, edge: int = 0) -> void:
	var message := {"type": "sheet:roll", "characterId": character_id, "fieldId": field_id, "private": private_roll}
	if edge != 0:
		message["edge"] = edge
	if not track_id.is_empty():
		message["trackId"] = track_id
	_send(message)


func scene_op(op: Dictionary) -> void:
	_send({"type": "scene:op", "op": op})


func burn_momentum(character_id: String) -> void:
	_send({"type": "sheet:burn", "characterId": character_id})


func has_compendium(compendium_id: String) -> bool:
	return compendiums.has(compendium_id)


func compendium_summary(compendium_id: String) -> Dictionary:
	for summary in catalog:
		if summary["id"] == compendium_id:
			return summary
	return {}


func add_compendium(compendium_id: String) -> void:
	_send({"type": "compendium:add", "compendiumId": compendium_id})


func remove_compendium(compendium_id: String) -> void:
	_send({"type": "compendium:remove", "compendiumId": compendium_id})


## O conteúdo de um item, se já veio; senão pede e devolve vazio (o sinal avisa quando chegar).
func compendium_item(compendium_id: String, item_id: String) -> Dictionary:
	var key := "%s/%s" % [compendium_id, item_id]
	if _items.has(key):
		return _items[key]
	_send({"type": "compendium:get", "compendiumId": compendium_id, "itemId": item_id})
	return {}


## `target`: {"type": "table", "tableId"}, {"type": "combo", "comboId"} ou {"type": "odds", "threshold"}.
func roll_oracle(compendium_id: String, item_id: String, target: Dictionary, private_roll: bool = false) -> void:
	_send({
		"type": "compendium:roll",
		"compendiumId": compendium_id,
		"itemId": item_id,
		"target": target,
		"private": private_roll,
	})


## Envia um arquivo da mesa (imagem). Devolve {ok, id, message}; o id é o hash do conteúdo.
func upload_media(path: String) -> Dictionary:
	var bytes := FileAccess.get_file_as_bytes(path)
	if bytes.is_empty():
		return {"ok": false, "id": "", "message": "Não foi possível ler o arquivo."}
	var query := "?name=%s&filename=%s" % [str(you.get("name", "")).uri_encode(), path.get_file().uri_encode()]
	if not _token.is_empty():
		query += "&token=" + _token.uri_encode()
	var request := HTTPRequest.new()
	add_child(request)
	var url := "%s/api/rooms/%s/media%s" % [http_base, str(room.get("id", "")).uri_encode(), query]
	if request.request_raw(url, PackedStringArray(), HTTPClient.METHOD_POST, bytes) != OK:
		request.queue_free()
		return {"ok": false, "id": "", "message": "Não foi possível contatar o servidor."}
	var result: Array = await request.request_completed
	request.queue_free()
	if result[0] != HTTPRequest.RESULT_SUCCESS:
		return {"ok": false, "id": "", "message": "Não foi possível contatar o servidor."}
	var parsed: Variant = JSON.parse_string((result[3] as PackedByteArray).get_string_from_utf8())
	var data: Dictionary = parsed if parsed is Dictionary else {}
	var ok: bool = int(result[1]) >= 200 and int(result[1]) < 300
	return {"ok": ok, "id": str(data.get("id", "")), "message": str(data.get("message", "Erro do servidor."))}


## A imagem da mesa com esse id, se já foi baixada; senão começa a baixar e devolve null.
## `media_ready` avisa quando chegar.
func media_texture(media_id: String) -> Texture2D:
	if media_id.is_empty():
		return null
	if _textures.has(media_id):
		return _textures[media_id]
	_fetch_media(media_id)
	return null


## O áudio da mesa com esse id, se já foi baixado; senão começa a baixar e devolve null.
func media_stream(media_id: String) -> AudioStream:
	if media_id.is_empty():
		return null
	if _streams.has(media_id):
		return _streams[media_id]
	_fetch_media(media_id)
	return null


## O relógio do servidor, em milissegundos, estimado a partir do `serverTime` do welcome.
func server_ms() -> float:
	return Time.get_unix_time_from_system() * 1000.0 + _clock_skew_ms


func _fetch_media(media_id: String) -> void:
	if not _downloading.has(media_id):
		_downloading[media_id] = true
		_download_media(media_id)


func _download_media(media_id: String) -> void:
	var request := HTTPRequest.new()
	add_child(request)
	var url := "%s/api/rooms/%s/media/%s" % [http_base, str(room.get("id", "")).uri_encode(), media_id]
	if request.request(url) != OK:
		request.queue_free()
		_downloading.erase(media_id)
		return
	var result: Array = await request.request_completed
	request.queue_free()
	_downloading.erase(media_id)
	if result[0] != HTTPRequest.RESULT_SUCCESS or int(result[1]) != 200:
		return
	var bytes: PackedByteArray = result[3]
	var stream := _decode_audio(bytes)
	if stream != null:
		_streams[media_id] = stream
	else:
		var image := Image.new()
		var error := image.load_png_from_buffer(bytes)
		if error != OK:
			error = image.load_jpg_from_buffer(bytes)
		if error != OK:
			error = image.load_webp_from_buffer(bytes)
		if error != OK:
			return
		_textures[media_id] = ImageTexture.create_from_image(image)
	media_ready.emit(media_id)


## OGG, MP3 ou WAV pelos primeiros bytes; null se não for áudio.
func _decode_audio(bytes: PackedByteArray) -> AudioStream:
	if bytes.size() < 12:
		return null
	var head := bytes.slice(0, 4).get_string_from_ascii()
	if head == "OggS":
		return AudioStreamOggVorbis.load_from_buffer(bytes)
	if head == "RIFF" and bytes.slice(8, 12).get_string_from_ascii() == "WAVE":
		return AudioStreamWAV.load_from_buffer(bytes)
	if head.begins_with("ID3") or (bytes[0] == 0xFF and (bytes[1] & 0xE0) == 0xE0):
		var mp3 := AudioStreamMP3.new()
		mp3.data = bytes
		return mp3
	return null

func leave() -> void:
	_textures = {}
	_streams = {}
	_downloading = {}
	_token = ""
	if _active:
		_ws.close()
	_active = false
	_opened = false
	you = {}
	room = {}
	players = []
	templates = []
	scene = {}
	characters = {}
	catalog = []
	compendiums = []
	seats = {}
	_items = {}


## Senta numa zona da cena ("" levanta); a voz de cada um soa de onde está sentado.
func send_seat(zone_id: String) -> void:
	_send({"type": "voice:seat", "zoneId": zone_id})


## Manda um pacote de voz (Opus) para o resto da mesa.
func send_voice(packet: PackedByteArray) -> void:
	if is_connected_to_room():
		_ws.send(packet, WebSocketPeer.WRITE_MODE_BINARY)


func _send(message: Dictionary) -> void:
	if is_connected_to_room():
		_ws.send_text(JSON.stringify(message))


## Quadro de voz: [tamanho do nome][nome em UTF-8][pacote Opus].
func _handle_voice(frame: PackedByteArray) -> void:
	if frame.size() < 2:
		return
	var length := int(frame[0])
	if frame.size() <= 1 + length:
		return
	voice_received.emit(frame.slice(1, 1 + length).get_string_from_utf8(), frame.slice(1 + length))


func _process(_delta: float) -> void:
	if not _active:
		return
	_ws.poll()
	match _ws.get_ready_state():
		WebSocketPeer.STATE_OPEN:
			_opened = true
			while _ws.get_available_packet_count() > 0:
				var packet := _ws.get_packet()
				if _ws.was_string_packet():
					_handle(packet.get_string_from_utf8())
				else:
					_handle_voice(packet)
		WebSocketPeer.STATE_CLOSED:
			var was_open := _opened
			_active = false
			_opened = false
			disconnected.emit("Conexão encerrada." if was_open else "Não foi possível conectar à mesa.")


func _handle(raw: String) -> void:
	var parsed: Variant = JSON.parse_string(raw)
	if not parsed is Dictionary:
		return
	var message: Dictionary = parsed
	match message.get("type", ""):
		"welcome":
			you = message["you"]
			room = message["room"]
			players = message["players"]
			templates = message.get("templates", [])
			scene = message.get("scene", {})
			if message.has("serverTime"):
				_clock_skew_ms = float(message["serverTime"]) - Time.get_unix_time_from_system() * 1000.0
			catalog = message.get("catalog", [])
			compendiums = message.get("compendiums", [])
			_items = {}
			characters = {}
			for character in message.get("characters", []):
				characters[character["id"]] = character
			welcomed.emit(you, room, players, message["history"])
		"chat:entry":
			entry_received.emit(message["entry"])
		"presence:sync":
			players = message["players"]
			presence_changed.emit(players)
		"sheet:sync":
			var character: Dictionary = message["character"]
			characters[character["id"]] = character
			sheet_changed.emit(character)
		"scene:sync":
			scene = message["scene"]
			scene_changed.emit(scene)
		"audio:fire":
			audio_fired.emit(str(message["cardId"]))
		"voice:seats":
			seats = message["seats"]
			seats_changed.emit(seats)
		"compendium:sync":
			compendiums = message["compendiums"]
			compendiums_changed.emit(compendiums)
		"compendium:item":
			var item: Dictionary = message["item"]
			_items["%s/%s" % [message["compendiumId"], item["id"]]] = item
			compendium_item_received.emit(str(message["compendiumId"]), item)
		"sheet:removed":
			characters.erase(message["characterId"])
			sheet_removed.emit(str(message["characterId"]))
		"room:sync":
			room = message["room"]
			room_changed.emit(room)
		"error":
			server_error.emit(str(message.get("message", "Erro desconhecido.")))


func _request(method: int, path: String, body: Dictionary) -> Dictionary:
	var request := HTTPRequest.new()
	add_child(request)
	var headers := PackedStringArray(["Content-Type: application/json"])
	if request.request(http_base + path, headers, method, JSON.stringify(body)) != OK:
		request.queue_free()
		return {"ok": false, "status": 0, "data": {}, "message": "Não foi possível contatar o servidor."}
	var result: Array = await request.request_completed
	request.queue_free()
	if result[0] != HTTPRequest.RESULT_SUCCESS:
		return {"ok": false, "status": 0, "data": {}, "message": "Não foi possível contatar o servidor."}
	var parsed: Variant = JSON.parse_string((result[3] as PackedByteArray).get_string_from_utf8())
	var data: Dictionary = parsed if parsed is Dictionary else {}
	var code: int = result[1]
	return {
		"ok": code >= 200 and code < 300,
		"status": code,
		"data": data,
		"message": str(data.get("message", "Erro %d do servidor." % code)),
	}

