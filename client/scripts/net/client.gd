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
	var url := "%s/ws?room=%s&name=%s" % [ws_base, room_id.uri_encode(), player_name.uri_encode()]
	if not token.is_empty():
		url += "&token=" + token.uri_encode()
	_opened = false
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


func sheet_op(character_id: String, op: Dictionary) -> void:
	_send({"type": "sheet:op", "characterId": character_id, "op": op})


func roll_field(character_id: String, field_id: String, track_id: String = "", private_roll: bool = false) -> void:
	var message := {"type": "sheet:roll", "characterId": character_id, "fieldId": field_id, "private": private_roll}
	if not track_id.is_empty():
		message["trackId"] = track_id
	_send(message)


func scene_op(op: Dictionary) -> void:
	_send({"type": "scene:op", "op": op})


func burn_momentum(character_id: String) -> void:
	_send({"type": "sheet:burn", "characterId": character_id})


func leave() -> void:
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


func _send(message: Dictionary) -> void:
	if is_connected_to_room():
		_ws.send_text(JSON.stringify(message))


func _process(_delta: float) -> void:
	if not _active:
		return
	_ws.poll()
	match _ws.get_ready_state():
		WebSocketPeer.STATE_OPEN:
			_opened = true
			while _ws.get_available_packet_count() > 0:
				_handle(_ws.get_packet().get_string_from_utf8())
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

