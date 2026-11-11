extends Control
## Alterna entre a tela de conexão e a mesa.

const Client := preload("res://scripts/net/client.gd")
const ConnectScreen := preload("res://scripts/ui/connect_screen.gd")
const TableScreen := preload("res://scripts/ui/table_screen.gd")
const Store := preload("res://scripts/ui/store.gd")
const ThemeFactory := preload("res://scripts/ui/theme_factory.gd")

var client: Node
var _screen: Control


func _ready() -> void:
	theme = ThemeFactory.build()
	client = Client.new()
	add_child(client)
	client.welcomed.connect(_on_welcomed)
	client.disconnected.connect(_on_disconnected)
	_show_connect()


func _show_connect(message: String = "", is_error: bool = false) -> void:
	_clear_screen()
	var screen: Control = ConnectScreen.new()
	screen.submitted.connect(_on_submitted)
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
	Store.set_value("name", player_name)
	Store.set_value("code", code)
	client.connect_to_room(code, player_name, token)


func _fail(screen: Control, message: String) -> void:
	if is_instance_valid(screen):
		screen.set_busy(false)
		screen.show_status(message, true)


func _on_welcomed(you: Dictionary, room: Dictionary, players: Array, history: Array) -> void:
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
