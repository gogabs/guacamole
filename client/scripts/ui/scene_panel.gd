extends VBoxContainer
## Região "Cena": os cards da cena ativa e, para o anfitrião, a lista de cenas. Tudo por teclado.
##
## Cards:  Setas navegam, Enter edita ou adiciona, Shift+Cima/Baixo movem, Delete remove,
##         P põe o card numa zona, Esquerda/Direita giram um relógio,
##         S abre a lista de cenas (anfitrião), H lê a ajuda.
## Zonas:  áreas nomeadas do grid; Enter (anfitrião) edita nome, descrição e células.
## Cenas:  Enter ativa a cena, cria uma nova ou alterna quem edita; E renomeia; Delete exclui;
##         Escape volta aos cards.
##
## É um componente próprio, então quem fala é o app (Prism). O campo de edição que aparece
## sob a região é nativo: o AccessKit o anuncia e o app não repete.
## Acima da lista, SceneCanvas desenha a imagem, as zonas e os tokens para quem enxerga.

const ThemeFactory := preload("res://scripts/ui/theme_factory.gd")
const EditField := preload("res://scripts/ui/edit_field.gd")
const EditArea := preload("res://scripts/ui/edit_area.gd")
const FocusZone := preload("res://scripts/ui/focus_zone.gd")
const SceneCanvas := preload("res://scripts/ui/scene_canvas.gd")
const SheetLibrary := preload("res://scripts/ui/sheet_library.gd")
const CardDetail := preload("res://scripts/ui/card_detail.gd")

const SEGMENT_CHOICES := [4, 6, 8, 10, 12]
const DURATION_PROMPT := "Duração: minutos e segundos como 2:30, ou só os minutos"
const TABLE_PROMPT := "Entradas da tabela, uma por linha, ao menos duas"

const HELP_CARDS := (
	"Cena. Setas navegam, Enter abre o card ou adiciona um novo, Shift mais cima ou baixo movem o card, "
	+ "Control mais cima ou baixo pula entre as zonas. "
	+ "Enter abre o card para ler linha a linha, E edita, Delete remove, P põe o card numa zona ou o solta. "
	+ "Esquerda e direita giram um relógio ou mudam um contador, com Shift de cinco em cinco. "
	+ "Enter num temporizador ou cronômetro inicia ou pausa, R zera; Enter numa tabela sorteia. "
	+ "Só o anfitrião: V oculta ou revela o card, Enter numa zona a edita, S abre a lista de cenas."
)
const HELP_GRID := (
	"Células da zona. Setas movem pelo grid, Espaço marca ou desmarca a célula, "
	+ "Enter confirma, Escape cancela."
)
const HELP_SCENES := (
	"Cenas. Setas navegam, Enter ativa a cena, cria uma nova ou muda quem edita os cards. "
	+ "E renomeia, Delete exclui, Escape volta aos cards."
)

var _client: Node
var _zone: PanelContainer
var _view: RichTextLabel
var _edit: LineEdit
var _area: TextEdit

var _canvas: Control
## Card aberto (ordem de turnos, votação ou lista): a lista mostra o interior dele.
var _open_id := ""
var _detail: RefCounted
var _follow_entry := ""
var _tick := 0.0
var _next_kind := "text"  # tipo de digitação do próximo campo de uma linha
var _ended: Dictionary = {}  # "card/início": o fim deste temporizador já foi avisado
## Id do card que o cursor deve seguir depois da próxima mudança (ao mover ou pôr numa zona).
var _follow := ""
var _seen_active := ""

var _draft: Dictionary = {}  # "x,y" -> true: células marcadas no editor de zona
var _grid_x := 0
var _grid_y := 0
var _grid_zone_id := ""
var _grid_done: Callable

var _mode := "browse"  # browse | choice | edit | grid
var _scenes_view := false
var _rows: Array[Dictionary] = []
var _cursor := 0
var _announce_next := false
var _silent_focus := false

var _edit_done: Callable
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

	_detail = CardDetail.new(self)
	_canvas = SceneCanvas.new()
	_canvas.setup(_client)
	add_child(_canvas)

	_zone = FocusZone.new()
	_zone.setup("Cena", "Setas navegam, Enter age, H lê a ajuda.")
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
	_edit.max_length = 200
	_edit.visible = false
	_edit.text_submitted.connect(_on_edit_submitted)
	_edit.cancelled.connect(_on_edit_cancelled)
	add_child(_edit)

	_area = EditArea.new()
	_area.visible = false
	_area.submitted.connect(_on_edit_submitted)
	_area.cancelled.connect(_on_edit_cancelled)
	add_child(_area)

	_client.scene_changed.connect(_on_scene_changed)
	_client.server_error.connect(func(_message: String) -> void: _announce_next = false)
	_seen_active = str(_client.scene.get("activeId", ""))
	_rebuild()


## Mantém a lista em dia com os temporizadores e cronômetros que estão rodando e avisa, em cada
## cliente, quando um temporizador acaba (o relógio é o do servidor, então todos avisam juntos).
func _process(delta: float) -> void:
	_tick += delta
	if _tick < 0.5 or _client == null:
		return
	_tick = 0.0
	var running := false
	for card in _active().get("cards", []):
		var timer: Variant = card.get("timer")
		if not timer is Dictionary or not timer["running"]:
			continue
		running = true
		if timer["mode"] == "down" and _elapsed(timer) >= float(timer["duration"]):
			var key := "%s/%s" % [card["id"], timer["startedAt"]]
			if not _ended.has(key):
				_ended[key] = true
				Sfx.play("tick", 1.6)
				Speech.say("Tempo esgotado: %s" % card["title"], true)
	if running and _mode == "browse":
		_render()


# --- Dados --------------------------------------------------------------------------------

func _is_host() -> bool:
	return str(_client.you.get("role", "")) == "host"


func _can_edit() -> bool:
	return _is_host() or str(_client.scene.get("editors", "")) == "everyone"


func _active() -> Dictionary:
	for scene in _client.scene.get("scenes", []):
		if scene["id"] == _client.scene.get("activeId"):
			return scene
	return {"id": "", "name": "", "description": "", "background": null, "grid": {"cols": 8, "rows": 6}, "zones": [], "cards": []}


func _zone_by_id(zone_id: Variant) -> Dictionary:
	for zone in _active()["zones"]:
		if zone["id"] == zone_id:
			return zone
	return {}


func _op(op: Dictionary) -> void:
	_announce_next = true
	_client.scene_op(op)


func _new_id() -> String:
	return "%d-%d" % [Time.get_ticks_usec(), randi()]


func _plural(count: int, one: String, many: String) -> String:
	return "%d %s" % [count, one if count == 1 else many]


func _flat(text: String) -> String:
	return text.strip_edges().replace("\n", ". ")


func _rebuild() -> void:
	_rows = []
	if _open_id != "" and _detail.card().is_empty():
		_open_id = ""
	if _open_id != "":
		_rows.assign(_detail.rows())
	elif _scenes_view:
		for scene in _client.scene.get("scenes", []):
			_rows.append({"kind": "scene", "scene": scene})
		_rows.append({"kind": "new_scene"})
		_rows.append({"kind": "editors"})
	else:
		var scene := _active()
		var cards: Array = scene["cards"]
		_rows.append({"kind": "info"})
		if _is_host():
			_rows.append({"kind": "background"})
			_rows.append({"kind": "grid"})
		var loose := 0
		for card in cards:
			if card.get("zoneId") == null:
				loose += 1
		_rows.append({"kind": "header", "text": "Cards soltos, %s" % _plural(loose, "item", "itens")})
		for i in cards.size():
			if cards[i].get("zoneId") == null:
				_rows.append({"kind": "card", "index": i})
		if _can_edit():
			_rows.append({"kind": "new_card"})
		for zone in scene["zones"]:
			_rows.append({"kind": "zone", "zone": zone})
			for i in cards.size():
				if cards[i].get("zoneId") == zone["id"]:
					_rows.append({"kind": "card", "index": i})
		if _is_host():
			_rows.append({"kind": "new_zone"})
	_cursor = clampi(_cursor, 0, maxi(0, _rows.size() - 1))
	if not _follow.is_empty():
		for i in _rows.size():
			if _rows[i]["kind"] == "card" and _active()["cards"][_rows[i]["index"]]["id"] == _follow:
				_cursor = i
		_follow = ""
	if not _follow_entry.is_empty() and _open_id != "":
		for i in _rows.size():
			if _rows[i]["kind"] == "o_entry" and _detail.card()["turns"]["entries"][_rows[i]["index"]]["id"] == _follow_entry:
				_cursor = i
		_follow_entry = ""
	_canvas.show_scene(_active())
	_render()


func _row_text(row: Dictionary) -> String:
	if str(row["kind"]).begins_with("o_"):
		return _detail.text(row)
	match row["kind"]:
		"card":
			var card: Dictionary = _active()["cards"][row["index"]]
			var text := _flat(str(card["text"]))
			var line := str(card["title"]) if text.is_empty() else "%s: %s" % [card["title"], text]
			match str(card.get("kind", "note")):
				"image":
					line = "Imagem, %s" % line
				"turns", "poll", "checklist":
					line = _detail.summary(card)
				"counter":
					var counter: Dictionary = card["counter"]
					line = "Contador, %s: %d, de %d a %d" % [card["title"], int(counter["value"]), int(counter["min"]), int(counter["max"])]
				"timer", "stopwatch":
					line = _timer_text(card)
				"table":
					var table: Dictionary = card["table"]
					line = "Tabela, %s, %s" % [card["title"], _plural((table["entries"] as Array).size(), "entrada", "entradas")]
					if table["last"] != null:
						line += ", último sorteio: %s" % table["entries"][int(table["last"])]
				"audio":
					var audio: Dictionary = card["audio"]
					var modes := {"ambient": "ambiência", "music": "música", "effect": "efeito"}
					line = "Áudio, %s, %s" % [card["title"], modes[audio["mode"]]]
					if audio["playing"]:
						line += ", tocando"
				"clock":
					var clock: Dictionary = card["clock"]
					line = "Relógio, %s, %d de %d" % [card["title"], int(clock["filled"]), int(clock["segments"])]
					if not text.is_empty():
						line += ". " + text
			return "Oculto, %s" % line if card.get("hidden", false) else line
		"new_card":
			return "Adicionar card"
		"header":
			return str(row["text"])
		"info":
			var description := _flat(str(_active().get("description", "")))
			return "Descrição: %s" % description if not description.is_empty() else "Sem descrição da cena"
		"background":
			return "Fundo da cena: %s" % ("imagem definida" if _active().get("background") != null else "nenhum")
		"grid":
			var grid: Dictionary = _active()["grid"]
			return "Grid das zonas: %d colunas por %d linhas" % [int(grid["cols"]), int(grid["rows"])]
		"zone":
			var zone: Dictionary = row["zone"]
			var count := 0
			for card in _active()["cards"]:
				if card.get("zoneId") == zone["id"]:
					count += 1
			var summary := "Zona %s, %s, %s" % [
				zone["name"], _plural((zone["cells"] as Array).size(), "célula", "células"), _plural(count, "card", "cards")
			]
			var note := _flat(str(zone.get("description", "")))
			return "%s. %s" % [summary, note] if not note.is_empty() else summary
		"new_zone":
			return "Nova zona"
		"scene":
			var scene: Dictionary = row["scene"]
			return "%s%s, %s" % [
				scene["name"],
				", ativa" if scene["id"] == _client.scene.get("activeId") else "",
				_plural((scene["cards"] as Array).size(), "card", "cards"),
			]
		"new_scene":
			return "Nova cena"
	return "Quem edita os cards: %s" % ("todos" if _client.scene.get("editors") == "everyone" else "só o anfitrião")


func _current_text() -> String:
	if _rows.is_empty():
		return "Cena vazia." if not _scenes_view else "Nada aqui."
	return _row_text(_rows[_cursor])


## O tipo do item, dito ao chegar nele: tudo o que responde a Enter é botão.
func _focus_text() -> String:
	if _rows.is_empty():
		return _current_text()
	var row := _rows[_cursor]
	var is_button: bool
	if str(row["kind"]).begins_with("o_"):
		return "%s, botão" % _current_text() if _detail.is_button(row) else _current_text()
	match row["kind"]:
		"header":
			is_button = false
		"info", "zone":
			is_button = _is_host()
		"card":
			is_button = _can_edit()
		_:
			is_button = true
	return "%s, botão" % _current_text() if is_button else _current_text()


func _title() -> String:
	if _open_id != "":
		return _detail.title()
	return "Cenas da mesa" if _scenes_view else "Cena: %s" % _active()["name"]


func _render() -> void:
	_view.clear()
	_view.append_text("[color=#%s][b]%s[/b][/color]\n" % [ThemeFactory.ACCENT.to_html(false), _title().replace("[", "[lb]")])
	if _mode == "choice":
		_view.append_text("%s\n" % _choice_title.replace("[", "[lb]"))
		for i in _choice_options.size():
			var label := str(_choice_options[i]["label"]).replace("[", "[lb]")
			_view.append_text(("[bgcolor=#2b3a55]▶ %s[/bgcolor]\n" if i == _choice_index else "   %s\n") % label)
		return
	if _mode == "grid":
		_view.append_text("%s\n" % _choice_title.replace("[", "[lb]"))
		var grid: Dictionary = _active()["grid"]
		for y in int(grid["rows"]):
			var line := ""
			for x in int(grid["cols"]):
				var mark := "■" if _draft.has("%d,%d" % [x, y]) else ("▒" if not _cell_owner(x, y).is_empty() else "·")
				line += "[bgcolor=#2b3a55]%s[/bgcolor] " % mark if x == _grid_x and y == _grid_y else "%s " % mark
			_view.append_text(line + "\n")
		return
	if _rows.is_empty():
		_view.append_text("[color=#9aa0a6]Nenhum card nesta cena.[/color]\n")
	for i in _rows.size():
		var line := _row_text(_rows[i]).replace("[", "[lb]")
		if i == _cursor:
			_view.append_text("[bgcolor=#2b3a55]▶ %s[/bgcolor]\n" % line)
		else:
			_view.append_text("   %s\n" % line)
	_scroll.call_deferred()


func _scroll() -> void:
	_view.scroll_to_paragraph(_cursor + 1)


# --- Teclado ------------------------------------------------------------------------------------

func _on_zone_focus() -> void:
	if _silent_focus:
		_silent_focus = false
		return
	if _mode == "browse":
		Speech.say("%s. %s" % [_title(), _focus_text()], false)


func _on_key(key: InputEventKey) -> void:
	if key.ctrl_pressed and not key.alt_pressed and not key.meta_pressed and (key.keycode == KEY_UP or key.keycode == KEY_DOWN):
		if _mode == "browse" and _open_id == "" and not _scenes_view:
			_jump_section(-1 if key.keycode == KEY_UP else 1)
			_zone.accept_event()
		return
	if key.alt_pressed or key.meta_pressed or key.ctrl_pressed:
		return
	var handled := false
	if _mode == "choice":
		handled = _choice_key(key)
	elif _mode == "grid":
		handled = _grid_key(key)
	elif _open_id != "":
		handled = _open_key(key)
	elif _scenes_view:
		handled = _scenes_key(key)
	else:
		handled = _cards_key(key)
	if handled:
		_zone.accept_event()


## Control mais cima ou baixo: vai ao início da seção anterior ou seguinte (os soltos e cada zona).
func _jump_section(direction: int) -> void:
	var target := _cursor
	while true:
		target += direction
		if target < 0 or target >= _rows.size():
			Sfx.play("edge")
			return
		if _rows[target]["kind"] == "header" or _rows[target]["kind"] == "zone":
			break
	_go_to(target)


func _navigate(key: InputEventKey) -> bool:
	if key.shift_pressed:
		return false
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
	Sfx.play("focus_button", 0.8 + 0.5 * float(_cursor) / maxf(1.0, _rows.size() - 1.0))
	_render()
	Speech.say(_focus_text(), true)


func _confirms(key: InputEventKey) -> bool:
	return not key.echo and (key.keycode == KEY_ENTER or key.keycode == KEY_KP_ENTER or key.keycode == KEY_SPACE)


func _cards_key(key: InputEventKey) -> bool:
	if _navigate(key):
		return true
	var row := _rows[_cursor] if not _rows.is_empty() else {}
	match key.keycode:
		KEY_H:
			Speech.say(HELP_CARDS, true)
		KEY_S:
			if not _is_host():
				Sfx.play("error")
				Speech.say("Só o anfitrião troca de cena.", true)
			else:
				_scenes_view = true
				_cursor = 0
				_rebuild()
				Sfx.play("open_input")
				Speech.say("%s. %s" % [_title(), _current_text()], true)
		KEY_UP, KEY_DOWN:
			if key.shift_pressed and row.get("kind", "") == "card":
				_move_card(row, -1 if key.keycode == KEY_UP else 1)
		KEY_V:
			if key.echo or row.get("kind", "") != "card":
				return true
			if not _is_host():
				Sfx.play("error")
				Speech.say("Só o anfitrião oculta ou revela cards.", true)
			else:
				var card: Dictionary = _active()["cards"][row["index"]]
				var hidden: bool = card.get("hidden", false)
				Sfx.play("tick", 1.2 if hidden else 0.8)
				_op({"type": "card:visibility", "cardId": card["id"], "hidden": not hidden})
		KEY_ENTER, KEY_KP_ENTER, KEY_SPACE:
			if key.echo or row.is_empty():
				return true
			Sfx.play("activate")
			_activate(row)
		KEY_LEFT, KEY_RIGHT:
			if not key.echo and row.get("kind", "") == "card":
				_nudge_card(row, (-1 if key.keycode == KEY_LEFT else 1) * (5 if key.shift_pressed else 1))
		KEY_R:
			if not key.echo and row.get("kind", "") == "card":
				_reset_timer(row)
		KEY_E:
			if not key.echo and row.get("kind", "") == "card":
				_edit_definition(row)
		KEY_P:
			if not key.echo and row.get("kind", "") == "card":
				_place_card(row)
		KEY_DELETE:
			if not key.echo and row.get("kind", "") == "card":
				_confirm_remove_card(row)
			elif not key.echo and row.get("kind", "") == "zone" and _is_host():
				_confirm_remove_zone(row["zone"])
		_:
			return false
	return true


## Dentro de um card aberto: navegação e Escape são daqui, o resto é do CardDetail.
func _open_key(key: InputEventKey) -> bool:
	if _navigate(key):
		return true
	var row := _rows[_cursor] if not _rows.is_empty() else {}
	if key.keycode == KEY_ESCAPE:
		_follow = _open_id
		_open_id = ""
		_cursor = 0
		_rebuild()
		Sfx.play("close_input")
		Speech.say("%s. %s" % [_title(), _current_text()], true)
		return true
	if key.keycode == KEY_H:
		Speech.say(_detail.help(), true)
		return true
	return _detail.key(key, row)


func _scenes_key(key: InputEventKey) -> bool:
	if _navigate(key):
		return true
	var row := _rows[_cursor] if not _rows.is_empty() else {}
	match key.keycode:
		KEY_ESCAPE:
			_scenes_view = false
			_cursor = 0
			_rebuild()
			Sfx.play("close_input")
			Speech.say("%s. %s" % [_title(), _current_text()], true)
		KEY_H:
			Speech.say(HELP_SCENES, true)
		KEY_E:
			if not key.echo and row.get("kind", "") == "scene":
				var scene: Dictionary = row["scene"]
				_begin_edit("Nome da cena", str(scene["name"]), func(text: String) -> void:
					if not text.strip_edges().is_empty():
						_op({"type": "scene:rename", "sceneId": scene["id"], "name": text}))
		KEY_ENTER, KEY_KP_ENTER, KEY_SPACE:
			if key.echo or row.is_empty():
				return true
			Sfx.play("activate")
			match row["kind"]:
				"scene":
					_op({"type": "scene:activate", "sceneId": row["scene"]["id"]})
				"new_scene":
					_begin_edit("Nome da nova cena", "", func(text: String) -> void:
						if not text.strip_edges().is_empty():
							_op({"type": "scene:create", "id": _new_id(), "name": text}))
				"editors":
					var next := "host" if _client.scene.get("editors") == "everyone" else "everyone"
					_op({"type": "scene:editors", "editors": next})
		KEY_DELETE:
			if not key.echo and row.get("kind", "") == "scene":
				var scene: Dictionary = row["scene"]
				_begin_choice(
					"Excluir a cena %s?" % scene["name"],
					[{"label": "Não, manter", "value": false}, {"label": "Sim, excluir", "value": true}],
					func(confirmed: bool) -> void:
						if confirmed:
							_op({"type": "scene:delete", "sceneId": scene["id"]})
				)
		_:
			return false
	return true


# --- Ações nos cards -----------------------------------------------------------------------

func _edit_card(card_id: String, title: String, text: String) -> void:
	_begin_edit("Título do card", title, func(new_title: String) -> void:
		_begin_edit("Texto do card", text, func(new_text: String) -> void:
			if new_title.strip_edges().is_empty() and new_text.strip_edges().is_empty():
				return
			if card_id.is_empty():
				_op({"type": "card:add", "id": _new_id(), "title": new_title, "text": new_text})
			else:
				_op({"type": "card:edit", "cardId": card_id, "title": new_title, "text": new_text}),
			true))


func _move_card(row: Dictionary, direction: int) -> void:
	if not _can_edit():
		Sfx.play("error")
		Speech.say("Só o anfitrião mexe nos cards desta mesa.", true)
		return
	var cards: Array = _active()["cards"]
	# Só troca com cards da mesma zona (ou da coluna de soltos): é o que se vê na seção.
	var zone_id: Variant = cards[row["index"]].get("zoneId")
	var target: int = int(row["index"]) + direction
	while target >= 0 and target < cards.size() and cards[target].get("zoneId") != zone_id:
		target += direction
	if target < 0 or target >= cards.size():
		Sfx.play("edge")
		return
	# O cursor acompanha o card movido.
	_follow = str(cards[row["index"]]["id"])
	Sfx.play("tick", 1.2 if direction < 0 else 0.8)
	_op({"type": "card:move", "cardId": cards[row["index"]]["id"], "direction": direction})


func _confirm_remove_card(row: Dictionary) -> void:
	if not _can_edit():
		Sfx.play("error")
		Speech.say("Só o anfitrião mexe nos cards desta mesa.", true)
		return
	var card: Dictionary = _active()["cards"][row["index"]]
	_begin_choice(
		"Remover o card %s?" % card["title"],
		[{"label": "Não, manter", "value": false}, {"label": "Sim, remover", "value": true}],
		func(confirmed: bool) -> void:
			if confirmed:
				_op({"type": "card:remove", "cardId": card["id"]})
	)


## Abre o card para ler por dentro, linha a linha, ou para agir (votar, marcar, passar o turno).
func _open_card(card: Dictionary) -> void:
	_open_id = str(card["id"])
	_cursor = 0
	_rebuild()
	Sfx.play("open_input")
	Speech.say("%s. %s" % [_title(), _current_text()], true)


func _activate(row: Dictionary) -> void:
	match row["kind"]:
		"new_card":
			_new_card()
		"card":
			var card: Dictionary = _active()["cards"][row["index"]]
			var card_kind := str(card.get("kind", "note"))
			# Ler e votar não dependem de poder editar.
			if card_kind in ["note", "image", "turns", "poll", "checklist"]:
				_open_card(card)
				return
			if not _can_edit():
				Speech.say(_row_text(row), true)
				return
			match card_kind:
				"clock":
					_edit_clock(card)
				"counter":
					_ask_counter_value(card)
				"timer", "stopwatch":
					_toggle_timer(card)
				"table":
					_roll_table(card)
				_:
					_edit_card(str(card["id"]), str(card["title"]), str(card["text"]))
		"info":
			if _is_host():
				_begin_edit("Descrição da cena", str(_active().get("description", "")), func(text: String) -> void:
					_op({"type": "scene:describe", "sceneId": _active()["id"], "description": text}), true)
			else:
				Speech.say(_row_text(row), true)
		"background":
			_begin_choice("Fundo da cena.", [
				{"label": "Escolher uma imagem", "value": "pick"},
				{"label": "Tirar o fundo", "value": "clear"},
			], func(choice: String) -> void:
				if choice == "clear":
					_op({"type": "scene:background", "sceneId": _active()["id"], "mediaId": null})
				else:
					_pick_image(func(media_id: String) -> void:
						_op({"type": "scene:background", "sceneId": _active()["id"], "mediaId": media_id})))
		"grid":
			var grid: Dictionary = _active()["grid"]
			_begin_number("Colunas do grid, de 1 a 24", str(grid["cols"]), func(cols: String) -> void:
				_begin_number("Linhas do grid, de 1 a 16", str(grid["rows"]), func(rows: String) -> void:
					if cols.is_valid_int() and rows.is_valid_int():
						_op({"type": "scene:grid", "sceneId": _active()["id"], "cols": int(cols), "rows": int(rows)})
					else:
						Sfx.play("error")
						Speech.say("Use números.", true)))
		"zone":
			if _is_host():
				_edit_zone(row["zone"])
			else:
				Speech.say(_row_text(row), true)
		"new_zone":
			_edit_zone({})


## Nota, imagem, relógio, contador, temporizador, cronômetro ou tabela aleatória.
func _new_card() -> void:
	_begin_choice("Que tipo de card?", [
		{"label": "Nota, título e texto", "value": "note"},
		{"label": "Imagem, escolhida num arquivo", "value": "image"},
		{"label": "Relógio, com segmentos para preencher", "value": "clock"},
		{"label": "Contador, um número com mínimo e máximo", "value": "counter"},
		{"label": "Temporizador, conta para baixo", "value": "timer"},
		{"label": "Cronômetro, conta para cima", "value": "stopwatch"},
		{"label": "Tabela aleatória, sorteia uma entrada", "value": "table"},
		{"label": "Ordem de turnos, manual, iniciativa ou pipoca", "value": "turns"},
		{"label": "Votação, com opções e resultado no fim", "value": "poll"},
		{"label": "Lista de verificação, itens para marcar", "value": "checklist"},
	], _start_card)


func _start_card(kind: String) -> void:
	match kind:
		"image":
			_pick_image(_new_image_card)
		"clock":
			_begin_edit("Título do relógio", "", _new_clock_card)
		"counter":
			_begin_edit("Título do contador", "", _new_counter_card)
		"timer":
			_begin_edit("Título do temporizador", "", _new_timer_card)
		"stopwatch":
			_begin_edit("Título do cronômetro", "", func(title: String) -> void:
				if not title.strip_edges().is_empty():
					_op({"type": "card:add", "id": _new_id(), "title": title, "text": "", "kind": "stopwatch"}))
		"table":
			_begin_edit("Título da tabela", "", _new_table_card)
		"turns", "poll", "checklist":
			_begin_edit("Título do card", "", func(title: String) -> void:
				if not title.strip_edges().is_empty():
					_detail.create(kind, title))
		_:
			_edit_card("", "", "")


func _new_counter_card(title: String) -> void:
	if title.strip_edges().is_empty():
		return
	_begin_number("Valor máximo, de 1 a 999", "10", func(maximum: String) -> void:
		_begin_number("Valor inicial", "0", func(start: String) -> void:
			_op({"type": "card:add", "id": _new_id(), "title": title, "text": "", "kind": "counter",
				"min": 0, "max": int(maximum) if maximum.is_valid_int() else 10, "value": int(start) if start.is_valid_int() else 0})))


func _new_timer_card(title: String) -> void:
	if title.strip_edges().is_empty():
		return
	_begin_duration(DURATION_PROMPT, "5", func(text: String) -> void:
		var seconds := _parse_duration(text)
		if seconds <= 0:
			Sfx.play("error")
			Speech.say("Duração inválida.", true)
			return
		_op({"type": "card:add", "id": _new_id(), "title": title, "text": "", "kind": "timer", "duration": seconds}))


func _new_table_card(title: String) -> void:
	if title.strip_edges().is_empty():
		return
	_begin_edit(TABLE_PROMPT, "", func(text: String) -> void:
		_op({"type": "card:add", "id": _new_id(), "title": title, "text": "", "kind": "table", "entries": text.split("\n")}), true)


## "2:30" são dois minutos e meio; só "5" são cinco minutos.
func _parse_duration(text: String) -> int:
	var clean := text.strip_edges()
	if clean.contains(":"):
		var parts := clean.split(":")
		if parts.size() == 2 and parts[0].is_valid_int() and parts[1].is_valid_int():
			return int(parts[0]) * 60 + int(parts[1])
		return 0
	return int(float(clean) * 60.0) if clean.is_valid_float() else 0


func _elapsed(timer: Dictionary) -> float:
	var seconds := float(timer["base"])
	if timer["running"] and timer["startedAt"] != null:
		seconds += maxf(0.0, (_client.server_ms() - float(timer["startedAt"])) / 1000.0)
	return seconds


## "1 minuto e 30 segundos", para a fala.
func _spoken_time(seconds: float) -> String:
	var total := int(ceil(maxf(0.0, seconds)))
	var hours := total / 3600
	var minutes := (total % 3600) / 60
	var secs := total % 60
	var parts: Array = []
	if hours > 0:
		parts.append(_plural(hours, "hora", "horas"))
	if minutes > 0:
		parts.append(_plural(minutes, "minuto", "minutos"))
	if secs > 0 or parts.is_empty():
		parts.append(_plural(secs, "segundo", "segundos"))
	return " e ".join(parts) if parts.size() <= 2 else "%s, %s e %s" % [parts[0], parts[1], parts[2]]


func _timer_text(card: Dictionary) -> String:
	var timer: Dictionary = card["timer"]
	var elapsed := _elapsed(timer)
	if timer["mode"] == "up":
		return "Cronômetro, %s, %s, %s" % [card["title"], _spoken_time(elapsed), "rodando" if timer["running"] else "parado"]
	var left := float(timer["duration"]) - elapsed
	if left <= 0.0:
		return "Temporizador, %s, esgotado" % card["title"]
	if timer["running"]:
		return "Temporizador, %s, faltam %s, rodando" % [card["title"], _spoken_time(left)]
	return "Temporizador, %s, %s%s" % [card["title"], _spoken_time(left), "" if elapsed <= 0.0 else ", pausado"]


func _toggle_timer(card: Dictionary) -> void:
	var timer: Dictionary = card["timer"]
	_op({"type": "card:timer", "cardId": card["id"], "action": "pause" if timer["running"] else "start"})


func _reset_timer(row: Dictionary) -> void:
	var card: Dictionary = _active()["cards"][row["index"]]
	if card.get("timer") == null:
		return
	if not _can_edit():
		Sfx.play("error")
		Speech.say("Só o anfitrião mexe nos cards desta mesa.", true)
		return
	Sfx.play("tick", 0.8)
	_op({"type": "card:timer", "cardId": card["id"], "action": "reset"})


func _roll_table(card: Dictionary) -> void:
	Sfx.play("tick", 1.1)
	_op({"type": "card:roll", "cardId": card["id"]})


func _ask_counter_value(card: Dictionary) -> void:
	var counter: Dictionary = card["counter"]
	_begin_signed("Novo valor, de %d a %d" % [int(counter["min"]), int(counter["max"])], str(int(counter["value"])), func(text: String) -> void:
		if text.strip_edges().is_valid_int():
			_op({"type": "card:counter", "cardId": card["id"], "value": int(text)})
		else:
			Sfx.play("error")
			Speech.say("Use um número.", true))


## E: edita o que define o card (título e, conforme o tipo, o resto).
func _edit_definition(row: Dictionary) -> void:
	if not _can_edit():
		Sfx.play("error")
		Speech.say("Só o anfitrião mexe nos cards desta mesa.", true)
		return
	var card: Dictionary = _active()["cards"][row["index"]]
	var cid := str(card["id"])
	var text := str(card["text"])
	match str(card.get("kind", "note")):
		"clock":
			_edit_clock(card)
		"counter":
			var counter: Dictionary = card["counter"]
			_begin_edit("Título do contador", str(card["title"]), func(title: String) -> void:
				_begin_signed("Valor mínimo", str(int(counter["min"])), func(low: String) -> void:
					_begin_signed("Valor máximo", str(int(counter["max"])), func(high: String) -> void:
						_op({"type": "card:edit", "cardId": cid, "title": title, "text": text,
							"min": int(low) if low.is_valid_int() else int(counter["min"]),
							"max": int(high) if high.is_valid_int() else int(counter["max"])}))))
		"timer":
			var timer: Dictionary = card["timer"]
			_begin_edit("Título do temporizador", str(card["title"]), func(title: String) -> void:
				_begin_duration(DURATION_PROMPT, "%d:%02d" % [int(timer["duration"]) / 60, int(timer["duration"]) % 60], func(span: String) -> void:
					var seconds := _parse_duration(span)
					_op({"type": "card:edit", "cardId": cid, "title": title, "text": text, "duration": seconds if seconds > 0 else int(timer["duration"])})))
		"table":
			var entries: Array = card["table"]["entries"]
			_begin_edit("Título da tabela", str(card["title"]), func(title: String) -> void:
				_begin_edit(TABLE_PROMPT, "\n".join(entries), func(lines: String) -> void:
					_op({"type": "card:edit", "cardId": cid, "title": title, "text": text, "entries": lines.split("\n")}), true))
		_:
			_edit_card(cid, str(card["title"]), text)


func _new_image_card(media_id: String) -> void:
	_begin_edit("Título da imagem", "", func(title: String) -> void:
		_begin_edit("Descrição da imagem, lida para quem não a vê", "", func(text: String) -> void:
			if title.strip_edges().is_empty() and text.strip_edges().is_empty():
				return
			_op({"type": "card:add", "id": _new_id(), "title": title, "text": text, "kind": "image", "mediaId": media_id}),
			true))


func _new_clock_card(title: String) -> void:
	if title.strip_edges().is_empty():
		return
	_choose_segments(6, func(segments: int) -> void:
		_op({"type": "card:add", "id": _new_id(), "title": title, "text": "", "kind": "clock", "segments": segments}))

func _choose_segments(current: int, done: Callable) -> void:
	var options: Array = []
	for n in SEGMENT_CHOICES:
		options.append({"label": "%d segmentos%s" % [n, ", atual" if n == current else ""], "value": n})
	_begin_choice("Quantos segmentos?", options, done)


func _edit_clock(card: Dictionary) -> void:
	var clock: Dictionary = card["clock"]
	_begin_edit("Título do relógio", str(card["title"]), func(title: String) -> void:
		_choose_segments(int(clock["segments"]), func(segments: int) -> void:
			_op({"type": "card:edit", "cardId": card["id"], "title": title, "text": str(card["text"]), "segments": segments})))


func _nudge_card(row: Dictionary, delta: int) -> void:
	var card: Dictionary = _active()["cards"][row["index"]]
	var kind := str(card.get("kind", "note"))
	if kind != "clock" and kind != "counter":
		return
	if not _can_edit():
		Sfx.play("error")
		Speech.say("Só o anfitrião mexe nos cards desta mesa.", true)
		return
	if kind == "counter":
		var counter: Dictionary = card["counter"]
		var value := clampi(int(counter["value"]) + delta, int(counter["min"]), int(counter["max"]))
		if value == int(counter["value"]):
			Sfx.play("edge")
			return
		Sfx.play("tick", 0.8 + 0.5 * float(value - int(counter["min"])) / maxf(1.0, float(counter["max"] - counter["min"])))
		_op({"type": "card:counter", "cardId": card["id"], "value": value})
		return
	var clock: Dictionary = card["clock"]
	var target := clampi(int(clock["filled"]) + delta, 0, int(clock["segments"]))
	if target == int(clock["filled"]):
		Sfx.play("edge")
		return
	Sfx.play("tick", 0.8 + 0.5 * float(target) / maxf(1.0, float(clock["segments"])))
	_op({"type": "card:clock", "cardId": card["id"], "filled": target})


func _place_card(row: Dictionary) -> void:
	if not _can_edit():
		Sfx.play("error")
		Speech.say("Só o anfitrião mexe nos cards desta mesa.", true)
		return
	var card: Dictionary = _active()["cards"][row["index"]]
	var options: Array = [{"label": "Soltar, volta para os cards soltos", "value": ""}]
	for zone in _active()["zones"]:
		options.append({"label": "Zona %s" % zone["name"], "value": str(zone["id"])})
	if options.size() == 1:
		Speech.say("Não há zonas nesta cena. O anfitrião cria zonas no fim da lista.", true)
		return
	_begin_choice("Onde fica %s?" % card["title"], options, func(zone_id: String) -> void:
		_follow = str(card["id"])
		_op({"type": "card:place", "cardId": card["id"], "zoneId": null if zone_id.is_empty() else zone_id}))


func _confirm_remove_zone(zone: Dictionary) -> void:
	_begin_choice(
		"Remover a zona %s? Os cards nela voltam a ficar soltos." % zone["name"],
		[{"label": "Não, manter", "value": false}, {"label": "Sim, remover", "value": true}],
		func(confirmed: bool) -> void:
			if confirmed:
				_op({"type": "zone:remove", "zoneId": zone["id"]})
	)


## Escolhe uma imagem no computador, envia ao servidor e chama `done` com o id dela.
func _pick_image(done: Callable) -> void:
	var started := SheetLibrary.pick(false, "Escolher imagem", "", func(path: String) -> void:
		if path.is_empty():
			Speech.say("Cancelado.", true)
			return
		Speech.say("Enviando a imagem.", true)
		var result: Dictionary = await _client.upload_media(path)
		if not result["ok"]:
			Sfx.play("error")
			Speech.say(str(result["message"]), true)
			return
		done.call(str(result["id"])),
		PackedStringArray(["*.png, *.jpg, *.jpeg, *.webp ; Imagens"]))
	if not started:
		Sfx.play("error")
		Speech.say("Este sistema não oferece o seletor de arquivos.", true)


# --- Zonas e o grid -----------------------------------------------------------------------------

## Nome, descrição e depois as células; `zone` vazio cria uma zona nova.
func _edit_zone(zone: Dictionary) -> void:
	var zone_id := str(zone.get("id", ""))
	_begin_edit("Nome da zona", str(zone.get("name", "")), func(zone_name: String) -> void:
		if zone_name.strip_edges().is_empty():
			return
		_begin_edit("Descrição da zona", str(zone.get("description", "")), func(description: String) -> void:
			_begin_grid(zone_id, zone.get("cells", []), func(cells: Array) -> void:
				if zone_id.is_empty():
					_op({"type": "zone:add", "id": _new_id(), "name": zone_name, "description": description, "cells": cells})
				else:
					_op({"type": "zone:edit", "zoneId": zone_id, "name": zone_name, "description": description, "cells": cells}),
			), true))


func _cell_owner(x: int, y: int) -> String:
	for zone in _active()["zones"]:
		if zone["id"] == _grid_zone_id:
			continue
		for cell in zone["cells"]:
			if int(cell["x"]) == x and int(cell["y"]) == y:
				return str(zone["name"])
	return ""


func _begin_grid(zone_id: String, cells: Array, done: Callable) -> void:
	_mode = "grid"
	_grid_zone_id = zone_id
	_grid_done = done
	_draft = {}
	for cell in cells:
		_draft["%d,%d" % [int(cell["x"]), int(cell["y"])]] = true
	_grid_x = 0
	_grid_y = 0
	_choice_title = "Células da zona. Setas movem, Espaço marca, Enter confirma, Escape cancela."
	_render()
	Sfx.play("open_input")
	Speech.say("%s %s" % [_choice_title, _cell_text()], true)


func _cell_text() -> String:
	var state := "marcada" if _draft.has("%d,%d" % [_grid_x, _grid_y]) else "livre"
	var holder := _cell_owner(_grid_x, _grid_y)
	if not holder.is_empty() and state == "livre":
		state = "da zona %s" % holder
	return "Coluna %d, linha %d, %s" % [_grid_x + 1, _grid_y + 1, state]


func _grid_key(key: InputEventKey) -> bool:
	var grid: Dictionary = _active()["grid"]
	var dx := 0
	var dy := 0
	match key.keycode:
		KEY_LEFT:
			dx = -1
		KEY_RIGHT:
			dx = 1
		KEY_UP:
			dy = -1
		KEY_DOWN:
			dy = 1
		KEY_H:
			Speech.say(HELP_GRID, true)
			return true
		KEY_ESCAPE:
			_mode = "browse"
			_rebuild()
			Sfx.play("close_input")
			Speech.say("Cancelado.", true)
			return true
		KEY_SPACE:
			if key.echo:
				return true
			var cell_key := "%d,%d" % [_grid_x, _grid_y]
			if not _cell_owner(_grid_x, _grid_y).is_empty():
				Sfx.play("error")
				Speech.say("Essa célula é da zona %s." % _cell_owner(_grid_x, _grid_y), true)
			else:
				if _draft.has(cell_key):
					_draft.erase(cell_key)
				else:
					_draft[cell_key] = true
				Sfx.play("tick", 1.2 if _draft.has(cell_key) else 0.8)
				_render()
				Speech.say(_cell_text(), true)
			return true
		KEY_ENTER, KEY_KP_ENTER:
			if key.echo:
				return true
			if _draft.is_empty():
				Sfx.play("error")
				Speech.say("Marque ao menos uma célula.", true)
				return true
			var cells: Array = []
			for cell_key in _draft:
				var parts: PackedStringArray = str(cell_key).split(",")
				cells.append({"x": int(parts[0]), "y": int(parts[1])})
			var done := _grid_done
			_mode = "browse"
			_rebuild()
			Sfx.play("msg_out")
			done.call(cells)
			return true
		_:
			return true
	var nx := _grid_x + dx
	var ny := _grid_y + dy
	if nx < 0 or ny < 0 or nx >= int(grid["cols"]) or ny >= int(grid["rows"]):
		Sfx.play("edge")
		return true
	_grid_x = nx
	_grid_y = ny
	Sfx.play("focus_button", 0.8 + 0.5 * float(nx) / maxf(1.0, float(grid["cols"])))
	_render()
	Speech.say(_cell_text(), true)
	return true


# --- Escolha e edição ---------------------------------------------------------------------------

func _begin_choice(title: String, options: Array, done: Callable) -> void:
	_mode = "choice"
	_choice_title = title
	_choice_options = options
	_choice_index = 0
	_choice_done = done
	_render()
	Sfx.play("open_input")
	Speech.say("%s %s, 1 de %d" % [title, options[0]["label"], options.size()], true)


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


## Campos de número: só aceitam dígitos (os com sinal também um menos) ou, para durações, dois pontos.
func _begin_number(label: String, initial: String, done: Callable) -> void:
	_next_kind = "uint"
	_begin_edit(label, initial, done)


func _begin_signed(label: String, initial: String, done: Callable) -> void:
	_next_kind = "int"
	_begin_edit(label, initial, done)


func _begin_duration(label: String, initial: String, done: Callable) -> void:
	_next_kind = "duration"
	_begin_edit(label, initial, done)


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

func _on_scene_changed(_scene: Dictionary) -> void:
	if _mode == "browse":
		_rebuild()
	else:
		_canvas.show_scene(_active())
	# Quando o anfitrião troca de cena, todos ouvem o nome e a descrição.
	var active_id := str(_client.scene.get("activeId", ""))
	if active_id != _seen_active:
		_seen_active = active_id
		_announce_next = false
		var description := _flat(str(_active().get("description", "")))
		Speech.say("Cena %s. %s" % [_active()["name"], description] if not description.is_empty() else "Cena %s." % _active()["name"], false)
		return
	# A cena ativa mudou de nome ou foi excluída: sai da lista de cenas se não houver mais o que ver.
	if _announce_next and _mode == "browse":
		_announce_next = false
		if not _rows.is_empty():
			Speech.say(_current_text(), true)
