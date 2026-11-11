extends PanelContainer
## Região focável da interface (histórico, e depois ficha, cena...). Tab e Shift+Tab alternam
## entre regiões e o mouse foca ao clicar. Só a região com foco recebe as teclas dela, então
## atalhos de uma região nunca disputam teclas com um campo de texto.
##
## O AccessKit anuncia o nome da região ao receber foco; o app não repete.

signal key_pressed(key: InputEventKey)

## Falso: a região só enquadra o conteúdo e nunca recebe foco (ex.: o histórico).
var focusable := true

var _normal: StyleBoxFlat
var _focused: StyleBoxFlat


func setup(a11y_name: String, a11y_description: String = "") -> void:
	accessibility_name = a11y_name
	accessibility_description = a11y_description


func _ready() -> void:
	focus_mode = Control.FOCUS_ALL if focusable else Control.FOCUS_NONE
	_normal = _box(Color("5b6270"), 2)
	_focused = _box(Color("ffd166"), 4)
	add_theme_stylebox_override("panel", _normal)
	focus_entered.connect(func() -> void: add_theme_stylebox_override("panel", _focused))
	focus_exited.connect(func() -> void: add_theme_stylebox_override("panel", _normal))
	gui_input.connect(_on_gui_input)


func _on_gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		grab_focus()
		return
	var key := event as InputEventKey
	if key != null and key.pressed:
		key_pressed.emit(key)
		# Setas nunca movem o foco entre regiões: isso é papel do Tab.
		if [KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT].has(key.keycode):
			accept_event()


func _box(border_color: Color, border: int) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color("1d212b")
	box.set_border_width_all(border)
	box.border_color = border_color
	box.set_corner_radius_all(8)
	box.set_content_margin_all(12)
	return box
