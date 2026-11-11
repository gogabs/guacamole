extends VBoxContainer
## Região "Ficha": fichas da mesa e a ficha aberta, tudo por teclado.
##
## Lista de fichas:  Setas navegam, Enter abre ou cria, Delete exclui.
## Ficha aberta:     Setas navegam, Ctrl+Cima/Baixo pulam de seção; Esquerda/Direita ajustam; Enter age;
##                   R rola (Shift+R em privado); M marca progresso, N desmarca; B queima momentum;
##                   Delete remove; Escape volta à lista.
##
## É um componente próprio, então quem fala é o app (Prism). O campo de edição que aparece
## sob a região é nativo: o AccessKit o anuncia e o app não repete.

const ThemeFactory := preload("res://scripts/ui/theme_factory.gd")
const EditField := preload("res://scripts/ui/edit_field.gd")
const EditArea := preload("res://scripts/ui/edit_area.gd")
const FocusZone := preload("res://scripts/ui/focus_zone.gd")

const RANKS := ["troublesome", "dangerous", "formidable", "extreme", "epic"]
const RANK_NAMES := {
	"troublesome": "Incômodo",
	"dangerous": "Perigoso",
	"formidable": "Formidável",
	"extreme": "Extremo",
	"epic": "Épico",
}
const HELP_LIST := (
	"Fichas. Setas navegam, Enter abre uma ficha ou cria uma nova, Delete exclui a ficha selecionada."
)
const HELP_SHEET := (
	"Ficha aberta. Setas navegam, Control mais cima ou baixo pulam de seção ou grupo. "
	+ "Esquerda e direita ajustam números e escolhem caixas. Enter edita, marca ou escolhe. "
	+ "R rola o item, Shift R rola em privado. M marca progresso, N desmarca. B queima momentum. "
	+ "Delete remove um item. Escape volta à lista de fichas."
)

var _client: Node
var _you_name := ""
var _zone: PanelContainer
var _view: RichTextLabel
var _edit: LineEdit
var _area: TextEdit

var _mode := "browse"  # browse | choice | edit
var _rows: Array[Dictionary] = []
var _cursor := 0
var _box := 0
var _character_id := ""
var _pending_create := false
var _announce_next := false
var _silent_focus := false

var _edit_done: Callable
var _choice_title := ""
var _choice_options: Array = []
var _choice_index := 0
var _choice_done: Callable


func setup(client: Node, you: Dictionary) -> void:
	_client = client
	_you_name = str(you.get("name", ""))


func _ready() -> void:
	add_theme_constant_override("separation", 8)

	_zone = FocusZone.new()
	_zone.setup("Ficha", "Setas navegam, Enter age, H lê a ajuda.")
	_zone.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_zone.key_pressed.connect(_on_key)
	_zone.focus_entered.connect(_on_zone_focus)
	add_child(_zone)

	_view = RichTextLabel.new()
	_view.bbcode_enabled = true
	_view.focus_mode = Control.FOCUS_NONE
	_view.mouse_filter = Control.MOUSE_FILTER_PASS
	_zone.add_child(_view)

	_edit = EditField.new()
	_edit.max_length = 2000
	_edit.visible = false
	_edit.text_submitted.connect(_on_edit_submitted)
	_edit.cancelled.connect(_on_edit_cancelled)
	add_child(_edit)

	_area = EditArea.new()
	_area.visible = false
	_area.submitted.connect(_on_edit_submitted)
	_area.cancelled.connect(_on_edit_cancelled)
	add_child(_area)

	_client.sheet_changed.connect(_on_sheet_changed)
	_client.sheet_removed.connect(_on_sheet_removed)
	_client.server_error.connect(func(_message: String) -> void: _announce_next = false)
	_show_list()


# --- Dados --------------------------------------------------------------------------------

func _character() -> Dictionary:
	return _client.characters.get(_character_id, {})


func _value(field: Dictionary) -> Variant:
	return _character()["values"].get(field["id"])


func _template_name(template_id: String) -> String:
	return str(_client.template_for(template_id).get("name", "Ficha"))


func _list_rows() -> Array[Dictionary]:
	var rows: Array[Dictionary] = []
	var ids: Array = _client.characters.keys()
	ids.sort_custom(
		func(a: Variant, b: Variant) -> bool:
			return str(_client.characters[a]["name"]).naturalnocasecmp_to(str(_client.characters[b]["name"])) < 0
	)
	for id in ids:
		rows.append({"kind": "character", "id": id})
	for template in _client.templates:
		rows.append({"kind": "new", "template_id": template["id"], "template_name": template["name"]})
	return rows


func _sheet_rows() -> Array[Dictionary]:
	var rows: Array[Dictionary] = []
	var character := _character()
	var template: Dictionary = _client.template_for(str(character.get("templateId", "")))
	for section in template.get("sections", []):
		rows.append({"kind": "section", "title": section["title"]})
		for field in section["fields"]:
			var value: Variant = character["values"].get(field["id"])
			match field["type"]:
				"list":
					rows.append({"kind": "list_head", "field": field})
					for i in (value as Array).size():
						rows.append({"kind": "list_item", "field": field, "index": i})
					if (value as Array).size() < int(field["maxItems"]):
						rows.append({"kind": "list_add", "field": field})
				"tracks":
					rows.append({"kind": "track_head", "field": field})
					for i in (value as Array).size():
						rows.append({"kind": "track_item", "field": field, "index": i})
					if (value as Array).size() < int(field["maxItems"]):
						rows.append({"kind": "track_add", "field": field})
				_:
					rows.append({"kind": "field", "field": field})
	return rows


func _rebuild() -> void:
	_rows = _list_rows() if _character_id.is_empty() else _sheet_rows()
	_cursor = clampi(_cursor, 0, maxi(0, _rows.size() - 1))
	_render()


# --- Texto falado e exibido ------------------------------------------------------------------

func _plural(count: int, one: String, many: String) -> String:
	return "%d %s" % [count, one if count == 1 else many]


func _progress_text(rank: String, ticks: int) -> String:
	var text := "%s, progresso %d de 10" % [RANK_NAMES.get(rank, rank), ticks / 4]
	if ticks % 4 > 0:
		text += ", mais %s" % _plural(ticks % 4, "marca", "marcas")
	return text


func _row_text(row: Dictionary) -> String:
	match row["kind"]:
		"character":
			var character: Dictionary = _client.characters[row["id"]]
			return "%s, %s, de %s" % [character["name"], _template_name(str(character["templateId"])), character["owner"]]
		"new":
			return "Nova ficha de %s" % row["template_name"]
		"section":
			return "%s, seção" % row["title"]
		"list_head":
			return "%s, grupo, %s" % [row["field"]["label"], _plural((_value(row["field"]) as Array).size(), "item", "itens")]
		"list_item":
			var items: Array = _value(row["field"])
			return "%s %d: %s" % [row["field"]["itemLabel"], int(row["index"]) + 1, items[row["index"]]]
		"list_add":
			return "Adicionar %s" % str(row["field"]["itemLabel"]).to_lower()
		"track_head":
			return "%s, grupo, %s" % [row["field"]["label"], _plural((_value(row["field"]) as Array).size(), "trilha", "trilhas")]
		"track_item":
			var track: Dictionary = (_value(row["field"]) as Array)[row["index"]]
			return "%s. %s" % [track["name"], _progress_text(str(track["rank"]), int(track["ticks"]))]
		"track_add":
			return "Nova trilha em %s" % row["field"]["label"]
	return _field_text(row["field"])


func _field_text(field: Dictionary) -> String:
	var value: Variant = _value(field)
	var label: String = field["label"]
	match field["type"]:
		"number":
			var number := int(value)
			if field.get("roll", "") == "fate":
				return "%s: %s" % [label, ("+%d" % number) if number > 0 else str(number)]
			return "%s: %d" % [label, number]
		"checkbox":
			return "%s: %s" % [label, "marcado" if value else "desmarcado"]
		"checks":
			var boxes: Array = value
			_box = clampi(_box, 0, maxi(0, boxes.size() - 1))
			var box_label := ""
			if field.has("labels") and _box < field["labels"].size():
				box_label = str(field["labels"][_box]) + " "
			return "%s, %s%s, caixa %d de %d" % [
				label, box_label, "marcada" if boxes[_box] else "desmarcada", _box + 1, boxes.size()
			]
		"progress":
			var progress: Dictionary = value
			return "%s: %s" % [label, _progress_text(str(progress["rank"]), int(progress["ticks"]))]
	var text := "\n".join(value) if value is Array else str(value)
	text = text.strip_edges().replace("\n", ". ")
	return "%s: %s" % [label, text if not text.is_empty() else "vazio"]


func _current_text() -> String:
	if _rows.is_empty():
		return "Nada aqui."
	return _row_text(_rows[_cursor])


func _title() -> String:
	if _character_id.is_empty():
		return "Fichas da mesa"
	var character := _character()
	return "%s, %s, de %s" % [character["name"], _template_name(str(character["templateId"])), character["owner"]]


func _render() -> void:
	_view.clear()
	_view.append_text("[color=#%s][b]%s[/b][/color]\n" % [ThemeFactory.ACCENT.to_html(false), _title().replace("[", "[lb]")])
	if _mode == "choice":
		_view.append_text("%s\n" % _choice_title.replace("[", "[lb]"))
		for i in _choice_options.size():
			var label := str(_choice_options[i]["label"]).replace("[", "[lb]")
			_view.append_text(("[bgcolor=#2b3a55]▶ %s[/bgcolor]\n" if i == _choice_index else "   %s\n") % label)
		return
	for i in _rows.size():
		var row := _rows[i]
		var line := _row_text(row).replace("[", "[lb]")
		var color := "ffd166" if row["kind"] == "section" else "f1f3f5"
		if i == _cursor:
			_view.append_text("[bgcolor=#2b3a55][color=#%s]▶ %s[/color][/bgcolor]\n" % [color, line])
		else:
			_view.append_text("[color=#%s]   %s[/color]\n" % [color, line])
	_scroll.call_deferred()


func _scroll() -> void:
	_view.scroll_to_paragraph(_cursor + 1)


# --- Teclado ------------------------------------------------------------------------------------

func _on_zone_focus() -> void:
	if _silent_focus:
		_silent_focus = false
		return
	if _mode == "browse":
		Speech.say(_current_text(), false)


func _on_key(key: InputEventKey) -> void:
	if key.alt_pressed or key.meta_pressed:
		return
	var jump := key.keycode == KEY_UP or key.keycode == KEY_DOWN
	if key.ctrl_pressed and not (jump and _mode == "browse" and not _character_id.is_empty()):
		return
	var handled := false
	if _mode == "choice":
		handled = _choice_key(key)
	elif _character_id.is_empty():
		handled = _list_key(key)
	else:
		handled = _sheet_key(key)
	if handled:
		_zone.accept_event()


func _navigate(key: InputEventKey) -> bool:
	match key.keycode:
		KEY_UP:
			_move(-1)
		KEY_DOWN:
			_move(1)
		KEY_HOME:
			_go_to(0)
		KEY_END:
			_go_to(_rows.size() - 1)
		_:
			return false
	return true


func _move(delta: int) -> void:
	var target := clampi(_cursor + delta, 0, _rows.size() - 1)
	if target == _cursor:
		Sfx.play("edge")
		return
	_go_to(target)


func _go_to(target: int) -> void:
	if _rows.is_empty():
		return
	_cursor = clampi(target, 0, _rows.size() - 1)
	_box = 0
	Sfx.play("focus_button", 0.8 + 0.5 * float(_cursor) / maxf(1.0, _rows.size() - 1.0))
	_render()
	Speech.say(_current_text(), true)


func _confirms(key: InputEventKey) -> bool:
	return not key.echo and (key.keycode == KEY_ENTER or key.keycode == KEY_KP_ENTER or key.keycode == KEY_SPACE)


func _list_key(key: InputEventKey) -> bool:
	if _navigate(key):
		return true
	if key.keycode == KEY_H:
		Speech.say(HELP_LIST, true)
		return true
	if _rows.is_empty():
		return false
	var row := _rows[_cursor]
	if _confirms(key):
		Sfx.play("activate")
		if row["kind"] == "character":
			_open(str(row["id"]))
		else:
			_pending_create = true
			_client.create_sheet(str(row["template_id"]), _you_name)
		return true
	if key.keycode == KEY_DELETE and row["kind"] == "character":
		var id: String = row["id"]
		var name: String = _client.characters[id]["name"]
		_begin_choice(
			"Excluir a ficha %s?" % name,
			[{"label": "Não, manter", "value": false}, {"label": "Sim, excluir", "value": true}],
			func(confirmed: bool) -> void:
				if confirmed:
					_client.delete_sheet(id)
		)
		return true
	return false


func _sheet_key(key: InputEventKey) -> bool:
	if key.ctrl_pressed:
		_jump_section(-1 if key.keycode == KEY_UP else 1)
		return true
	if _navigate(key):
		return true
	var row := _rows[_cursor] if not _rows.is_empty() else {}
	match key.keycode:
		KEY_ESCAPE:
			_show_list()
			Sfx.play("close_input")
		KEY_H:
			Speech.say(HELP_SHEET, true)
		KEY_LEFT:
			_adjust(-1, row)
		KEY_RIGHT:
			_adjust(1, row)
		KEY_ENTER, KEY_KP_ENTER, KEY_SPACE:
			if not key.echo and not row.is_empty():
				Sfx.play("activate")
				_activate(row)
		KEY_R:
			if not key.echo:
				_roll(row, key.shift_pressed)
		KEY_M:
			if not key.echo:
				_mark(1, row)
		KEY_N:
			if not key.echo:
				_mark(-1, row)
		KEY_B:
			if not key.echo:
				_client.burn_momentum(_character_id)
		KEY_DELETE:
			if not key.echo:
				_remove(row)
		_:
			return false
	return true


func _jump_section(direction: int) -> void:
	var i := _cursor + direction
	while i >= 0 and i < _rows.size():
		if ["section", "list_head", "track_head"].has(_rows[i]["kind"]):
			_go_to(i)
			return
		i += direction
	Sfx.play("edge")


# --- Ações na ficha ----------------------------------------------------------------------------

func _set_field(field: Dictionary, value: Variant) -> void:
	_announce_next = true
	_client.sheet_op(_character_id, {"type": "field:set", "fieldId": field["id"], "value": value})


func _adjust(delta: int, row: Dictionary) -> void:
	if row.is_empty() or row["kind"] != "field":
		Sfx.play("edge")
		return
	var field: Dictionary = row["field"]
	var value: Variant = _value(field)
	match field["type"]:
		"number":
			var target := clampi(int(value) + delta, int(field["min"]), int(field["max"]))
			if target == int(value):
				Sfx.play("edge")
				Speech.say(_field_text(field), true)
				return
			Sfx.play("tick", 0.8 + 0.4 * float(target - int(field["min"])) / maxf(1.0, int(field["max"]) - int(field["min"])))
			_set_field(field, target)
		"checks":
			var next := _box + delta
			if next < 0 or next >= (value as Array).size():
				Sfx.play("edge")
				return
			_box = next
			Sfx.play("tick")
			Speech.say(_field_text(field), true)
		"select":
			var options: Array = field["options"]
			var index := (options.find(value) + delta + options.size()) % options.size()
			Sfx.play("tick")
			_set_field(field, options[index])
		_:
			Sfx.play("edge")


func _activate(row: Dictionary) -> void:
	match row["kind"]:
		"list_item":
			var items: Array = (_value(row["field"]) as Array).duplicate()
			var index: int = row["index"]
			_begin_edit(
				"%s %d" % [row["field"]["itemLabel"], index + 1],
				str(items[index]),
				func(text: String) -> void:
					items[index] = text
					_set_field(row["field"], items)
			)
		"list_add":
			var items: Array = (_value(row["field"]) as Array).duplicate()
			_begin_edit(
				str(row["field"]["itemLabel"]),
				"",
				func(text: String) -> void:
					if text.strip_edges().is_empty():
						return
					items.append(text)
					_set_field(row["field"], items)
			)
		"track_add":
			var field: Dictionary = row["field"]
			_begin_edit(
				"Nome da trilha",
				"",
				func(text: String) -> void:
					if text.strip_edges().is_empty():
						return
					_begin_choice("Graduação", _rank_options(), func(rank: String) -> void:
						_announce_next = true
						_client.sheet_op(_character_id, {
							"type": "track:add",
							"fieldId": field["id"],
							"track": {"id": _new_id(), "name": text, "rank": rank},
						}), RANKS.find("formidable"))
			)
		"track_item":
			var field: Dictionary = row["field"]
			var tracks: Array = (_value(field) as Array).duplicate(true)
			var index: int = row["index"]
			var track: Dictionary = tracks[index]
			_begin_edit(
				"Nome da trilha",
				str(track["name"]),
				func(text: String) -> void:
					if text.strip_edges().is_empty():
						return
					_begin_choice("Graduação", _rank_options(), func(rank: String) -> void:
						tracks[index]["name"] = text
						tracks[index]["rank"] = rank
						_set_field(field, tracks), RANKS.find(track["rank"]))
			)
		"field":
			_activate_field(row["field"])
		_:
			Speech.say(_row_text(row), true)


func _activate_field(field: Dictionary) -> void:
	var value: Variant = _value(field)
	match field["type"]:
		"number":
			_begin_edit(
				str(field["label"]),
				str(int(value)),
				func(text: String) -> void:
					if not text.strip_edges().is_valid_int():
						Sfx.play("error")
						Speech.say("Número inválido.", true)
						return
					_set_field(field, text.strip_edges().to_int())
			)
		"text":
			_begin_edit(str(field["label"]), str(value), func(text: String) -> void: _set_field(field, text))
		"textarea":
			_begin_edit(
				str(field["label"]),
				"\n".join(value) if value is Array else str(value),
				func(text: String) -> void: _set_field(field, text),
				true
			)
		"checkbox":
			Sfx.play("tick", 1.2 if not value else 0.8)
			_set_field(field, not value)
		"checks":
			var boxes: Array = (value as Array).duplicate()
			boxes[_box] = not boxes[_box]
			Sfx.play("tick", 1.2 if boxes[_box] else 0.8)
			_set_field(field, boxes)
		"select":
			var options: Array = []
			var current := 0
			for i in field["options"].size():
				options.append({"label": field["options"][i], "value": field["options"][i]})
				if field["options"][i] == value:
					current = i
			_begin_choice(str(field["label"]), options, func(chosen: String) -> void: _set_field(field, chosen), current)
		"progress":
			var progress: Dictionary = value
			_begin_choice(
				"Graduação de %s" % field["label"],
				_rank_options(),
				func(rank: String) -> void: _set_field(field, {"rank": rank, "ticks": int(progress["ticks"])}),
				RANKS.find(progress["rank"])
			)
		_:
			Speech.say(_row_text(_rows[_cursor]), true)


func _rank_options() -> Array:
	var options: Array = []
	for rank in RANKS:
		options.append({"label": RANK_NAMES[rank], "value": rank})
	return options


func _roll(row: Dictionary, private_roll: bool = false) -> void:
	if row.is_empty():
		return
	var field: Dictionary = row.get("field", {})
	if row["kind"] == "field" and (
		(field["type"] == "number" and field.get("roll", "") != "")
		or (field["type"] == "progress" and field.get("rollable", false))
	):
		Sfx.play("activate")
		_client.roll_field(_character_id, field["id"], "", private_roll)
	elif row["kind"] == "track_item" and field.get("rollable", false):
		var track: Dictionary = (_value(field) as Array)[row["index"]]
		Sfx.play("activate")
		_client.roll_field(_character_id, field["id"], str(track["id"]), private_roll)
	else:
		Sfx.play("error")
		Speech.say("Este item não rola dados.", true)


func _mark(times: int, row: Dictionary) -> void:
	if row.is_empty():
		return
	var field: Dictionary = row.get("field", {})
	var op := {"type": "progress:mark", "times": times}
	if row["kind"] == "track_item":
		op["fieldId"] = field["id"]
		op["trackId"] = (_value(field) as Array)[row["index"]]["id"]
	elif row["kind"] == "field" and field["type"] == "progress":
		op["fieldId"] = field["id"]
	else:
		Sfx.play("error")
		Speech.say("Aqui não há progresso para marcar.", true)
		return
	Sfx.play("tick", 1.25 if times > 0 else 0.75)
	_announce_next = true
	_client.sheet_op(_character_id, op)


func _remove(row: Dictionary) -> void:
	if row.is_empty():
		return
	var field: Dictionary = row.get("field", {})
	if row["kind"] == "list_item":
		var items: Array = (_value(field) as Array).duplicate()
		items.remove_at(row["index"])
		Sfx.play("close_input")
		_set_field(field, items)
	elif row["kind"] == "track_item":
		var track: Dictionary = (_value(field) as Array)[row["index"]]
		Sfx.play("close_input")
		_announce_next = true
		_client.sheet_op(_character_id, {"type": "track:remove", "fieldId": field["id"], "trackId": track["id"]})
	else:
		Sfx.play("error")
		Speech.say("Aqui não há nada para remover.", true)


func _new_id() -> String:
	return "%d-%d" % [Time.get_ticks_usec(), randi()]


# --- Estados: lista, ficha, escolha, edição ---------------------------------------------------------

func _show_list() -> void:
	_character_id = ""
	_cursor = 0
	_rebuild()


func _open(id: String) -> void:
	_character_id = id
	_cursor = 0
	_box = 0
	_rebuild()
	Speech.say("Ficha de %s aberta. %s" % [_character()["name"], _current_text()], true)


func _begin_choice(title: String, options: Array, done: Callable, current: int = 0) -> void:
	_mode = "choice"
	_choice_title = title
	_choice_options = options
	_choice_index = clampi(current, 0, maxi(0, options.size() - 1))
	_choice_done = done
	_render()
	Sfx.play("open_input")
	_say_choice(true)


func _say_choice(interrupt: bool) -> void:
	Speech.say(
		"%s. %s, %d de %d" % [_choice_title, _choice_options[_choice_index]["label"], _choice_index + 1, _choice_options.size()]
		if interrupt else "%s, %d de %d" % [_choice_options[_choice_index]["label"], _choice_index + 1, _choice_options.size()],
		true
	)


func _choice_key(key: InputEventKey) -> bool:
	match key.keycode:
		KEY_UP, KEY_DOWN:
			var target := clampi(_choice_index + (1 if key.keycode == KEY_DOWN else -1), 0, _choice_options.size() - 1)
			if target == _choice_index:
				Sfx.play("edge")
			else:
				_choice_index = target
				Sfx.play("focus_button", 0.8 + 0.1 * target)
				_render()
				Speech.say("%s, %d de %d" % [_choice_options[target]["label"], target + 1, _choice_options.size()], true)
		KEY_ENTER, KEY_KP_ENTER, KEY_SPACE:
			if not key.echo:
				var done := _choice_done
				var value: Variant = _choice_options[_choice_index]["value"]
				_mode = "browse"
				Sfx.play("activate")
				_rebuild()
				done.call(value)
		KEY_ESCAPE:
			_mode = "browse"
			_rebuild()
			Sfx.play("close_input")
			Speech.say("Cancelado.", true)
		_:
			return key.keycode == KEY_LEFT or key.keycode == KEY_RIGHT
	return true


func _begin_edit(label: String, initial: String, done: Callable, multiline: bool = false) -> void:
	_mode = "edit"
	_edit_done = done
	if multiline:
		_area.setup(label, "Enter pula linha, Control Enter confirma, Escape cancela.")
		_area.text = initial
		_area.visible = true
		_area.grab_focus()
		_area.set_caret_line(_area.get_line_count() - 1)
		_area.set_caret_column(_area.get_line(_area.get_line_count() - 1).length())
	else:
		_edit.setup(label, "Enter confirma, Escape cancela.")
		_edit.text = initial
		_edit.caret_column = initial.length()
		_edit.visible = true
		_edit.grab_focus()
	Sfx.play("open_input")


func _end_edit() -> void:
	_mode = "browse"
	_edit.visible = false
	_area.visible = false
	_silent_focus = true
	_zone.grab_focus()


func _on_edit_submitted(text: String) -> void:
	var done := _edit_done
	_end_edit()
	Sfx.play("msg_out")
	done.call(text)


func _on_edit_cancelled() -> void:
	_end_edit()
	Sfx.play("close_input")
	Speech.say("Cancelado.", true)


# --- Mudanças vindas do servidor ----------------------------------------------------------------

func _on_sheet_changed(character: Dictionary) -> void:
	if _pending_create and _character_id.is_empty() and str(character["owner"]) == _you_name:
		_pending_create = false
		_open(str(character["id"]))
		return
	if character["id"] == _character_id:
		if _mode == "browse":
			_rebuild()
		if _announce_next:
			_announce_next = false
			Speech.say(_current_text(), true)
	elif _character_id.is_empty():
		_rebuild()


func _on_sheet_removed(character_id: String) -> void:
	if character_id == _character_id:
		_mode = "browse"
		_edit.visible = false
		_area.visible = false
		_show_list()
		Speech.say("A ficha foi excluída. Voltando à lista de fichas.", true)
	elif _character_id.is_empty():
		_rebuild()
