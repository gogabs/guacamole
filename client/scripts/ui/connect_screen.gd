extends Control
## Menu principal: Nome, Criar mesa, Entrar em uma mesa, Servidor, Sair.
## Setas navegam, Enter escolhe. Itens com valor abrem um campo de edição que some ao confirmar.

signal submitted(server: String, player_name: String, code: String)

const Store := preload("res://scripts/ui/store.gd")
const ThemeFactory := preload("res://scripts/ui/theme_factory.gd")
const Menu := preload("res://scripts/ui/menu.gd")
const EditField := preload("res://scripts/ui/edit_field.gd")

const DEFAULT_SERVER := "127.0.0.1:8000"

var _menu: VBoxContainer
var _edit_box: VBoxContainer
var _edit_title: Label
var _edit_field: LineEdit
var _status: Label
var _edit_target := ""
var _name_value := ""
var _server_value := ""
var _busy := false


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	_name_value = Store.get_value("name", "")
	_server_value = Store.get_value("server", DEFAULT_SERVER)

	var background := ColorRect.new()
	background.color = ThemeFactory.BACKGROUND
	background.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(background)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	var column := VBoxContainer.new()
	column.custom_minimum_size = Vector2(640, 0)
	column.add_theme_constant_override("separation", 14)
	center.add_child(column)

	var title := Label.new()
	title.text = "Guacamole"
	title.add_theme_font_size_override("font_size", 48)
	title.add_theme_color_override("font_color", ThemeFactory.ACCENT)
	column.add_child(title)

	_menu = Menu.new()
	_menu.activated.connect(_on_activated)
	column.add_child(_menu)
	var items: Array[Dictionary] = [
		{"id": "name", "label": "Nome", "value": _name_value},
		{"id": "create", "label": "Criar mesa"},
		{"id": "join", "label": "Entrar em uma mesa"},
		{"id": "server", "label": "Servidor", "value": _server_value},
		{"id": "quit", "label": "Sair"},
	]
	_menu.set_items(items)

	# Campo de edição: escondido até o Enter num item com valor.
	_edit_box = VBoxContainer.new()
	_edit_box.visible = false
	column.add_child(_edit_box)
	_edit_title = Label.new()
	_edit_box.add_child(_edit_title)
	_edit_field = EditField.new()
	_edit_field.text_submitted.connect(func(_text: String) -> void: _end_edit(true))
	_edit_field.cancelled.connect(func() -> void: _end_edit(false))
	_edit_box.add_child(_edit_field)

	_status = Label.new()
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(_status)

	var intro := "Guacamole. Menu principal. Setas navegam, Enter escolhe."
	_status.text = intro
	Speech.say(intro, true)
	_menu.announce_current(false)


func show_status(message: String, is_error: bool = false) -> void:
	_status.text = message
	_status.add_theme_color_override("font_color", Color("ff6b6b") if is_error else ThemeFactory.TEXT)
	Speech.say(message, true)
	Sfx.play("error" if is_error else "activate")
	if is_error:
		_menu.announce_current(false)


func set_busy(busy: bool) -> void:
	_busy = busy


func _on_activated(item_id: String) -> void:
	if _busy:
		return
	match item_id:
		"name":
			_begin_edit("name", "Nome", _name_value)
		"server":
			_begin_edit("server", "Servidor", _server_value)
		"create":
			if _require_name():
				submitted.emit(_server_value, _name_value, "")
		"join":
			if _require_name():
				_begin_edit("code", "Código da mesa", "")
		"quit":
			get_tree().quit()


func _require_name() -> bool:
	if not _name_value.is_empty():
		return true
	show_status("Defina seu nome antes de criar ou entrar em uma mesa.", true)
	return false


func _begin_edit(target: String, title: String, initial: String) -> void:
	_edit_target = target
	_edit_title.text = title
	_edit_field.setup(title, "Enter confirma, Escape cancela.")
	_edit_field.text = initial
	_edit_field.caret_column = initial.length()
	_edit_box.visible = true
	_menu.enabled = false
	Sfx.play("open_input")
	_edit_field.grab_focus()


func _end_edit(commit: bool) -> void:
	if _edit_target.is_empty():
		return
	var target := _edit_target
	var text := _edit_field.text.strip_edges()
	_edit_target = ""
	_edit_box.visible = false
	_edit_field.release_focus()
	_menu.enabled = true
	Sfx.play("close_input")

	if not commit or text.is_empty():
		Speech.say("Cancelado.", true)
		_menu.announce_current(false)
		return

	match target:
		"name":
			_name_value = text.left(40)
			Store.set_value("name", _name_value)
			_menu.set_value("name", _name_value)
			_menu.announce_current(true)
		"server":
			_server_value = text
			Store.set_value("server", _server_value)
			_menu.set_value("server", _server_value)
			_menu.announce_current(true)
		"code":
			submitted.emit(_server_value, _name_value, text.replace(" ", "").to_upper())
