extends VBoxContainer
## Região "Ficha": fichas da mesa e a ficha aberta, tudo por teclado.
##
## Lista de fichas:  Setas navegam, Enter abre ou cria, Delete exclui.
## Ficha aberta:     Setas navegam, Ctrl+Cima/Baixo pulam de seção; Esquerda/Direita ajustam; Enter age;
##                   R rola (Shift+R em privado); B queima momentum;
##                   Delete remove; Escape volta à lista.
##
## É um componente próprio, então quem fala é o app (Prism). O campo de edição que aparece
## sob a região é nativo: o AccessKit o anuncia e o app não repete.

const ThemeFactory := preload("res://scripts/ui/theme_factory.gd")
const EditField := preload("res://scripts/ui/edit_field.gd")
const EditArea := preload("res://scripts/ui/edit_area.gd")
const FocusZone := preload("res://scripts/ui/focus_zone.gd")
const SheetLibrary := preload("res://scripts/ui/sheet_library.gd")

const RANKS := ["troublesome", "dangerous", "formidable", "extreme", "epic"]
const RANK_NAMES := {
	"troublesome": "Incômodo",
	"dangerous": "Perigoso",
	"formidable": "Formidável",
	"extreme": "Extremo",
	"epic": "Épico",
}
const HELP_LIST := (
	"Fichas. Setas navegam, Enter abre uma ficha, cria uma nova ou abre a opção escolhida; "
	+ "Control mais esquerda ou direita abre as fichas que são suas. "
	+ "Suas fichas são salvas neste computador sozinhas. "
	+ "Numa ficha: S salva a cópia agora, E exporta para um arquivo, Delete tira da mesa."
)
const HELP_LOCAL := (
	"Fichas salvas neste computador. Setas navegam, Enter coloca a ficha na mesa, "
	+ "E exporta para um arquivo, Delete apaga a cópia salva. Escape volta às fichas da mesa."
)
const HELP_CARD := (
	"Carta aberta, como um ativo. Setas navegam. Enter edita o nome, o texto e os campos, e marca ou desmarca habilidades. "
	+ "Esquerda e direita ajustam os medidores, como a saúde. Delete remove da ficha. Escape volta à ficha."
)
const HELP_SHEET := (
	"Ficha aberta. Setas navegam, Control mais cima ou baixo pulam de seção ou grupo. "
	+ "Esquerda e direita ajustam números, avançam ou recuam o progresso das trilhas e escolhem caixas. "
	+ "Enter edita, marca ou escolhe; num ativo, abre o texto e os detalhes. R rola o item, Shift R rola em privado; "
	+ "no Dungeon World, V rola com vantagem e D com desvantagem. B queima momentum. "
	+ "Control mais esquerda ou direita troca entre as fichas que são suas. Na linha Dono, esquerda e direita escolhem "
	+ "quem recebe a ficha e Enter confirma; Enter sem escolher pega a ficha para você. "
	+ "S salva a ficha neste computador, E exporta para um arquivo. "
	+ "Delete remove um item. Escape volta à lista de fichas."
)

var _client: Node
var _you_name := ""
var _zone: PanelContainer
var _view: RichTextLabel
var _next_kind := "text"  # tipo de digitação do próximo campo de uma linha
var _edit: LineEdit
var _area: TextEdit

var _mode := "browse"  # browse | choice | edit
var _rows: Array[Dictionary] = []
var _cursor := 0
var _box := 0
var _character_id := ""
var _local := false  # lista de fichas salvas neste computador, em vez das da mesa
var _pending_create := false
var _pending_pick: Dictionary = {}  # campo de cartas à espera do conteúdo do compêndio
var _card_field: Dictionary = {}  # campo e id da carta aberta; vazio na ficha
var _card_id := ""
var _pending_add: Dictionary = {}  # campo de cartas à espera de o compêndio entrar na mesa
var _card_return := 0
var _owner_pick := ""  # quem Enter receberia a ficha, escolhido com esquerda e direita
var _announce_next := false
var _silent_focus := false

var _edit_done: Callable
var _choice_title := ""
var _choice_options: Array = []
var _choice_index := 0
var _choice_done: Callable


func focus_zone() -> Control:
	return _zone


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
	_view.scroll_active = false
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
	_client.compendium_item_received.connect(_on_compendium_item)
	_client.compendiums_changed.connect(_on_compendiums_changed)
	_client.server_error.connect(func(_message: String) -> void:
		_pending_add = {}
		_announce_next = false
		_pending_pick = {}
		_pending_create = false)
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
	if _local:
		var saved := SheetLibrary.list()
		for sheet in saved:
			rows.append({"kind": "local", "sheet": sheet})
		if saved.size() > 1:
			rows.append({"kind": "export_all", "sheets": saved, "what": "salvas neste computador"})
		return rows
	var ids: Array = _client.characters.keys()
	ids.sort_custom(
		func(a: Variant, b: Variant) -> bool:
			return str(_client.characters[a]["name"]).naturalnocasecmp_to(str(_client.characters[b]["name"])) < 0
	)
	for id in ids:
		rows.append({"kind": "character", "id": id})
	rows.append({"kind": "new"})
	rows.append({"kind": "open_local"})
	rows.append({"kind": "import_file"})
	if _client.characters.size() > 1:
		var all: Array = []
		for id in ids:
			all.append(SheetLibrary.to_sheet(_client.characters[id]))
		rows.append({"kind": "export_all", "sheets": all, "what": "da mesa"})
	return rows


func _sheet_rows() -> Array[Dictionary]:
	var rows: Array[Dictionary] = []
	var character := _character()
	if not _card_id.is_empty():
		return _card_rows()
	var template: Dictionary = _client.template_for(str(character.get("templateId", "")))
	rows.append({"kind": "meta", "key": "name"})
	rows.append({"kind": "meta", "key": "description"})
	rows.append({"kind": "meta", "key": "owner"})
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
				"cards":
					rows.append({"kind": "card_head", "field": field})
					for i in (value as Array).size():
						rows.append({"kind": "card_item", "field": field, "index": i})
					if (value as Array).size() < int(field["maxItems"]):
						rows.append({"kind": "card_add", "field": field})
				"tracks":
					rows.append({"kind": "track_head", "field": field})
					for i in (value as Array).size():
						rows.append({"kind": "track_item", "field": field, "index": i})
					if (value as Array).size() < int(field["maxItems"]):
						rows.append({"kind": "track_add", "field": field})
				_:
					rows.append({"kind": "field", "field": field})
	return rows


## As linhas da carta aberta: título, texto, campos, medidores e habilidades.
func _card_rows() -> Array[Dictionary]:
	var rows: Array[Dictionary] = []
	var card := _open_card()
	if card.is_empty():
		return rows
	rows.append({"kind": "section", "title": card["title"]})
	rows.append({"kind": "card_title"})
	if not str(card["text"]).is_empty():
		rows.append({"kind": "card_text"})
	for i in (card["details"] as Array).size():
		rows.append({"kind": "card_detail", "index": i})
	for i in (card["meters"] as Array).size():
		rows.append({"kind": "card_meter", "index": i})
	for i in (card["abilities"] as Array).size():
		rows.append({"kind": "card_ability", "index": i})
	rows.append({"kind": "card_remove"})
	return rows


## A carta aberta, ou vazio se ela saiu da ficha.
func _open_card() -> Dictionary:
	if _card_id.is_empty():
		return {}
	for card in _value(_card_field) as Array:
		if card["id"] == _card_id:
			return card
	return {}


func _rebuild() -> void:
	if not _card_id.is_empty() and _open_card().is_empty():
		_card_id = ""
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
			var line := _summary(character)
			return line if str(character["owner"]) == _you_name else "%s, de %s" % [line, character["owner"]]
		"local":
			return _summary(row["sheet"])
		"new":
			return "Nova ficha"
		"open_local":
			return "Carregar uma ficha salva neste computador, %s" % _plural(SheetLibrary.list().size(), "salva", "salvas")
		"import_file":
			return "Importar ficha ou pacote de fichas de um arquivo"
		"export_all":
			return "Exportar todas as fichas %s em um pacote" % row["what"]
		"meta":
			if row["key"] == "name":
				return "Nome: %s" % _character()["name"]
			if row["key"] == "owner":
				var owner := str(_character()["owner"])
				var line := "Dono: %s" % ("você" if owner == _you_name else owner)
				if not _owner_pick.is_empty() and _owner_pick != owner:
					line += ", passar para %s, Enter confirma" % ("você" if _owner_pick == _you_name else _owner_pick)
				return line
			var description := str(_character().get("description", "")).strip_edges().replace("\n", ". ")
			return "Descrição: %s" % (description if not description.is_empty() else "vazia")
		"section":
			return "%s, seção" % row["title"]
		"list_head":
			return "%s, grupo, %s" % [row["field"]["label"], _plural((_value(row["field"]) as Array).size(), "item", "itens")]
		"list_item":
			var items: Array = _value(row["field"])
			return "%s %d: %s" % [row["field"]["itemLabel"], int(row["index"]) + 1, items[row["index"]]]
		"list_add":
			return "Adicionar %s" % str(row["field"]["itemLabel"]).to_lower()
		"card_head":
			return "%s, grupo, %s" % [row["field"]["label"], _plural((_value(row["field"]) as Array).size(), "item", "itens")]
		"card_item":
			var card: Dictionary = (_value(row["field"]) as Array)[row["index"]]
			return "%s %d: %s" % [row["field"]["itemLabel"], int(row["index"]) + 1, _card_summary(card)]
		"card_add":
			var line := "Adicionar %s" % str(row["field"]["itemLabel"]).to_lower()
			return line + ", do compêndio" if _has_source(row["field"]) else line
		"card_title":
			return "Nome: %s" % _open_card()["title"]
		"card_text":
			return "Texto: %s" % str(_open_card()["text"]).replace("\n", " ")
		"card_detail":
			var detail: Dictionary = _open_card()["details"][row["index"]]
			return "%s: %s" % [detail["label"], detail["value"] if not str(detail["value"]).is_empty() else "vazio"]
		"card_meter":
			var meter: Dictionary = _open_card()["meters"][row["index"]]
			return "%s: %d de %d" % [meter["label"], int(meter["value"]), int(meter["max"])]
		"card_ability":
			var ability: Dictionary = _open_card()["abilities"][row["index"]]
			var name := str(ability["name"])
			return "Habilidade %d%s, %s. %s" % [
				int(row["index"]) + 1,
				", %s" % name if not name.is_empty() else "",
				"marcada" if ability["marked"] else "desmarcada",
				ability["text"],
			]
		"card_remove":
			return "Remover %s da ficha" % str(_card_field["itemLabel"]).to_lower()
		"track_head":
			return "%s, grupo, %s" % [row["field"]["label"], _plural((_value(row["field"]) as Array).size(), "trilha", "trilhas")]
		"track_item":
			var track: Dictionary = (_value(row["field"]) as Array)[row["index"]]
			return "%s. %s" % [track["name"], _progress_text(str(track["rank"]), int(track["ticks"]))]
		"track_add":
			return "Nova trilha em %s" % row["field"]["label"]
	return _field_text(row["field"])


## "Cão, Rex, Saúde 3 de 4": o título, o que o jogador preencheu e os medidores.
func _card_summary(card: Dictionary) -> String:
	var parts := PackedStringArray([str(card["title"])])
	for detail in card["details"]:
		if not str(detail["value"]).is_empty():
			parts.append(str(detail["value"]))
	for meter in card["meters"]:
		parts.append("%s %d de %d" % [meter["label"], int(meter["value"]), int(meter["max"])])
	return ", ".join(parts)


## "Kaju (Fate Acelerado); Jovem clériga gnomo de olhos fulgurantes…"
func _summary(sheet: Dictionary) -> String:
	var line := "%s (%s)" % [sheet["name"], _template_name(str(sheet["templateId"]))]
	var excerpt := _excerpt(str(sheet.get("description", "")))
	return line if excerpt.is_empty() else "%s; %s" % [line, excerpt]


func _excerpt(text: String, limit: int = 90) -> String:
	var flat := text.strip_edges().replace("\n", " ")
	if flat.length() <= limit:
		return flat
	var cut := flat.substr(0, limit)
	var space := cut.rfind(" ")
	if space > limit / 2:
		cut = cut.substr(0, space)
	return cut.rstrip(" ,.;:") + "…"


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
			return "%s: %s" % [label, "marcada" if value else "desmarcada"]
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


## O tipo do item, dito ao chegar nele (não a cada mudança de valor).
func _role(row: Dictionary) -> String:
	match row["kind"]:
		"character", "local", "new", "open_local", "import_file", "export_all", "list_add", "track_add", \
		"card_item", "card_add", "card_remove":
			return "botão"
		"meta", "list_item", "card_title", "card_text", "card_detail":
			return "lista de opções" if row.get("key", "") == "owner" else "campo de edição"
		"track_item", "card_meter":
			return "controle deslizante"
		"card_ability":
			return "caixa de seleção"
		"field":
			match row["field"]["type"]:
				"number", "progress":
					return "controle deslizante"
				"checkbox":
					return "caixa de seleção"
				"text", "textarea":
					return "campo de edição"
				"select":
					return "lista de opções"
	return ""


func _focus_text() -> String:
	if _rows.is_empty():
		return "Nada aqui."
	var role := _role(_rows[_cursor])
	return _current_text() if role.is_empty() else "%s, %s" % [_current_text(), role]


func _title() -> String:
	if _character_id.is_empty():
		return "Fichas salvas neste computador" if _local else "Fichas da mesa"
	var character := _character()
	if not _card_id.is_empty():
		return "%s, %s de %s" % [_open_card().get("title", ""), str(_card_field["itemLabel"]).to_lower(), character["name"]]
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
		Speech.say(_focus_text(), false)


func _on_key(key: InputEventKey) -> void:
	if key.alt_pressed or key.meta_pressed:
		return
	var jump := key.keycode == KEY_UP or key.keycode == KEY_DOWN
	if key.ctrl_pressed and (key.keycode == KEY_LEFT or key.keycode == KEY_RIGHT) and _mode == "browse" and not _local:
		if not key.echo:
			_cycle_sheet(-1 if key.keycode == KEY_LEFT else 1)
		_zone.accept_event()
		return
	if key.ctrl_pressed and not (jump and _mode == "browse" and not _character_id.is_empty()):
		return
	var handled := false
	if _mode == "choice":
		handled = _choice_key(key)
	elif _character_id.is_empty():
		handled = _local_key(key) if _local else _list_key(key)
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
	_owner_pick = ""
	Sfx.play("focus_button", 0.8 + 0.5 * float(_cursor) / maxf(1.0, _rows.size() - 1.0))
	_render()
	Speech.say(_focus_text(), true)


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
		match row["kind"]:
			"character":
				_open(str(row["id"]))
			"new":
				_begin_new_sheet()
			"open_local":
				_show_local()
			"import_file":
				_import_from_file()
			"export_all":
				_export(row["sheets"], "fichas.zip")
		return true
	if row["kind"] != "character" or key.echo:
		return false
	var character: Dictionary = _client.characters[row["id"]]
	match key.keycode:
		KEY_S:
			_save_local(character)
		KEY_E:
			_export([SheetLibrary.to_sheet(character)], "%s.json" % character["name"])
		KEY_DELETE:
			_confirm_remove(character)
		_:
			return false
	return true


func _local_key(key: InputEventKey) -> bool:
	if _navigate(key):
		return true
	match key.keycode:
		KEY_ESCAPE:
			_show_list()
			Sfx.play("close_input")
			Speech.say("%s. %s" % [_title(), _current_text()], true)
			return true
		KEY_H:
			Speech.say(HELP_LOCAL, true)
			return true
	if _rows.is_empty() or key.echo:
		return false
	var row := _rows[_cursor]
	if _confirms(key):
		Sfx.play("activate")
		if row["kind"] == "local":
			_load_to_table(row["sheet"])
		else:
			_export(row["sheets"], "fichas.zip")
		return true
	if row["kind"] != "local":
		return false
	var sheet: Dictionary = row["sheet"]
	match key.keycode:
		KEY_E:
			_export([sheet], "%s.json" % sheet["name"])
		KEY_DELETE:
			_begin_choice(
				"Apagar a cópia salva de %s?" % sheet["name"],
				[{"label": "Não, manter", "value": false}, {"label": "Sim, apagar a cópia salva", "value": true}],
				func(confirmed: bool) -> void:
					if confirmed:
						SheetLibrary.remove(str(sheet["id"]))
						_rebuild()
						Speech.say("Cópia apagada. %s" % _current_text(), true)
			)
		_:
			return false
	return true


# --- Fichas locais e arquivos ----------------------------------------------------------------------

## Nome e, em seguida, o modelo; escolher o modelo confirma e cria a ficha.
func _begin_new_sheet() -> void:
	_begin_edit("Nome da nova ficha", _you_name, func(sheet_name: String) -> void:
		if sheet_name.strip_edges().is_empty():
			return
		var options: Array = []
		for template in _client.templates:
			options.append({"label": template["name"], "value": template["id"]})
		_begin_choice("Modelo da ficha %s" % sheet_name.strip_edges(), options, func(template_id: String) -> void:
			_pending_create = true
			_client.create_sheet(template_id, sheet_name))
	)


func _show_local() -> void:
	_local = true
	_cursor = 0
	_rebuild()
	Speech.say("%s. %s" % [_title(), _current_text()], true)


func _save_local(character: Dictionary) -> void:
	if SheetLibrary.save(character):
		Sfx.play("msg_out")
		Speech.say("Ficha %s salva neste computador." % character["name"], true)
	else:
		Sfx.play("error")
		Speech.say("Não foi possível salvar a ficha.", true)


func _load_to_table(sheet: Dictionary) -> void:
	_local = false
	_pending_create = true
	_client.import_sheet(sheet)
	Speech.say("Colocando %s na mesa." % sheet["name"], true)


func _import_from_file() -> void:
	var started := SheetLibrary.pick(false, "Importar fichas", "", func(path: String) -> void:
		if path.is_empty():
			Speech.say("Importação cancelada.", true)
			return
		import_path(path))
	if not started:
		Sfx.play("error")
		Speech.say("Este sistema não oferece a janela de escolher arquivos.", true)


## Lê um arquivo de ficha ou pacote e coloca as fichas na mesa.
func import_path(path: String) -> void:
	var sheets := SheetLibrary.read_file(path)
	if sheets.is_empty():
		Sfx.play("error")
		Speech.say("Não encontrei fichas nesse arquivo.", true)
		return
	_pending_create = sheets.size() == 1
	for sheet in sheets:
		_client.import_sheet(sheet)
	Speech.say("%s na mesa." % _plural(sheets.size(), "ficha importada", "fichas importadas"), true)


func _export(sheets: Array, suggested: String) -> void:
	var started := SheetLibrary.pick(true, "Exportar fichas", suggested, func(path: String) -> void:
		if path.is_empty():
			Speech.say("Exportação cancelada.", true)
			return
		export_path(path, sheets))
	if not started:
		Sfx.play("error")
		Speech.say("Este sistema não oferece a janela de salvar arquivos.", true)


func export_path(path: String, sheets: Array) -> void:
	if SheetLibrary.write_file(path, sheets) == OK:
		Sfx.play("msg_out")
		Speech.say("%s em %s." % [_plural(sheets.size(), "ficha exportada", "fichas exportadas"), path.get_file()], true)
	else:
		Sfx.play("error")
		Speech.say("Não foi possível gravar o arquivo.", true)


## Tirar da mesa não apaga: a cópia salva neste computador continua, e dá para salvar antes.
func _confirm_remove(character: Dictionary) -> void:
	var id: String = character["id"]
	var saved := SheetLibrary.has(id)
	var options := [{"label": "Não, manter na mesa", "value": "keep"}]
	if not saved:
		options.append({"label": "Salvar neste computador e tirar da mesa", "value": "save"})
	options.append({
		"label": "Tirar da mesa, a cópia salva continua" if saved else "Tirar da mesa sem salvar",
		"value": "remove",
	})
	_begin_choice("Tirar %s da mesa?" % character["name"], options, func(choice: String) -> void:
		if choice == "keep":
			return
		if choice == "save" and not SheetLibrary.save(character):
			Sfx.play("error")
			Speech.say("Não foi possível salvar, a ficha continua na mesa.", true)
			return
		_client.delete_sheet(id))


func _sheet_key(key: InputEventKey) -> bool:
	if key.ctrl_pressed:
		_jump_section(-1 if key.keycode == KEY_UP else 1)
		return true
	if _navigate(key):
		return true
	var row := _rows[_cursor] if not _rows.is_empty() else {}
	match key.keycode:
		KEY_ESCAPE:
			if _card_id.is_empty():
				_show_list()
			else:
				_close_card()
			Sfx.play("close_input")
		KEY_H:
			Speech.say(HELP_CARD if not _card_id.is_empty() else HELP_SHEET, true)
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
		KEY_V, KEY_D:
			if not key.echo:
				_roll(row, key.shift_pressed, 1 if key.keycode == KEY_V else -1)
		KEY_B:
			if not key.echo:
				_client.burn_momentum(_character_id)
		KEY_S:
			if not key.echo:
				_save_local(_character())
		KEY_E:
			if not key.echo:
				_export([SheetLibrary.to_sheet(_character())], "%s.json" % _character()["name"])
		KEY_DELETE:
			if not key.echo:
				_remove(row)
		_:
			return false
	return true


func _jump_section(direction: int) -> void:
	var i := _cursor + direction
	while i >= 0 and i < _rows.size():
		if ["section", "list_head", "track_head", "card_head"].has(_rows[i]["kind"]):
			_go_to(i)
			return
		i += direction
	Sfx.play("edge")


# --- Ações na ficha ----------------------------------------------------------------------------

func _set_field(field: Dictionary, value: Variant) -> void:
	_announce_next = true
	_client.sheet_op(_character_id, {"type": "field:set", "fieldId": field["id"], "value": value})


func _adjust(delta: int, row: Dictionary) -> void:
	if not row.is_empty() and row["kind"] == "meta" and row["key"] == "owner":
		_preview_owner(delta)
		return
	if row.is_empty() or not ["field", "track_item", "card_meter"].has(row["kind"]):
		Sfx.play("edge")
		return
	if row["kind"] == "track_item":
		_mark(delta, row)
		return
	if row["kind"] == "card_meter":
		_adjust_meter(delta, int(row["index"]))
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
		"progress":
			_mark(delta, row)
		"select":
			var options: Array = field["options"]
			var index := (options.find(value) + delta + options.size()) % options.size()
			Sfx.play("tick")
			_set_field(field, options[index])
		_:
			Sfx.play("edge")


## Esquerda e direita percorrem quem está na mesa, sem passar nada: só Enter confirma.
func _preview_owner(delta: int) -> void:
	var owner := str(_character()["owner"])
	var names: Array = []
	for player in _client.players:
		names.append(str(player["name"]))
	if not names.has(owner):
		names.append(owner)
	var from := _owner_pick if not _owner_pick.is_empty() else owner
	var index := (maxi(0, names.find(from)) + delta + names.size()) % names.size()
	_owner_pick = names[index]
	Sfx.play("tick", 0.8 + 0.4 * float(index) / maxf(1.0, names.size() - 1.0))
	Speech.say(_current_text(), true)
	_render()


func _confirm_owner() -> void:
	var owner := str(_character()["owner"])
	var target := _owner_pick if not _owner_pick.is_empty() else _you_name
	_owner_pick = ""
	if target == owner:
		Sfx.play("error")
		Speech.say("A ficha já é %s. Esquerda e direita escolhem outra pessoa." % ("sua" if owner == _you_name else "de %s" % owner), true)
		return
	_announce_next = true
	_client.assign_sheet(_character_id, target)


func _my_sheet_ids() -> Array:
	var ids: Array = []
	for id in _client.characters:
		if str(_client.characters[id]["owner"]) == _you_name:
			ids.append(id)
	ids.sort_custom(
		func(a: Variant, b: Variant) -> bool:
			return str(_client.characters[a]["name"]).naturalnocasecmp_to(str(_client.characters[b]["name"])) < 0
	)
	return ids


## Control mais esquerda ou direita: a ficha anterior ou seguinte entre as suas.
func _cycle_sheet(direction: int) -> void:
	var mine := _my_sheet_ids()
	if mine.is_empty():
		Sfx.play("error")
		Speech.say("Você não tem fichas. Na ficha de outra pessoa, Enter no dono pega a ficha para você.", true)
		return
	var index := mine.find(_character_id)
	if mine.size() == 1 and index == 0:
		Sfx.play("edge")
		Speech.say("Esta é a sua única ficha.", true)
		return
	var target := (index + direction + mine.size()) % mine.size() if index >= 0 else (0 if direction > 0 else mine.size() - 1)
	Sfx.play("focus_button", 0.8 + 0.5 * float(target) / maxf(1.0, mine.size() - 1.0))
	_open(str(mine[target]), "%d de %d" % [target + 1, mine.size()])


func _adjust_meter(delta: int, index: int) -> void:
	var meter: Dictionary = _open_card()["meters"][index]
	var target := clampi(int(meter["value"]) + delta, 0, int(meter["max"]))
	if target == int(meter["value"]):
		Sfx.play("edge")
		Speech.say(_current_text(), true)
		return
	Sfx.play("tick", 0.8 + 0.4 * float(target) / maxf(1.0, float(meter["max"])))
	_update_card(func(card: Dictionary) -> void: card["meters"][index]["value"] = target)


## Muda uma cópia da carta aberta e manda a lista inteira de volta ao servidor.
func _update_card(change: Callable) -> void:
	var cards: Array = (_value(_card_field) as Array).duplicate(true)
	for card in cards:
		if card["id"] == _card_id:
			change.call(card)
			_set_field(_card_field, cards)
			return


func _open_card_row(field: Dictionary, index: int) -> void:
	_card_field = field
	_card_id = str((_value(field) as Array)[index]["id"])
	_card_return = _cursor
	_rebuild()
	# Começa no texto, que é o que Enter na lista quer mostrar.
	_cursor = 2 if _rows.size() > 2 and _rows[2]["kind"] == "card_text" else 1
	_render()
	Speech.say("%s. %s" % [_title(), _current_text()], true)


func _close_card() -> void:
	_card_id = ""
	_cursor = _card_return
	_rebuild()
	Speech.say(_current_text(), true)


func _activate(row: Dictionary) -> void:
	match row["kind"]:
		"card_item":
			_open_card_row(row["field"], int(row["index"]))
		"card_add":
			if _has_source(row["field"]):
				_pick_from_compendium(row["field"])
			elif row["field"].has("source"):
				_offer_compendium(row["field"])
			else:
				_add_card_free(row["field"])
		"card_title":
			var card := _open_card()
			_begin_edit("Nome", str(card["title"]), func(text: String) -> void:
				if not text.strip_edges().is_empty():
					_update_card(func(c: Dictionary) -> void: c["title"] = text.strip_edges()))
		"card_text":
			_begin_edit("Texto", str(_open_card()["text"]), func(text: String) -> void:
				_update_card(func(c: Dictionary) -> void: c["text"] = text), true)
		"card_detail":
			var index: int = row["index"]
			var detail: Dictionary = _open_card()["details"][index]
			_begin_edit(str(detail["label"]), str(detail["value"]), func(text: String) -> void:
				_update_card(func(c: Dictionary) -> void: c["details"][index]["value"] = text))
		"card_meter":
			Speech.say(_row_text(row), true)
		"card_ability":
			var index: int = row["index"]
			var ability: Dictionary = _open_card()["abilities"][index]
			Sfx.play("tick", 0.8 if ability["marked"] else 1.2)
			_update_card(func(c: Dictionary) -> void: c["abilities"][index]["marked"] = not ability["marked"])
		"card_remove":
			_confirm_remove_card(_card_field, _card_id)
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
			if _has_source(row["field"]):
				_pick_from_compendium(row["field"])
			else:
				_add_list_text(row["field"])
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
		"meta":
			if row["key"] == "owner":
				_confirm_owner()
			elif row["key"] == "name":
				_begin_edit("Nome da ficha", str(_character()["name"]), func(text: String) -> void:
					if not text.strip_edges().is_empty():
						_announce_next = true
						_client.rename_sheet(_character_id, text))
			else:
				_begin_edit("Descrição da ficha", str(_character().get("description", "")), func(text: String) -> void:
					_announce_next = true
					_client.describe_sheet(_character_id, text), true)
		"field":
			_activate_field(row["field"])
		_:
			Speech.say(_row_text(row), true)


func _add_list_text(field: Dictionary) -> void:
	_begin_edit(
		str(field["itemLabel"]),
		"",
		func(text: String) -> void:
			if text.strip_edges().is_empty():
				return
			var items: Array = (_value(field) as Array).duplicate()
			items.append(text)
			_set_field(field, items)
	)


## Um campo de cartas pode ter itens vindos de um compêndio, se a mesa já o adicionou.
func _has_source(field: Dictionary) -> bool:
	var source: Dictionary = field.get("source", {})
	return not source.is_empty() and _client.has_compendium(str(source["compendium"]))


## O compêndio da lista ainda não está na mesa: oferece pôr (qualquer um pode) e escolher dele, ou escrever.
func _offer_compendium(field: Dictionary) -> void:
	var id := str(field["source"]["compendium"])
	var name := str(_client.compendium_summary(id).get("name", id))
	_begin_choice("Escolher %s" % str(field["itemLabel"]).to_lower(), [
		{"label": "Escolher do compêndio %s, que será adicionado à mesa" % name, "value": true},
		{"label": "Escrever à mão", "value": false},
	], func(use_compendium: bool) -> void:
		if not use_compendium:
			_add_card_free(field)
			return
		_pending_add = field
		_client.add_compendium(id))


func _on_compendiums_changed(_ids: Array) -> void:
	if _pending_add.is_empty() or _mode != "browse" or _character_id.is_empty():
		return
	if _has_source(_pending_add):
		var field := _pending_add
		_pending_add = {}
		_pick_from_compendium(field)


func _empty_card(title: String, text: String = "") -> Dictionary:
	return {"id": _new_id(), "title": title, "text": text, "details": [], "meters": [], "abilities": []}


func _add_card(field: Dictionary, card: Dictionary) -> void:
	var cards: Array = (_value(field) as Array).duplicate(true)
	cards.append(card)
	_set_field(field, cards)


## Uma carta sem origem: só o nome e, se quiser, o texto.
func _add_card_free(field: Dictionary) -> void:
	_begin_edit(str(field["itemLabel"]), "", func(title: String) -> void:
		if title.strip_edges().is_empty():
			return
		_begin_edit("Texto de %s, pode ficar vazio" % title.strip_edges(), "", func(text: String) -> void:
			_add_card(field, _empty_card(title.strip_edges(), text.strip_edges())), true))


func _pick_from_compendium(field: Dictionary) -> void:
	var source: Dictionary = field["source"]
	var item: Dictionary = _client.compendium_item(str(source["compendium"]), str(source["item"]))
	if item.is_empty():
		_pending_pick = field
		Speech.say("Carregando o compêndio.", true)
		return
	_pending_pick = {}
	var categories: Array = []
	for entry in item["entries"]:
		if not categories.has(entry["category"]):
			categories.append(entry["category"])
	var options: Array = []
	for category in categories:
		options.append({"label": category, "value": category})
	options.append({"label": "Escrever outro", "value": ""})
	_begin_choice("Tipo de %s" % str(field["itemLabel"]).to_lower(), options, func(category: String) -> void:
		if category.is_empty():
			_add_card_free(field)
			return
		var names: Array = []
		for entry in item["entries"]:
			if entry["category"] == category:
				names.append({"label": entry["name"], "value": entry})
		_begin_choice(category, names, func(chosen: Dictionary) -> void:
			var details: Array = []
			for extra in chosen["extras"]:
				if not extra.has("meter"):
					details.append({"label": extra["label"], "value": ""})
			_ask_details(field, chosen, details, 0)))


## Pergunta, um a um, os campos de texto do ativo (nome, especialidade...); vazio é permitido.
func _ask_details(field: Dictionary, entry: Dictionary, details: Array, index: int) -> void:
	if index >= details.size():
		_add_card(field, _card_from_entry(entry, details))
		return
	_begin_edit("%s de %s, Enter vazio pula" % [details[index]["label"], entry["name"]], "", func(text: String) -> void:
		details[index]["value"] = text.strip_edges()
		_ask_details(field, entry, details, index + 1))


func _card_from_entry(entry: Dictionary, details: Array) -> Dictionary:
	var card := _empty_card(str(entry["name"]), str(entry["flavor"]))
	card["details"] = details
	for extra in entry["extras"]:
		if extra.has("meter"):
			card["meters"].append({
				"label": extra["label"],
				"value": int(extra["meter"]["start"]),
				"max": int(extra["meter"]["max"]),
			})
	for ability in entry["abilities"]:
		card["abilities"].append({"name": ability["name"], "text": ability["text"], "marked": ability["starts"]})
	return card


func _confirm_remove_card(field: Dictionary, card_id: String) -> void:
	var title := ""
	for card in _value(field) as Array:
		if card["id"] == card_id:
			title = str(card["title"])
	_begin_choice("Remover %s da ficha?" % title, [
		{"label": "Não, manter", "value": false},
		{"label": "Sim, remover", "value": true},
	], func(confirmed: bool) -> void:
		if not confirmed:
			return
		var cards: Array = (_value(field) as Array).duplicate(true)
		cards = cards.filter(func(card: Dictionary) -> bool: return card["id"] != card_id)
		if not _card_id.is_empty():
			_card_id = ""
			_cursor = _card_return
		_set_field(field, cards))


func _on_compendium_item(_compendium_id: String, _item: Dictionary) -> void:
	if _pending_pick.is_empty() or _mode != "browse" or _character_id.is_empty():
		return
	if _has_source(_pending_pick):
		_pick_from_compendium(_pending_pick)


func _activate_field(field: Dictionary) -> void:
	var value: Variant = _value(field)
	match field["type"]:
		"number":
			_next_kind = "int"
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


func _roll(row: Dictionary, private_roll: bool = false, edge: int = 0) -> void:
	if row.is_empty():
		return
	var field: Dictionary = row.get("field", {})
	if edge != 0 and (row["kind"] != "field" or field.get("roll", "") != "dungeon-world"):
		Sfx.play("error")
		Speech.say("Vantagem e desvantagem valem nos atributos do Dungeon World.", true)
		return
	if row["kind"] == "field" and (
		(field["type"] == "number" and field.get("roll", "") != "")
		or (field["type"] == "progress" and field.get("rollable", false))
	):
		Sfx.play("activate")
		_client.roll_field(_character_id, field["id"], "", private_roll, edge)
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
		Speech.say("Aqui não há progresso para ajustar.", true)
		return
	Sfx.play("tick", 1.25 if times > 0 else 0.75)
	_announce_next = true
	_client.sheet_op(_character_id, op)


func _remove(row: Dictionary) -> void:
	if row.is_empty():
		return
	var field: Dictionary = row.get("field", {})
	if row["kind"] == "card_item":
		_confirm_remove_card(field, str((_value(field) as Array)[row["index"]]["id"]))
	elif row["kind"] == "card_remove":
		_confirm_remove_card(_card_field, _card_id)
	elif row["kind"] == "list_item":
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
	_local = false
	_card_id = ""
	_character_id = ""
	_cursor = 0
	_rebuild()


func _open(id: String, position: String = "") -> void:
	_local = false
	_card_id = ""
	_owner_pick = ""
	_character_id = id
	_cursor = 0
	_box = 0
	_rebuild()
	var which := "%s, %s" % [_character()["name"], position] if not position.is_empty() else str(_character()["name"])
	Speech.say("Ficha de %s aberta. %s" % [which, _current_text()], true)


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
		_edit.kind = _next_kind
		_next_kind = "text"
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
	# Cópia local automática das fichas do jogador: fechar o app nunca perde a ficha.
	if str(character["owner"]) == _you_name:
		SheetLibrary.save(character)
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
		Speech.say("A ficha saiu da mesa. Voltando à lista de fichas.", true)
	elif _character_id.is_empty():
		_rebuild()
