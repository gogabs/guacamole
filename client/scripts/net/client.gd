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

var _items: Dictionary = {}  # "compêndio/item" -> conteúdo já recebido
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
	catalog = []
	compendiums = []
	_items = {}


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

