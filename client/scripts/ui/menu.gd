extends VBoxContainer
## Menu de itens navegado por setas. Não usa controles focáveis: quem anuncia é o app (Prism),
## então não há anúncio duplicado do AccessKit. Itens com "value" são campos: Enter edita.
##
## Regra geral da interface: controle nativo focável (LineEdit) = anunciado pelo AccessKit,
## o app não fala nada sobre ele; componente próprio (este menu, o histórico) = o app fala.

signal activated(item_id: String)

const ThemeFactory := preload("res://scripts/ui/theme_factory.gd")

var enabled := true
var index := 0

var _items: Array[Dictionary] = []
var _rows: Array[Label] = []


func set_items(items: Array[Dictionary]) -> void:
	_items = items
	for row in _rows:
		row.queue_free()
	_rows.clear()
	for _item in _items:
		var row := Label.new()
		row.add_theme_font_size_override("font_size", 30)
		add_child(row)
		_rows.append(row)
	index = clampi(index, 0, maxi(0, _items.size() - 1))
	_refresh()


func set_value(item_id: String, value: String) -> void:
	for item in _items:
		if item["id"] == item_id:
			item["value"] = value
	_refresh()


func get_value(item_id: String) -> String:
	for item in _items:
		if item["id"] == item_id:
			return str(item.get("value", ""))
	return ""


func current_id() -> String:
	return str(_items[index]["id"]) if not _items.is_empty() else ""


## "Nome: Kaju, 1 de 5"
func announce_current(interrupt: bool = true) -> void:
	if _items.is_empty():
		return
	var role := "campo de edição" if _items[index].has("value") else "botão"
	Speech.say("%s, %s, %d de %d" % [_item_text(_items[index]), role, index + 1, _items.size()], interrupt)


func _unhandled_key_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if not enabled or key == null or not key.pressed or _items.is_empty():
		return
	if key.ctrl_pressed or key.alt_pressed or key.meta_pressed:
		return
	match key.keycode:
		KEY_UP:
			_move(-1)
		KEY_DOWN:
			_move(1)
		KEY_HOME:
			_go_to(0)
		KEY_END:
			_go_to(_items.size() - 1)
		KEY_ENTER, KEY_KP_ENTER, KEY_SPACE:
			if not key.echo:
				Sfx.play("activate")
				activated.emit(current_id())
		_:
			return
	get_viewport().set_input_as_handled()


func _move(delta: int) -> void:
	var target := clampi(index + delta, 0, _items.size() - 1)
	if target == index:
		Sfx.play("edge")
		return
	_go_to(target)


func _go_to(target: int) -> void:
	index = clampi(target, 0, _items.size() - 1)
	var position := float(index) / maxf(1.0, _items.size() - 1.0)
	Sfx.play("focus_button", 0.8 + 0.5 * position)
	_refresh()
	announce_current(true)


func _item_text(item: Dictionary) -> String:
	if not item.has("value"):
		return str(item["label"])
	var value := str(item["value"])
	return "%s: %s" % [item["label"], value if not value.is_empty() else "não definido"]


func _refresh() -> void:
	for i in _rows.size():
		var selected := i == index
		_rows[i].text = ("▶ " if selected else "   ") + _item_text(_items[i])
		_rows[i].add_theme_color_override(
			"font_color", ThemeFactory.ACCENT if selected else ThemeFactory.TEXT
		)
