extends VBoxContainer
## Região "Compêndios": pacotes de referência de cada sistema (regras, movimentos, oráculos, ativos).
## Cada compêndio adicionado à mesa vira uma seção; dentro dela ficam os itens, e cada tipo de
## item se comporta do seu jeito: textos de referência abrem num leitor, ativos também, e os
## oráculos rolam e põem o resultado no histórico da mesa.
##
## Setas navegam, Enter abre ou rola, Escape volta, F busca, H lê a ajuda.
##
## É um componente próprio, então quem fala é o app (Prism). O resultado das rolagens chega pelo
## histórico, que já o anuncia: este painel não repete.

const ThemeFactory := preload("res://scripts/ui/theme_factory.gd")
const EditField := preload("res://scripts/ui/edit_field.gd")
const FocusZone := preload("res://scripts/ui/focus_zone.gd")

const HELP_ROOT := (
	"Compêndios. Setas navegam, Control mais cima ou baixo pulam de seção. "
	+ "Enter em Adicionar compêndio mostra o que há para adicionar; Enter num item abre o item. "
	+ "Só o anfitrião tira um compêndio da mesa, com Delete."
)
const HELP_CATALOG := (
	"Compêndios disponíveis. Setas navegam, Enter adiciona o compêndio à mesa, Escape volta."
)
const HELP_LIST := (
	"Setas navegam, Control mais cima ou baixo pulam de grupo, Page Up e Page Down andam dez. "
	+ "F busca, e F de novo com o campo vazio limpa a busca. Enter abre; nos oráculos, Enter ou R rolam "
	+ "e Shift junto rola em privado, e V mostra as linhas da tabela. Escape volta."
)
const HELP_READER := "Setas leem linha por linha, Home e End vão ao começo e ao fim, Escape volta à lista."

const ACCENTS := {
	"á": "a", "à": "a", "â": "a", "ã": "a", "ä": "a", "é": "e", "ê": "e", "è": "e", "í": "i", "î": "i",
	"ó": "o", "ô": "o", "õ": "o", "ò": "o", "ú": "u", "û": "u", "ü": "u", "ç": "c",
}

var _client: Node
var _zone: PanelContainer
var _view: RichTextLabel
var _edit: LineEdit

var _screen := "root"  # root | catalog | list | reader
var _mode := "browse"  # browse | choice | find
var _rows: Array[Dictionary] = []
var _cursor := 0
var _silent_focus := false

var _compendium_id := ""
var _item: Dictionary = {}
var _filter := ""
var _reader_title := ""
var _reader_from := "list"
var _reader_cursor := 0
var _waiting := ""
var _adding := ""
var _root_cursor := 0
var _list_cursor := 0

var _choice_title := ""
var _choice_options: Array = []
var _choice_index := 0
var _choice_done: Callable


func focus_zone() -> Control:
	return _zone


func setup(client: Node) -> void:
	_client = client


func _ready() -> void:
	add_theme_constant_override("separation", 8)

	_zone = FocusZone.new()
	_zone.setup("Compêndios", "Setas navegam, Enter age, H lê a ajuda.")
	_zone.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_zone.key_pressed.connect(_on_key)
	_zone.focus_entered.connect(_on_zone_focus)
	add_child(_zone)

	_view = RichTextLabel.new()
	_view.bbcode_enabled = true
	_view.focus_mode = Control.FOCUS_NONE
	_view.scroll_active = false
	_view.mouse_filter = Control.MOUSE_FILTER_PASS
	_zone.add_child(_view)

	_edit = EditField.new()
	_edit.max_length = 100
	_edit.visible = false
	_edit.text_submitted.connect(_on_find_submitted)
	_edit.cancelled.connect(_on_find_cancelled)
	add_child(_edit)

	_client.compendiums_changed.connect(_on_compendiums_changed)
	_client.compendium_item_received.connect(_on_item_received)
	_client.server_error.connect(func(_message: String) -> void:
		_waiting = ""
		_adding = "")
	_rebuild()


# --- Dados -------------------------------------------------------------------------------------

func _is_host() -> bool:
	return str(_client.you.get("role", "")) == "host"


func _plural(count: int, one: String, many: String) -> String:
	return "%d %s" % [count, one if count == 1 else many]


func _fold(text: String) -> String:
	var folded := text.to_lower()
	for accent in ACCENTS:
		folded = folded.replace(accent, ACCENTS[accent])
	return folded


func _count_text(summary: Dictionary) -> String:
	var count := int(summary["count"])
	match str(summary["kind"]):
		"assets":
			return _plural(count, "ativo", "ativos")
		"oracles":
			return _plural(count, "oráculo", "oráculos")
	return _plural(count, "entrada", "entradas")


func _contents_text(summary: Dictionary) -> String:
	var parts := PackedStringArray()
	for item in summary["items"]:
		parts.append("%s, %s" % [item["name"], _count_text(item)])
	return "; ".join(parts)


func _root_rows() -> Array[Dictionary]:
	var rows: Array[Dictionary] = [{"kind": "add"}]
	for id in _client.compendiums:
		var summary: Dictionary = _client.compendium_summary(str(id))
		if summary.is_empty():
			continue
		rows.append({"kind": "section", "compendium": summary})
		for item in summary["items"]:
			rows.append({"kind": "item", "compendium": summary, "item": item})
	return rows


func _catalog_rows() -> Array[Dictionary]:
	var rows: Array[Dictionary] = []
	for summary in _client.catalog:
		rows.append({"kind": "offer", "compendium": summary})
	return rows


## As linhas da lista de um item aberto, já filtradas pela busca.
func _list_rows() -> Array[Dictionary]:
	var rows: Array[Dictionary] = []
	if str(_item["kind"]) == "oracles":
		if _item.has("odds"):
			rows.append({"kind": "odds", "group": "Sorteios rápidos", "name": _item["odds"]["name"]})
		for combo in _item["combos"]:
			rows.append({"kind": "combo", "group": "Sorteios rápidos", "name": combo["name"], "combo": combo})
		for table in _item["tables"]:
			rows.append({"kind": "table", "group": table["group"], "name": "%s, %s" % [table["name"], table["dice"]], "table": table, "title": table["name"]})
	elif str(_item["kind"]) == "assets":
		for entry in _item["entries"]:
			rows.append({"kind": "asset", "group": entry["category"], "name": entry["name"], "entry": entry})
	else:
		for entry in _item["entries"]:
			rows.append({"kind": "entry", "group": entry["group"], "name": entry["title"], "entry": entry})
	if not _filter.is_empty():
		var wanted := _fold(_filter)
		rows.assign(rows.filter(func(row: Dictionary) -> bool:
			var haystack := _fold("%s %s %s" % [row["name"], row["group"], row.get("entry", {}).get("text", "")])
			return haystack.contains(wanted)))
	return _with_headers(rows)


## Cada grupo (categoria, tipo de tabela...) abre com uma linha própria, que Control mais cima ou baixo alcança.
func _with_headers(rows: Array[Dictionary]) -> Array[Dictionary]:
	var counts := {}
	for row in rows:
		counts[row["group"]] = int(counts.get(row["group"], 0)) + 1
	var result: Array[Dictionary] = []
	var last: Variant = null
	for row in rows:
		if row["group"] != last:
			last = row["group"]
			result.append({"kind": "header", "group": last, "count": counts[last]})
		result.append(row)
	return result


func _reader_rows(lines: Array) -> Array[Dictionary]:
	var rows: Array[Dictionary] = []
	for line in lines:
		rows.append({"kind": "line", "text": str(line)})
	return rows


func _entry_lines(row: Dictionary) -> Array:
	var entry: Dictionary = row["entry"]
	if row["kind"] == "asset":
		var lines: Array = ["%s, %s" % [entry["name"], str(entry["category"]).to_lower()]]
		if not str(entry["flavor"]).is_empty():
			lines.append(str(entry["flavor"]))
		var number := 1
		for ability in entry["abilities"]:
			var label := str(ability["name"])
			lines.append("Habilidade %d%s%s. %s" % [
				number,
				", %s" % label if not label.is_empty() else "",
				", já marcada" if ability["starts"] else "",
				ability["text"],
			])
			number += 1
		if not (entry["extras"] as Array).is_empty():
			var extras := PackedStringArray()
			for extra in entry["extras"]:
				extras.append(str(extra["label"]) if not extra.has("meter") else "%s, de 0 a %d" % [extra["label"], int(extra["meter"]["max"])])
			lines.append("Na ficha: %s." % ", ".join(extras))
		if entry["terror"]:
			lines.append("Combina bem com terror.")
		return lines
	var lines: Array = [str(entry["title"])]
	lines.append_array(str(entry["text"]).split("\n"))
	return lines


func _table_lines(table: Dictionary) -> Array:
	var lines: Array = ["%s, %s" % [table["name"], table["dice"]]]
	for row in table["rows"]:
		var low := int(row["min"])
		var high := int(row["max"])
		var range_text := "%s" % ("00" if low == 100 else str(low))
		if high != low:
			range_text = "%s a %s" % [range_text, "00" if high == 100 else str(high)]
		lines.append("%s: %s" % [range_text, row["text"]])
	return lines


func _rebuild() -> void:
	match _screen:
		"root":
			_rows = _root_rows()
		"catalog":
			_rows = _catalog_rows()
		"list":
			_rows = _list_rows()
	_cursor = clampi(_cursor, 0, maxi(0, _rows.size() - 1))
	_render()


# --- Texto falado e exibido ------------------------------------------------------------------

func _row_text(row: Dictionary) -> String:
	match row["kind"]:
		"add":
			return "Adicionar compêndio"
		"section":
			var summary: Dictionary = row["compendium"]
			return "%s, seção, %s" % [summary["name"], _plural((summary["items"] as Array).size(), "item", "itens")]
		"item":
			return "%s, %s" % [row["item"]["name"], _count_text(row["item"])]
		"offer":
			var summary: Dictionary = row["compendium"]
			var added: bool = _client.has_compendium(str(summary["id"]))
			return "%s%s. Contém: %s" % [summary["name"], ", já na mesa" if added else "", _contents_text(summary)]
		"line":
			return str(row["text"])
		"header":
			return "%s, grupo, %s" % [row["group"], _plural(int(row["count"]), "item", "itens")]
	return str(row["name"])


func _is_button(row: Dictionary) -> bool:
	return not ["section", "line", "header"].has(row["kind"])


func _focus_text() -> String:
	if _rows.is_empty():
		return _empty_text()
	var row := _rows[_cursor]
	var text := _row_text(row)
	return "%s, botão" % text if _is_button(row) else text


func _empty_text() -> String:
	if _screen == "list" and not _filter.is_empty():
		return "Nada encontrado para %s." % _filter
	return "Nada aqui."


func _title() -> String:
	match _screen:
		"catalog":
			return "Compêndios disponíveis"
		"list":
			var name :="%s, %s" % [_client.compendium_summary(_compendium_id).get("name", ""), _item["name"]]
			return "%s, busca %s" % [name, _filter] if not _filter.is_empty() else name
		"reader":
			return _reader_title
	return "Compêndios"


func _render() -> void:
	_view.clear()
	_view.append_text("[color=#%s][b]%s[/b][/color]\n" % [ThemeFactory.ACCENT.to_html(false), _title().replace("[", "[lb]")])
	if _mode == "choice":
		_view.append_text("%s\n" % _choice_title.replace("[", "[lb]"))
		for i in _choice_options.size():
			var label := str(_choice_options[i]["label"]).replace("[", "[lb]")
			_view.append_text(("[bgcolor=#2b3a55]▶ %s[/bgcolor]\n" if i == _choice_index else "   %s\n") % label)
		return
	if _rows.is_empty():
		_view.append_text("[color=#9aa0a6]%s[/color]\n" % _empty_text().replace("[", "[lb]"))
	for i in _rows.size():
		var line := _row_text(_rows[i]).replace("[", "[lb]")
		if i == _cursor:
			_view.append_text("[bgcolor=#2b3a55]▶ %s[/bgcolor]\n" % line)
		else:
			_view.append_text("   %s\n" % line)
	_scroll.call_deferred()


func _scroll() -> void:
	_view.scroll_to_paragraph(_cursor + 1)


func _say_screen() -> void:
	Speech.say("%s. %s" % [_title(), _focus_text()], true)


# --- Teclado ------------------------------------------------------------------------------------

func _on_zone_focus() -> void:
	if _silent_focus:
		_silent_focus = false
		return
	if _mode == "browse":
		Speech.say("%s. %s" % [_title(), _focus_text()], false)


func _on_key(key: InputEventKey) -> void:
	if key.alt_pressed or key.meta_pressed:
		return
	var handled := false
	if _mode == "choice":
		handled = _choice_key(key)
	elif _mode == "browse":
		handled = _browse_key(key)
	if handled:
		_zone.accept_event()


func _confirms(key: InputEventKey) -> bool:
	return not key.echo and (key.keycode == KEY_ENTER or key.keycode == KEY_KP_ENTER or key.keycode == KEY_SPACE)


func _browse_key(key: InputEventKey) -> bool:
	if _navigate(key):
		return true
	var row := _rows[_cursor] if not _rows.is_empty() else {}
	match key.keycode:
		KEY_H:
			Speech.say(_help(), true)
		KEY_ESCAPE:
			_back()
		KEY_F:
			if _screen == "list" and not key.ctrl_pressed:
				_begin_find()
			else:
				return false
		KEY_V:
			if _screen == "list" and row.get("kind", "") == "table":
				_open_reader(_table_lines(row["table"]), str(row["table"]["name"]), false)
			else:
				return false
		KEY_R:
			if not key.echo and _screen == "list" and _is_oracle(row):
				_roll(row, key.shift_pressed)
			else:
				return false
		KEY_DELETE:
			if key.echo:
				return true
			_confirm_remove(row)
		KEY_ENTER, KEY_KP_ENTER, KEY_SPACE:
			if not key.echo and not row.is_empty():
				_activate(row, key.shift_pressed)
		_:
			return false
	return true


func _help() -> String:
	match _screen:
		"catalog":
			return HELP_CATALOG
		"list":
			return HELP_LIST
		"reader":
			return HELP_READER
	return HELP_ROOT


func _is_oracle(row: Dictionary) -> bool:
	return ["odds", "combo", "table"].has(row.get("kind", ""))


func _navigate(key: InputEventKey) -> bool:
	match key.keycode:
		KEY_UP, KEY_DOWN:
			if key.ctrl_pressed:
				_jump(-1 if key.keycode == KEY_UP else 1)
			else:
				_move(-1 if key.keycode == KEY_UP else 1)
		KEY_HOME:
			_go_to(0)
		KEY_END:
			_go_to(_rows.size() - 1)
		KEY_PAGEUP:
			_move(-10)
		KEY_PAGEDOWN:
			_move(10)
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
	Sfx.play("focus_button", 0.8 + 0.5 * float(_cursor) / maxf(1.0, _rows.size() - 1.0))
	_render()
	Speech.say(_focus_text(), true)


## Control mais cima ou baixo: pula para o início da seção (raiz) ou do grupo (lista) anterior ou seguinte.
func _jump(direction: int) -> void:
	if _rows.is_empty() or _screen == "reader" or _screen == "catalog":
		return
	var target := _cursor
	while true:
		target += direction
		if target < 0 or target >= _rows.size():
			Sfx.play("edge")
			return
		if _starts_block(target):
			break
	_go_to(target)


func _starts_block(index: int) -> bool:
	var row := _rows[index]
	if _screen == "root":
		return row["kind"] == "section" or row["kind"] == "add"
	return row["kind"] == "header"


func _activate(row: Dictionary, private_roll: bool) -> void:
	Sfx.play("activate")
	match row["kind"]:
		"add":
			_root_cursor = _cursor
			_screen = "catalog"
			_cursor = 0
			_rebuild()
			_say_screen()
		"section":
			var summary: Dictionary = row["compendium"]
			Speech.say("%s. %s %s" % [summary["name"], summary["description"], summary["attribution"]], true)
		"item":
			_root_cursor = _cursor
			_open_item(str(row["compendium"]["id"]), str(row["item"]["id"]))
		"offer":
			var summary: Dictionary = row["compendium"]
			if _client.has_compendium(str(summary["id"])):
				Sfx.play("error")
				Speech.say("%s já está na mesa." % summary["name"], true)
			else:
				_adding = str(summary["id"])
				_client.add_compendium(_adding)
		"asset", "entry":
			_open_reader(_entry_lines(row), str(row["name"]), true)
		"odds":
			_ask_odds(private_roll)
		"combo", "table":
			_roll(row, private_roll)
		"line", "header":
			Speech.say(_row_text(row), true)


# --- Navegação entre telas -------------------------------------------------------------------

func _back() -> void:
	match _screen:
		"root":
			Sfx.play("edge")
			return
		"catalog":
			_screen = "root"
			_cursor = _root_cursor
		"list":
			if not _filter.is_empty():
				_filter = ""
				_cursor = 0
				_rebuild()
				Sfx.play("close_input")
				Speech.say("Busca limpa. %s" % _focus_text(), true)
				return
			_screen = "root"
			_cursor = _root_cursor
		"reader":
			_screen = _reader_from
			_cursor = _reader_cursor
	Sfx.play("close_input")
	_rebuild()
	_say_screen()


func _open_item(compendium_id: String, item_id: String) -> void:
	var item: Dictionary = _client.compendium_item(compendium_id, item_id)
	if item.is_empty():
		_waiting = "%s/%s" % [compendium_id, item_id]
		Speech.say("Carregando.", true)
		return
	_show_item(compendium_id, item)


func _show_item(compendium_id: String, item: Dictionary) -> void:
	_compendium_id = compendium_id
	_item = item
	_filter = ""
	_screen = "list"
	_cursor = 0
	_rebuild()
	_say_screen()


func _open_reader(lines: Array, title: String, read_all: bool) -> void:
	_reader_from = _screen
	_reader_cursor = _cursor
	_reader_title = title
	_screen = "reader"
	_rows = _reader_rows(lines)
	_cursor = 0
	_render()
	if read_all:
		Speech.say("\n".join(lines), true)
	else:
		Speech.say("%s. %s" % [title, _plural(_rows.size() - 1, "linha", "linhas")], true)


# --- Rolagens, busca e confirmações ---------------------------------------------------------------

func _roll(row: Dictionary, private_roll: bool) -> void:
	var target := {}
	match row["kind"]:
		"table":
			target = {"type": "table", "tableId": row["table"]["id"]}
		"combo":
			target = {"type": "combo", "comboId": row["combo"]["id"]}
		_:
			_ask_odds(private_roll)
			return
	Sfx.play("tick")
	_client.roll_oracle(_compendium_id, str(_item["id"]), target, private_roll)


func _ask_odds(private_roll: bool) -> void:
	var options: Array = []
	for option in _item["odds"]["options"]:
		options.append({"label": option["label"], "value": int(option["threshold"])})
	_begin_choice(str(_item["odds"]["name"]), options, func(threshold: int) -> void:
		_client.roll_oracle(_compendium_id, str(_item["id"]), {"type": "odds", "threshold": threshold}, private_roll), 2)


func _begin_find() -> void:
	_mode = "find"
	_edit.setup("Buscar em %s" % _item["name"], "Enter busca, Escape cancela. Vazio limpa a busca.")
	_edit.text = _filter
	_edit.caret_column = _filter.length()
	_edit.visible = true
	_edit.grab_focus()
	Sfx.play("open_input")


func _end_find() -> void:
	_mode = "browse"
	_edit.visible = false
	_silent_focus = true
	_zone.grab_focus()


func _on_find_submitted(text: String) -> void:
	_end_find()
	_filter = text.strip_edges()
	_cursor = 0
	_rebuild()
	Sfx.play("msg_out")
	if _filter.is_empty():
		Speech.say("Busca limpa. %s" % _plural(_rows.size(), "resultado", "resultados"), true)
	else:
		Speech.say("%s. %s" % [_plural(_rows.size(), "resultado", "resultados"), _focus_text()], true)


func _on_find_cancelled() -> void:
	_end_find()
	Sfx.play("close_input")
	Speech.say("Cancelado.", true)


func _confirm_remove(row: Dictionary) -> void:
	if _screen != "root" or not ["section", "item"].has(row.get("kind", "")):
		return
	if not _is_host():
		Sfx.play("error")
		Speech.say("Só o anfitrião tira compêndios da mesa.", true)
		return
	var summary: Dictionary = row["compendium"]
	_begin_choice("Tirar %s da mesa?" % summary["name"], [
		{"label": "Não, manter na mesa", "value": ""},
		{"label": "Sim, tirar o compêndio", "value": str(summary["id"])},
	], func(id: String) -> void:
		if not id.is_empty():
			_client.remove_compendium(id))


func _begin_choice(title: String, options: Array, done: Callable, current: int = 0) -> void:
	_mode = "choice"
	_choice_title = title
	_choice_options = options
	_choice_index = clampi(current, 0, maxi(0, options.size() - 1))
	_choice_done = done
	_render()
	Sfx.play("open_input")
	Speech.say("%s. %s, %d de %d" % [title, options[_choice_index]["label"], _choice_index + 1, options.size()], true)


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


# --- Mudanças vindas do servidor ----------------------------------------------------------------

func _on_compendiums_changed(_ids: Array) -> void:
	if _screen == "list" and not _client.has_compendium(_compendium_id):
		_screen = "root"
		_cursor = 0
	if not _adding.is_empty() and _client.has_compendium(_adding):
		# Voltar à raiz com o cursor na seção que acabou de entrar.
		var added := _adding
		_adding = ""
		_screen = "root"
		_rows = _root_rows()
		_cursor = 0
		for i in _rows.size():
			if _rows[i]["kind"] == "section" and _rows[i]["compendium"]["id"] == added:
				_cursor = i
		_render()
		Sfx.play("activate")
		Speech.say("%s adicionado. %s" % [_client.compendium_summary(added).get("name", ""), _focus_text()], true)
		return
	if _screen == "root" or _screen == "catalog":
		_rebuild()


func _on_item_received(compendium_id: String, item: Dictionary) -> void:
	if _waiting == "%s/%s" % [compendium_id, item["id"]]:
		_waiting = ""
		_show_item(compendium_id, item)
