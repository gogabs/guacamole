extends Control
## Alterna entre a tela de conexão e a mesa.

const Client := preload("res://scripts/net/client.gd")
const ConnectScreen := preload("res://scripts/ui/connect_screen.gd")
const TableScreen := preload("res://scripts/ui/table_screen.gd")
const Store := preload("res://scripts/ui/store.gd")
const TableFile := preload("res://scripts/ui/table_file.gd")
const Updater := preload("res://scripts/net/updater.gd")
const ThemeFactory := preload("res://scripts/ui/theme_factory.gd")

var client: Node
var updater: Node
var _screen: Control


func _ready() -> void:
	theme = ThemeFactory.build()
	client = Client.new()
	add_child(client)
	client.welcomed.connect(_on_welcomed)
	client.disconnected.connect(_on_disconnected)
	updater = Updater.new()
	add_child(updater)
	updater.checked.connect(_on_update_checked)
	updater.progress.connect(_on_update_progress)
	_show_connect()
	if Updater.can_install():
		updater.check()


func _show_connect(message: String = "", is_error: bool = false) -> void:
	_clear_screen()
	var screen: Control = ConnectScreen.new()
	screen.pending_update = updater.available
	screen.update_requested.connect(_on_update_requested)
	screen.submitted.connect(_on_submitted)
	screen.import_requested.connect(_on_import)
	add_child(screen)
	_screen = screen
	if not message.is_empty():
		screen.show_status(message, is_error)


func _clear_screen() -> void:
	if is_instance_valid(_screen):
		_screen.queue_free()
		remove_child(_screen)
	_screen = null


func _on_submitted(server: String, player_name: String, code: String) -> void:
	var screen := _screen
	screen.set_busy(true)
	screen.show_status("Conectando.")
	client.configure(server)

	var token := ""
	if code.is_empty():
		var created: Dictionary = await client.create_room("Mesa de " + player_name, player_name)
		if not created["ok"]:
			_fail(screen, created["message"])
			return
		code = str(created["data"]["room"]["id"])
		token = str(created["data"]["hostToken"])
		Store.save_token(code, token)
	else:
		token = Store.token_for(code)
		var joined: Dictionary = await client.check_join(code, player_name, token)
		if not joined["ok"]:
			_fail(screen, joined["message"])
			return

	Store.set_value("server", server)
	client.connect_to_room(code, player_name, token)


func _on_update_checked(info: Dictionary) -> void:
	if _screen != null and _screen.has_method("set_update"):
		_screen.set_update(info)


var _last_percent := -10


func _on_update_progress(done: int, total: int) -> void:
	if total <= 0 or _screen == null or not _screen.has_method("show_status"):
		return
	var percent := int(100.0 * done / total)
	if percent >= _last_percent + 20:
		_last_percent = percent
		Speech.say("%d por cento." % percent, false)


func _on_update_requested() -> void:
	var screen := _screen
	screen.set_busy(true)
	_last_percent = -10
	screen.show_status("Baixando a versão %s. Os arquivos são conferidos antes de trocar." % updater.available["version"])
	var result: Dictionary = await updater.install()
	if not result["ok"]:
		_fail(screen, str(result["message"]))


## Cria uma mesa nova a partir de um arquivo .guacamesa e entra nela como anfitrião.
func _on_import(server: String, player_name: String, path: String) -> void:
	var screen := _screen
	screen.set_busy(true)
	screen.show_status("Importando a mesa. Pode levar um tempo se houver muitos arquivos.")
	client.configure(server)
	var result: Dictionary = await TableFile.import_file(client, path, player_name)
	if not result["ok"]:
		_fail(screen, str(result["message"]))
		return
	Store.save_token(str(result["code"]), str(result["token"]))
	Store.set_value("server", server)
	client.connect_to_room(str(result["code"]), player_name, str(result["token"]))


func _fail(screen: Control, message: String) -> void:
	if is_instance_valid(screen):
		screen.set_busy(false)
		screen.show_status(message, true)


func _on_welcomed(you: Dictionary, room: Dictionary, players: Array, history: Array) -> void:
	Store.set_value("room", str(room["id"]))
	Store.set_value("room_name", str(room.get("name", "")))
	_clear_screen()
	var table: Control = TableScreen.new()
	table.setup(client, you, room, players, history)
	table.leave_requested.connect(_on_leave)
	add_child(table)
	_screen = table


func _on_disconnected(reason: String) -> void:
	_show_connect(reason, true)


func _on_leave() -> void:
	client.leave()
	_show_connect("Você saiu da mesa.")
