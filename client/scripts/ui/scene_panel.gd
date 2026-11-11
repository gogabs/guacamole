extends VBoxContainer
## Região "Cena": os cards da cena ativa e, para o anfitrião, a lista de cenas. Tudo por teclado.
##
## Cards:  Setas navegam, Enter edita ou adiciona, Shift+Cima/Baixo movem, Delete remove,
##         S abre a lista de cenas (anfitrião), H lê a ajuda.
## Cenas:  Enter ativa a cena, cria uma nova ou alterna quem edita; E renomeia; Delete exclui;
##         Escape volta aos cards.
##
## É um componente próprio, então quem fala é o app (Prism). O campo de edição que aparece
## sob a região é nativo: o AccessKit o anuncia e o app não repete.

const ThemeFactory := preload("res://scripts/ui/theme_factory.gd")
const EditField := preload("res://scripts/ui/edit_field.gd")
const EditArea := preload("res://scripts/ui/edit_area.gd")
const FocusZone := preload("res://scripts/ui/focus_zone.gd")

const HELP_CARDS := (
	"Cena. Setas navegam, Enter edita o card ou adiciona um novo, Shift mais cima ou baixo movem o card, "
	+ "Delete remove. Só o anfitrião: V oculta ou revela o card, S abre a lista de cenas."
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

var _mode := "browse"  # browse | choice | edit
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
	_rebuild()


# --- Dados --------------------------------------------------------------------------------

func _is_host() -> bool:
	return str(_client.you.get("role", "")) == "host"


func _can_edit() -> bool:
	return _is_host() or str(_client.scene.get("editors", "")) == "everyone"


func _active() -> Dictionary:
	for scene in _client.scene.get("scenes", []):
		if scene["id"] == _client.scene.get("activeId"):
			return scene
	return {"id": "", "name": "", "cards": []}


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
	if _scenes_view:
		for scene in _client.scene.get("scenes", []):
			_rows.append({"kind": "scene", "scene": scene})
		_rows.append({"kind": "new_scene"})
		_rows.append({"kind": "editors"})
	else:
		var cards: Array = _active()["cards"]
		for i in cards.size():
			_rows.append({"kind": "card", "index": i})
		if _can_edit():
			_rows.append({"kind": "new_card"})
	_cursor = clampi(_cursor, 0, maxi(0, _rows.size() - 1))
	_render()


func _row_text(row: Dictionary) -> String:
	match row["kind"]:
		"card":
			var card: Dictionary = _active()["cards"][row["index"]]
			var text := _flat(str(card["text"]))
			var line := str(card["title"]) if text.is_empty() else "%s: %s" % [card["title"], text]
			return "Oculto, %s" % line if card.get("hidden", false) else line
		"new_card":
			return "Adicionar card"
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


func _title() -> String:
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
		Speech.say("%s. %s" % [_title(), _current_text()], false)


func _on_key(key: InputEventKey) -> void:
	if key.alt_pressed or key.meta_pressed or key.ctrl_pressed:
		return
	var handled := false
	if _mode == "choice":
		handled = _choice_key(key)
	elif _scenes_view:
		handled = _scenes_key(key)
	else:
		handled = _cards_key(key)
	if handled:
		_zone.accept_event()


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
	Speech.say(_current_text(), true)


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
			if row["kind"] == "new_card":
				_edit_card("", "", "")
			elif _can_edit():
				var card: Dictionary = _active()["cards"][row["index"]]
				_edit_card(str(card["id"]), str(card["title"]), str(card["text"]))
			else:
				Speech.say(_row_text(row), true)
		KEY_DELETE:
			if not key.echo and row.get("kind", "") == "card":
				_confirm_remove_card(row)
		_:
			return false
	return true


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
	var target: int = int(row["index"]) + direction
	if target < 0 or target >= cards.size():
		Sfx.play("edge")
		return
	# O cursor acompanha o card movido.
	_cursor = target
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

func _on_scene_changed(_scene: Dictionary) -> void:
	if _mode == "browse":
		_rebuild()
	# A cena ativa mudou de nome ou foi excluída: sai da lista de cenas se não houver mais o que ver.
	if _announce_next and _mode == "browse":
		_announce_next = false
		if not _rows.is_empty():
			Speech.say(_current_text(), true)
