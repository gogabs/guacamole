extends Control
## Tela de conexão: servidor, nome e código da mesa (vazio = criar uma mesa nova).

signal submitted(server: String, player_name: String, code: String)

const A11y := preload("res://scripts/ui/a11y.gd")
const Store := preload("res://scripts/ui/store.gd")
const ThemeFactory := preload("res://scripts/ui/theme_factory.gd")
const AccessibleLineEdit := preload("res://scripts/ui/accessible_line_edit.gd")

var _server: LineEdit
var _name: LineEdit
var _code: LineEdit
var _button: Button
var _status: Label
var _busy := false


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)

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

	_server = _add_field(column, "Servidor", Store.get_value("server", "127.0.0.1:8000"), "")
	_name = _add_field(column, "Seu nome", Store.get_value("name", ""), "como os outros vão ouvir você")
	_code = _add_field(column, "Código da mesa", Store.get_value("code", ""), "deixe vazio para criar uma mesa nova")

	_button = Button.new()
	_button.text = "Entrar ou criar mesa"
	_button.pressed.connect(_submit)
	A11y.wire(_button, _button.text, "button")
	column.add_child(_button)

	_status = Label.new()
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(_status)

	_name.grab_focus.call_deferred()
	var intro := "Guacamole. Tela de conexão. Use Tab para mudar de campo e Enter para conectar."
	Speech.say(intro, true)
	_status.text = intro


func show_status(message: String, is_error: bool = false) -> void:
	_status.text = message
	_status.add_theme_color_override("font_color", Color("ff6b6b") if is_error else ThemeFactory.TEXT)
	Speech.say(message, true)
	Sfx.play("error" if is_error else "activate")


func set_busy(busy: bool) -> void:
	_busy = busy
	_button.disabled = busy


func _add_field(parent: Control, label_text: String, value: String, hint: String) -> LineEdit:
	var label := Label.new()
	label.text = label_text if hint.is_empty() else "%s (%s)" % [label_text, hint]
	parent.add_child(label)
	var field: LineEdit = AccessibleLineEdit.new()
	field.text = value
	field.text_submitted.connect(func(_text: String) -> void: _submit())
	A11y.wire(field, label_text, "field")
	parent.add_child(field)
	return field


func _submit() -> void:
	if _busy:
		return
	var player_name := _name.text.strip_edges()
	if player_name.is_empty():
		show_status("Digite seu nome antes de conectar.", true)
		_name.grab_focus()
		return
	Sfx.play("activate")
	submitted.emit(_server.text.strip_edges(), player_name, _code.text.strip_edges().to_upper())
