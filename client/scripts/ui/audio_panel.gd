extends VBoxContainer
## Região "Áudio": ambiência, música e o soundboard da cena ativa. Todos veem a lista e ajustam
## o próprio volume e a própria posição; só o anfitrião toca, para, dispara e adiciona sons.
##
## Setas navegam; Enter toca ou para (efeito: dispara); Esquerda/Direita mudam o volume;
## 1 a 9 disparam o efeito com aquela tecla; Shift+1 a 9 dão a tecla ao som; L alterna o loop;
## M troca o modo; P põe o som numa zona; E renomeia; Delete remove; H lê a ajuda.
##
## Quem fala é o app (Prism); o campo de edição que aparece sob a região é nativo.

const ThemeFactory := preload("res://scripts/ui/theme_factory.gd")
const EditField := preload("res://scripts/ui/edit_field.gd")
const FocusZone := preload("res://scripts/ui/focus_zone.gd")
const SheetLibrary := preload("res://scripts/ui/sheet_library.gd")

const MODE_NAMES := {"ambient": "ambiência", "music": "música", "effect": "efeito"}
const MODE_ORDER := ["music", "ambient", "effect"]

const HELP := (
	"Áudio. Setas navegam, esquerda e direita mudam o volume. Voz: Enter nas linhas de voz muda o modo, "
	+ "a supressão e os dispositivos; no push-to-talk, segure F4 para falar. "
		+ "Ditado: Enter na linha do ditado troca entre desligado, legendas para a mesa e diário (F5 aceita a frase, F6 descarta); "
		+ "falar ação, pergunta, resultado, consequência ou nota no começo anota em Lonelog. Anfitrião: Enter toca ou para, "
	+ "1 a 9 disparam efeitos, Shift mais número dá a tecla ao som, L liga o loop, M troca o modo, "
	+ "P põe o som numa zona, G posiciona o som num ponto exato da zona, E renomeia, Delete remove, V oculta ou revela."
)

var _client: Node
var _engine: Node
var _voice: Node
var _dictation: Node
var _zone: PanelContainer
var _view: RichTextLabel
var _edit: LineEdit

var _mode := "browse"  # browse | choice | edit
var _rows: Array[Dictionary] = []
var _cursor := 0
var _announce_next := false
var _silent_focus := false
var _follow := ""

var _edit_done: Callable
var _choice_title := ""
var _choice_options: Array = []
var _choice_index := 0
var _choice_done: Callable

var _spot_card := ""
var _spot_start: Variant = null
var _spot_at := Vector2.ZERO
var _spot_box := Rect2()


func focus_zone() -> Control:
	return _zone


func setup(client: Node, engine: Node, voice: Node, dictation: Node = null) -> void:
	_client = client
	_engine = engine
	_voice = voice
	_dictation = dictation


func _ready() -> void:
	_zone = FocusZone.new()
	_zone.setup("Áudio", "Setas navegam, Enter age, H lê a ajuda.")
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
	_edit.max_length = 120
	_edit.visible = false
	_edit.text_submitted.connect(_on_edit_submitted)
	_edit.cancelled.connect(_on_edit_cancelled)
	add_child(_edit)

	_client.scene_changed.connect(_on_scene_changed)
	_client.server_error.connect(func(_message: String) -> void: _announce_next = false)
	_voice.speakers_changed.connect(func() -> void:
		if _mode == "browse":
			_rebuild())
	if _dictation != null:
		_dictation.changed.connect(func() -> void:
			if _mode == "browse":
				_rebuild())
	_rebuild()


# --- Dados --------------------------------------------------------------------------------------

func _is_host() -> bool:
	return str(_client.you.get("role", "")) == "host"


func _active() -> Dictionary:
	for scene in _client.scene.get("scenes", []):
		if scene["id"] == _client.scene.get("activeId"):
			return scene
	return {"id": "", "name": "", "zones": [], "cards": []}


func _audio_indexes(mode: String) -> Array:
	var found: Array = []
	var cards: Array = _active()["cards"]
	for i in cards.size():
		var audio: Variant = cards[i].get("audio")
		if audio is Dictionary and audio["mode"] == mode:
			found.append(i)
	return found


func _op(op: Dictionary) -> void:
	_announce_next = true
	_client.scene_op(op)


func _new_id() -> String:
	return "%d-%d" % [Time.get_ticks_usec(), randi()]


func _plural(count: int, one: String, many: String) -> String:
	return "%d %s" % [count, one if count == 1 else many]


func _rebuild() -> void:
	_rows = []
	_rows.append({"kind": "master"})
	_rows.append({"kind": "position"})
	if _voice.available():
		for kind in ["voice_mode", "voice_positional", "voice_noise", "voice_normalize", "voice_in", "voice_out", "voice_volume", "voice_announce", "voice_speakers"]:
			_rows.append({"kind": kind})
		if _dictation != null and _dictation.available():
			for kind in ["voice_dictation", "voice_dictation_model", "voice_captions_read"]:
				_rows.append({"kind": kind})
			var shown: Array = _dictation.captions.slice(-10)
			shown.reverse()
			for caption in shown:
				_rows.append({"kind": "voice_caption", "author": caption["author"], "text": caption["text"]})
	else:
		_rows.append({"kind": "header", "text": "Voz indisponível: a extensão de voz não foi carregada."})
	if _is_host():
		_rows.append({"kind": "stop_all"})
		_rows.append({"kind": "new_audio"})
	var cards: Array = _active()["cards"]
	for mode in MODE_ORDER:
		var indexes := _audio_indexes(mode)
		if indexes.is_empty():
			continue
		_rows.append({"kind": "header", "text": "%s, %s" % [str(MODE_NAMES[mode]).capitalize(), _plural(indexes.size(), "som", "sons")]})
		for i in indexes:
			_rows.append({"kind": "audio", "index": i})
	_cursor = clampi(_cursor, 0, maxi(0, _rows.size() - 1))
	if not _follow.is_empty():
		for i in _rows.size():
			if _rows[i]["kind"] == "audio" and cards[_rows[i]["index"]]["id"] == _follow:
				_cursor = i
		_follow = ""
	_render()


func _zone_name(zone_id: Variant) -> String:
	for zone in _active()["zones"]:
		if zone["id"] == zone_id:
			return str(zone["name"])
	return ""


func _row_text(row: Dictionary) -> String:
	match row["kind"]:
		"master":
			return "Volume geral, só para você: %d" % roundi(_engine.master * 100.0)
		"position":
			var label := _zone_name(_engine.listener_zone)
			return "Onde ouço os sons da cena: %s" % ("zona %s" % label if not label.is_empty() else "centro da cena")
		"voice_mode":
			var hint: String = ", segure F4 para falar" if _voice.mode == "ptt" else ""
			return "Voz: %s%s" % [_voice.MODE_NAMES[_voice.mode], hint]
		"voice_positional":
			return "Voz posicional, mesa redonda: %s" % _voice.SPATIAL_NAMES[_voice.spatial]
		"voice_noise":
			return "Supressão de ruído: %s" % ("ligada" if _voice.suppress else "desligada")
		"voice_normalize":
			if not _voice.normalize:
				return "Normalização de volume do microfone: desligada"
			var db: float = _voice.gain_db()
			return "Normalização de volume do microfone: ligada%s" % (", ganho atual %+d dB" % roundi(db) if absf(db) >= 1.0 else "")
		"voice_in":
			return "Microfone: %s" % AudioServer.input_device
		"voice_out":
			return "Saída das vozes: %s" % AudioServer.output_device
		"voice_volume":
			return "Volume das vozes, só para você: %d" % roundi(_voice.volume * 100.0)
		"voice_announce":
			return "Avisar quem começa a falar: %s" % ("sim" if _voice.announce else "não")
		"voice_speakers":
			var names: Array = _voice.speakers()
			return "Falando agora: %s" % ", ".join(names) if not names.is_empty() else "Ninguém falando"
		"voice_dictation":
			var hint: String = ", F5 aceita e F6 descarta cada frase" if _dictation.mode == "diary" else ""
			return "Ditado: %s%s" % [_dictation.MODE_NAMES[_dictation.mode], hint]
		"voice_dictation_model":
			return _dictation.model_text()
		"voice_captions_read":
			return "Ler em voz alta as legendas dos outros: %s" % ("sim" if _dictation.read_captions else "não")
		"voice_caption":
			return "Legenda, %s: %s" % [row["author"], row["text"]]
		"stop_all":
			return "Parar todos os sons"
		"new_audio":
			return "Adicionar som"
		"header":
			return str(row["text"])
	var card: Dictionary = _active()["cards"][row["index"]]
	var audio: Dictionary = card["audio"]
	var parts: Array = [str(card["title"]), str(MODE_NAMES[audio["mode"]])]
	if audio["mode"] != "effect":
		parts.append("tocando" if audio["playing"] else "parado")
	if audio["slot"] != null:
		parts.append("tecla %d" % int(audio["slot"]))
	parts.append("volume %d" % int(audio["volume"]))
	if audio["mode"] != "effect" and audio["loop"]:
		parts.append("em loop")
	var zone := _zone_name(card.get("zoneId"))
	if not zone.is_empty():
		parts.append("na zona %s" % zone)
		if card.get("at") is Dictionary:
			parts.append("em ponto exato")
	var line := ", ".join(parts)
	return "Oculto, %s" % line if card.get("hidden", false) else line


func _is_button(row: Dictionary) -> bool:
	match row["kind"]:
		"header", "voice_speakers", "voice_caption":
			return false
		"master", "position", "voice_mode", "voice_positional", "voice_noise", "voice_normalize", "voice_in", "voice_out", "voice_volume", "voice_announce", "voice_dictation", "voice_dictation_model", "voice_captions_read":
			return true
		_:
			return _is_host()


func _focus_text() -> String:
	if _rows.is_empty():
		return "Nada aqui."
	var row := _rows[_cursor]
	return "%s, botão" % _row_text(row) if _is_button(row) else _row_text(row)


func _render() -> void:
	_view.clear()
	_view.append_text("[color=#%s][b]Áudio da cena[/b][/color]\n" % ThemeFactory.ACCENT.to_html(false))
	if _mode == "spot":
		_view.append_text("Posicionando o som. Setas movem, Enter guarda, Escape cancela.\n%s\n" % _spot_text())
		return
	if _mode == "choice":
		_view.append_text("%s\n" % _choice_title.replace("[", "[lb]"))
		for i in _choice_options.size():
			var label := str(_choice_options[i]["label"]).replace("[", "[lb]")
			_view.append_text(("[bgcolor=#2b3a55]▶ %s[/bgcolor]\n" if i == _choice_index else "   %s\n") % label)
		return
	for i in _rows.size():
		var line := _row_text(_rows[i]).replace("[", "[lb]")
		_view.append_text(("[bgcolor=#2b3a55]▶ %s[/bgcolor]\n" if i == _cursor else "   %s\n") % line)
	_scroll.call_deferred()


func _scroll() -> void:
	_view.scroll_to_paragraph(_cursor + 1)


# --- Teclado ------------------------------------------------------------------------------------

func _on_zone_focus() -> void:
	if _silent_focus:
		_silent_focus = false
		return
	if _mode == "browse":
		Speech.say("Áudio. %s" % _focus_text(), false)


func _on_key(key: InputEventKey) -> void:
	if key.alt_pressed or key.meta_pressed or key.ctrl_pressed:
		return
	var handled: bool
	match _mode:
		"choice":
			handled = _choice_key(key)
		"spot":
			handled = _spot_key(key)
		_:
			handled = _browse_key(key)
	if handled:
		_zone.accept_event()


func _go_to(target: int) -> void:
	target = clampi(target, 0, _rows.size() - 1)
	if target == _cursor:
		Sfx.play("edge")
		return
	_cursor = target
	Sfx.play("focus_button", 0.8 + 0.5 * float(_cursor) / maxf(1.0, _rows.size() - 1.0))
	_render()
	Speech.say(_focus_text(), true)


func _digit(key: InputEventKey) -> int:
	if key.keycode >= KEY_1 and key.keycode <= KEY_9:
		return key.keycode - KEY_0
	if key.keycode >= KEY_KP_1 and key.keycode <= KEY_KP_9:
		return key.keycode - KEY_KP_0
	return 0


func _browse_key(key: InputEventKey) -> bool:
	var row := _rows[_cursor] if not _rows.is_empty() else {}
	var kind: String = row.get("kind", "")
	var digit := _digit(key)
	if digit > 0 and not key.echo:
		if key.shift_pressed:
			if kind == "audio":
				_audio_set(row, {"slot": digit})
		else:
			_fire_slot(digit)
		return true
	match key.keycode:
		KEY_UP:
			_go_to(_cursor - 1)
		KEY_DOWN:
			_go_to(_cursor + 1)
		KEY_HOME:
			_go_to(0)
		KEY_END:
			_go_to(_rows.size() - 1)
		KEY_H:
			Speech.say(HELP, true)
		KEY_LEFT, KEY_RIGHT:
			_nudge(row, -1 if key.keycode == KEY_LEFT else 1)
		KEY_ENTER, KEY_KP_ENTER, KEY_SPACE:
			if not key.echo:
				Sfx.play("activate")
				_activate(row)
		KEY_L:
			if not key.echo and kind == "audio" and _need_host():
				var audio: Dictionary = _audio_of(row)
				_audio_set(row, {"loop": not audio["loop"]})
		KEY_M:
			if not key.echo and kind == "audio" and _need_host():
				var audio: Dictionary = _audio_of(row)
				var next: String = MODE_ORDER[(MODE_ORDER.find(audio["mode"]) + 1) % MODE_ORDER.size()]
				_follow = str(_active()["cards"][row["index"]]["id"])
				_audio_set(row, {"mode": next})
		KEY_P:
			if not key.echo and kind == "audio" and _need_host():
				_place(row)
		KEY_G:
			if not key.echo and kind == "audio" and _need_host():
				_begin_spot(row)
		KEY_E:
			if not key.echo and kind == "audio" and _need_host():
				var card: Dictionary = _active()["cards"][row["index"]]
				_begin_edit("Nome do som", str(card["title"]), func(text: String) -> void:
					if not text.strip_edges().is_empty():
						_op({"type": "card:edit", "cardId": card["id"], "title": text, "text": str(card["text"])}))
		KEY_V:
			if not key.echo and kind == "audio" and _need_host():
				var card: Dictionary = _active()["cards"][row["index"]]
				Sfx.play("tick", 1.2 if card.get("hidden", false) else 0.8)
				_op({"type": "card:visibility", "cardId": card["id"], "hidden": not card.get("hidden", false)})
		KEY_DELETE:
			if not key.echo and kind == "audio" and _need_host():
				var card: Dictionary = _active()["cards"][row["index"]]
				_begin_choice("Remover o som %s?" % card["title"],
					[{"label": "Não, manter", "value": false}, {"label": "Sim, remover", "value": true}],
					func(confirmed: bool) -> void:
						if confirmed:
							_op({"type": "card:remove", "cardId": card["id"]}))
		_:
			return false
	return true


func _need_host() -> bool:
	if _is_host():
		return true
	Sfx.play("error")
	Speech.say("Só o anfitrião controla o áudio.", true)
	return false


func _audio_of(row: Dictionary) -> Dictionary:
	return _active()["cards"][row["index"]]["audio"]


func _audio_set(row: Dictionary, patch: Dictionary) -> void:
	if not _need_host():
		return
	var op := {"type": "audio:set", "cardId": _active()["cards"][row["index"]]["id"]}
	op.merge(patch)
	_op(op)


func _nudge(row: Dictionary, direction: int) -> void:
	match row.get("kind", ""):
		"master":
			var target := clampf(_engine.master + 0.1 * direction, 0.0, 1.0)
			if is_equal_approx(target, _engine.master):
				Sfx.play("edge")
				return
			_engine.set_master(target)
			Sfx.play("tick", 0.8 + target)
			Speech.say(_row_text(row), true)
		"voice_volume":
			var target := clampf(_voice.volume + 0.1 * direction, 0.0, 1.0)
			if is_equal_approx(target, _voice.volume):
				Sfx.play("edge")
				return
			_voice.set_volume(target)
			Sfx.play("tick", 0.8 + target)
			Speech.say(_row_text(row), true)
		"audio":
			if not _need_host():
				return
			var audio: Dictionary = _audio_of(row)
			var target := clampi(int(audio["volume"]) + 5 * direction, 0, 100)
			if target == int(audio["volume"]):
				Sfx.play("edge")
				return
			Sfx.play("tick", 0.8 + float(target) / 100.0)
			_audio_set(row, {"volume": target})


func _activate(row: Dictionary) -> void:
	match row.get("kind", ""):
		"master", "header":
			Speech.say(_row_text(row), true)
		"position":
			var options: Array = [{"label": "Centro da cena", "value": ""}]
			for zone in _active()["zones"]:
				options.append({"label": "Zona %s" % zone["name"], "value": str(zone["id"])})
			_begin_choice("De onde você ouve os sons?", options, func(zone_id: String) -> void:
				_engine.set_listener_zone(zone_id)
				_rebuild()
				Speech.say(_row_text({"kind": "position"}), true))
		"voice_mode":
			_voice.cycle_mode()
			_rebuild()
			Speech.say(_row_text(row), true)
		"voice_positional":
			_voice.cycle_spatial()
			_rebuild()
			Speech.say(_row_text(row), true)
		"voice_noise":
			_voice.set_suppression(not _voice.suppress)
			_rebuild()
			Speech.say(_row_text(row), true)
		"voice_normalize":
			_voice.set_normalization(not _voice.normalize)
			_rebuild()
			Speech.say(_row_text(row), true)
		"voice_announce":
			_voice.set_announce(not _voice.announce)
			_rebuild()
			Speech.say(_row_text(row), true)
		"voice_in":
			_choose_device("Qual microfone?", _voice.input_devices(), AudioServer.input_device, _voice.set_input_device, row)
		"voice_out":
			_choose_device("Por onde tocar as vozes?", _voice.output_devices(), AudioServer.output_device, _voice.set_output_device, row)
		"voice_dictation":
			var before: String = _dictation.mode
			var after: String = _dictation.cycle_mode()
			if after == before:
				Sfx.play("error")
				Speech.say("Baixe o modelo de voz primeiro: use a linha do modelo.", true)
				return
			_rebuild()
			Speech.say(_row_text(row), true)
		"voice_dictation_model":
			if _dictation.model_ready():
				Speech.say(_row_text(row), true)
			elif not _dictation.downloading():
				_dictation.download_model()
		"voice_captions_read":
			_dictation.set_read_captions(not _dictation.read_captions)
			_rebuild()
			Speech.say(_row_text(row), true)
		"voice_volume", "voice_speakers", "voice_caption":
			Speech.say(_row_text(row), true)
		"stop_all":
			if _need_host():
				_op({"type": "audio:stopall"})
		"new_audio":
			if _need_host():
				_add_audio()
		"audio":
			if not _need_host():
				return
			var card: Dictionary = _active()["cards"][row["index"]]
			var audio: Dictionary = card["audio"]
			_follow = str(card["id"])
			_op({"type": "audio:stop" if audio["playing"] else "audio:play", "cardId": card["id"]})


# --- Ponto exato dentro da zona -----------------------------------------------------------------

## Entra no modo de posicionar o som: as setas o movem dentro da zona e ele soa dali na hora.
func _begin_spot(row: Dictionary) -> void:
	var card: Dictionary = _active()["cards"][row["index"]]
	if card.get("zoneId") == null:
		Sfx.play("error")
		Speech.say("Ponha o som numa zona antes, com P.", true)
		return
	_spot_box = _zone_box(card["zoneId"])
	_spot_start = card.get("at")
	_spot_card = str(card["id"])
	_spot_at = Vector2(float(_spot_start["x"]), float(_spot_start["y"])) if _spot_start is Dictionary else _spot_box.get_center()
	_mode = "spot"
	_render()
	Sfx.play("open_input")
	Speech.say("Posicionando %s na zona %s. Setas movem um quarto de quadrado, Shift um quadrado inteiro, Home volta ao centro, Enter confirma, Escape cancela. %s" % [
		card["title"], _zone_name(card["zoneId"]), _spot_text()], true)


## O retângulo que cerca as células da zona, em células do grid.
func _zone_box(zone_id: Variant) -> Rect2:
	var low := Vector2(INF, INF)
	var high := Vector2(-INF, -INF)
	for zone in _active()["zones"]:
		if zone["id"] == zone_id:
			for c in zone["cells"]:
				low = Vector2(minf(low.x, float(c["x"])), minf(low.y, float(c["y"])))
				high = Vector2(maxf(high.x, float(c["x"]) + 1.0), maxf(high.y, float(c["y"]) + 1.0))
	return Rect2(low, high - low)


## "coluna 3, linha 2" com frações, mais o lado em que o som está em relação a quem ouve.
func _spot_text() -> String:
	var column := _number(_spot_at.x + 0.5)
	var line := _number(_spot_at.y + 0.5)
	var listener: Vector2 = _engine.spot_of(_engine.listener_zone) / _engine.CELL
	var side := "na sua frente"
	if _spot_at.x < listener.x - 0.2:
		side = "à sua esquerda"
	elif _spot_at.x > listener.x + 0.2:
		side = "à sua direita"
	var depth := "na sua altura"
	if _spot_at.y < listener.y - 0.2:
		depth = "mais acima"
	elif _spot_at.y > listener.y + 0.2:
		depth = "mais abaixo"
	return "Coluna %s, linha %s, %s, %s." % [column, line, side, depth]


func _number(value: float) -> String:
	return str(snappedf(value, 0.01)).replace(".", ",")


func _spot_key(key: InputEventKey) -> bool:
	var step := 1.0 if key.shift_pressed else 0.25
	match key.keycode:
		KEY_LEFT:
			_spot_move(Vector2(-step, 0))
		KEY_RIGHT:
			_spot_move(Vector2(step, 0))
		KEY_UP:
			_spot_move(Vector2(0, -step))
		KEY_DOWN:
			_spot_move(Vector2(0, step))
		KEY_HOME:
			if not key.echo:
				_spot_at = _spot_box.get_center()
				_client.scene_op({"type": "card:spot", "cardId": _spot_card, "at": null})
				Sfx.play("tick")
				Speech.say("No centro da zona. %s" % _spot_text(), true)
		KEY_ENTER, KEY_KP_ENTER, KEY_SPACE:
			if not key.echo:
				_mode = "browse"
				_follow = _spot_card
				_rebuild()
				Sfx.play("activate")
				Speech.say("Posição guardada. %s" % _spot_text(), true)
		KEY_ESCAPE:
			_mode = "browse"
			var back: Variant = null
			if _spot_start is Dictionary:
				back = {"x": _spot_start["x"], "y": _spot_start["y"]}
			_client.scene_op({"type": "card:spot", "cardId": _spot_card, "at": back})
			_follow = _spot_card
			_rebuild()
			Sfx.play("close_input")
			Speech.say("Cancelado, o som voltou de onde estava.", true)
		_:
			return key.keycode == KEY_TAB
	return true


func _spot_move(delta: Vector2) -> void:
	var target := Vector2(
		clampf(snappedf(_spot_at.x + delta.x, 0.25), _spot_box.position.x, _spot_box.end.x),
		clampf(snappedf(_spot_at.y + delta.y, 0.25), _spot_box.position.y, _spot_box.end.y))
	if target.is_equal_approx(_spot_at):
		Sfx.play("edge")
		Speech.say("Limite da zona. %s" % _spot_text(), true)
		return
	_spot_at = target
	_client.scene_op({"type": "card:spot", "cardId": _spot_card, "at": {"x": target.x, "y": target.y}})
	Sfx.play("tick", 0.8 + 0.4 * (target.x - _spot_box.position.x) / maxf(0.01, _spot_box.size.x))
	Speech.say(_spot_text(), true)


func _choose_device(title: String, devices: PackedStringArray, current: String, apply: Callable, row: Dictionary) -> void:
	var options: Array = []
	for device in devices:
		options.append({"label": device, "value": device})
	if options.is_empty():
		Speech.say("Nenhum dispositivo encontrado.", true)
		return
	_begin_choice(title, options, func(device: String) -> void:
		apply.call(device)
		_rebuild()
		Speech.say(_row_text(row), true))
	_choice_index = maxi(0, devices.find(current))
	_render()


func _fire_slot(slot: int) -> void:
	if not _is_host():
		return
	for card in _active()["cards"]:
		var audio: Variant = card.get("audio")
		if audio is Dictionary and audio["slot"] != null and int(audio["slot"]) == slot:
			Sfx.play("tick", 1.0 + 0.05 * slot)
			_client.scene_op({"type": "audio:play", "cardId": card["id"]})
			return
	Sfx.play("error")
	Speech.say("Nenhum som na tecla %d." % slot, true)


func _place(row: Dictionary) -> void:
	var card: Dictionary = _active()["cards"][row["index"]]
	var options: Array = [{"label": "Sem zona, ouvido por todos igualmente", "value": ""}]
	for zone in _active()["zones"]:
		options.append({"label": "Zona %s" % zone["name"], "value": str(zone["id"])})
	if options.size() == 1:
		Speech.say("Não há zonas nesta cena.", true)
		return
	_begin_choice("De onde vem %s?" % card["title"], options, func(zone_id: String) -> void:
		_follow = str(card["id"])
		_op({"type": "card:place", "cardId": card["id"], "zoneId": null if zone_id.is_empty() else zone_id}))


## Escolhe o arquivo, envia ao servidor, pergunta o nome e o modo e cria o som.
func _add_audio() -> void:
	var started := SheetLibrary.pick(false, "Escolher áudio", "", func(path: String) -> void:
		if path.is_empty():
			Speech.say("Cancelado.", true)
			return
		Speech.say("Enviando o áudio.", true)
		var result: Dictionary = await _client.upload_media(path)
		if not result["ok"]:
			Sfx.play("error")
			Speech.say(str(result["message"]), true)
			return
		_name_audio(str(result["id"]), path.get_file().get_basename()),
		PackedStringArray(["*.ogg, *.mp3, *.wav ; Áudio"]))
	if not started:
		Sfx.play("error")
		Speech.say("Este sistema não oferece o seletor de arquivos.", true)


func _name_audio(media_id: String, suggested: String) -> void:
	_begin_edit("Nome do som", suggested, func(title: String) -> void:
		if title.strip_edges().is_empty():
			return
		_begin_choice("Que tipo de som?", [
			{"label": "Ambiência, em loop", "value": "ambient"},
			{"label": "Música, uma por vez", "value": "music"},
			{"label": "Efeito, disparado pelo soundboard", "value": "effect"},
		], func(mode: String) -> void:
			_announce_next = true
			_client.scene_op({"type": "card:add", "id": _new_id(), "title": title, "text": "", "kind": "audio", "mediaId": media_id, "mode": mode})))


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


func _begin_edit(label: String, initial: String, done: Callable) -> void:
	_mode = "edit"
	_edit_done = done
	_edit.setup(label, "Enter confirma, Escape cancela.")
	_edit.text = initial
	_edit.caret_column = initial.length()
	_edit.visible = true
	_edit.grab_focus()
	Sfx.play("open_input")


func _end_edit() -> void:
	_mode = "browse"
	_edit.visible = false
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
		if _announce_next and not _rows.is_empty():
			_announce_next = false
			Speech.say(_row_text(_rows[_cursor]), true)
