extends Control
## A mesa: histórico navegável de tudo que o app anuncia + campo de mensagem.
##
## Teclas:  ;  abre o campo (a tecla da barra em teclado US)   ,  .  anterior / seguinte
##          Home / End  primeira / última   Enter  relê   F1 ajuda   F2 quem está aqui
##          F3 código da mesa   F5-F8 segurança   F10 sair

signal leave_requested

const A11y := preload("res://scripts/ui/a11y.gd")
const ThemeFactory := preload("res://scripts/ui/theme_factory.gd")
const EditField := preload("res://scripts/ui/edit_field.gd")
const FocusZone := preload("res://scripts/ui/focus_zone.gd")
const SheetPanel := preload("res://scripts/ui/sheet_panel.gd")
const ScenePanel := preload("res://scripts/ui/scene_panel.gd")
const CompendiumPanel := preload("res://scripts/ui/compendium_panel.gd")
const AudioPanel := preload("res://scripts/ui/audio_panel.gd")
const AudioEngine := preload("res://scripts/audio/audio_engine.gd")
const VoiceChat := preload("res://scripts/audio/voice_chat.gd")

const FUNCTION_KEYS := [KEY_F1, KEY_F2, KEY_F3, KEY_F5, KEY_F6, KEY_F7, KEY_F8, KEY_F10]
const SAFETY_KEYS := {KEY_F5: "stop", KEY_F6: "pause", KEY_F7: "rewind", KEY_F8: "forward"}
const KIND_COLORS := {
	"text": "f1f3f5",
	"roll": "ffd166",
	"safety": "ff6b6b",
	"system": "9aa0a6",
	"local": "f4a261",
}
const HELP := (
	"Atalhos. Ponto e vírgula: escrever uma mensagem. Vírgula e ponto: mensagem anterior e seguinte do histórico. "
	+ "Control Home e Control End: primeira e última mensagem. Page Up e Page Down: dez para trás e para frente. "
	+ "Comece a mensagem com barra para comandos: barra roll 2d6 mais 3, barra fate mais 3, "
	+ "barra iron mais 2, barra progress 6, ou barra x para parar a cena. "
	+ "Tab alterna entre fichas, cena, áudio e compêndios; em cada uma, H lê a ajuda. F2: quem está na mesa. F3: copiar o convite, com endereço e código da mesa. "
	+ "F5 parar, F6 pausar, F7 retroceder, F8 avançar. F10: sair da mesa."
)

var entries: Array[Dictionary] = []
var cursor := -1

var _client: Node
var _you_name := ""
var _room: Dictionary = {}
var _players: Array = []
var _header: Label
var _history_zone: PanelContainer
var _log: RichTextLabel
var _composer: LineEdit
var _focus_before_input: Control
var _footer: Label
var _sheets: Control
var _scene: Control
var _compendiums: Control
var _audio: Control
var _audio_engine: Node
var _voice: Node


func setup(client: Node, you: Dictionary, room: Dictionary, players: Array, history: Array) -> void:
	_client = client
	_you_name = str(you.get("name", ""))
	_room = room
	_players = players
	for entry in history:
		entries.append(entry)
	cursor = entries.size() - 1


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)

	var background := ColorRect.new()
	background.color = ThemeFactory.BACKGROUND
	background.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(background)

	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 24)
	add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	margin.add_child(column)

	_header = Label.new()
	_header.add_theme_font_size_override("font_size", 28)
	_header.add_theme_color_override("font_color", ThemeFactory.ACCENT)
	column.add_child(_header)

	var middle := HBoxContainer.new()
	middle.add_theme_constant_override("separation", 12)
	middle.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(middle)

	_history_zone = FocusZone.new()
	_history_zone.focusable = false
	_history_zone.setup("Histórico", "Vírgula e ponto navegam, ponto e vírgula escreve.")
	_history_zone.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_history_zone.size_flags_stretch_ratio = 1.4
	middle.add_child(_history_zone)

	_sheets = SheetPanel.new()
	_sheets.setup(_client, {"name": _you_name})
	_sheets.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	middle.add_child(_sheets)

	var scene_panel := ScenePanel.new()
	scene_panel.setup(_client)
	scene_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	middle.add_child(scene_panel)
	_scene = scene_panel

	_audio_engine = AudioEngine.new()
	_audio_engine.setup(_client)
	add_child(_audio_engine)
	_voice = VoiceChat.new()
	_voice.setup(_client, _audio_engine)
	add_child(_voice)
	var audio_panel := AudioPanel.new()
	audio_panel.setup(_client, _audio_engine, _voice)
	audio_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	middle.add_child(audio_panel)
	_audio = audio_panel

	var compendium_panel := CompendiumPanel.new()
	compendium_panel.setup(_client)
	compendium_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	middle.add_child(compendium_panel)
	_compendiums = compendium_panel

	_log = RichTextLabel.new()
	_log.bbcode_enabled = true
	_log.scroll_following = false
	_log.focus_mode = Control.FOCUS_NONE
	# Sem barra de rolagem: o histórico rola sozinho até a mensagem atual.
	_log.scroll_active = false
	_log.mouse_filter = Control.MOUSE_FILTER_PASS
	_history_zone.add_child(_log)

	_composer = EditField.new()
	_composer.placeholder_text = "Pressione ; para escrever"
	_composer.max_length = 2000
	# Fora do Tab: só se chega nele por ; ou pelo mouse.
	_composer.focus_mode = Control.FOCUS_CLICK
	_composer.setup("Mensagem", "Enter envia, Escape cancela.")
	_composer.text_submitted.connect(_on_submit)
	_composer.cancelled.connect(_on_cancel)
	column.add_child(_composer)

	_footer = Label.new()
	_footer.text = "; escrever  ·  , e . navegar  ·  F1 ajuda  ·  F5 parar  F6 pausar  F7 retroceder  F8 avançar  ·  F10 sair"
	_footer.add_theme_font_size_override("font_size", 18)
	column.add_child(_footer)

	_client.entry_received.connect(_on_entry)
	_client.presence_changed.connect(_on_presence)
	_client.room_changed.connect(_on_room)
	_client.server_error.connect(_on_server_error)

	_refresh_header()
	_render()
	Sfx.play("connect")
	_sheets.focus_zone().grab_focus.call_deferred()
	Speech.say(
		"Mesa %s. Código %s. %s Pressione F1 para ouvir os atalhos."
		% [_room.get("name", ""), A11y.spell(str(_room.get("id", ""))), _players_summary()],
		false
	)


## Teclas de função e teclas do histórico valem em qualquer lugar fora de um campo de texto.
## A região com foco (ficha) trata as suas teclas antes; só o que sobra chega aqui.
func _unhandled_key_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key == null or not key.pressed:
		return
	if FUNCTION_KEYS.has(key.keycode):
		if not key.echo:
			_handle_function_key(key.keycode)
		get_viewport().set_input_as_handled()
		return
	var focus := get_viewport().gui_get_focus_owner()
	if focus is LineEdit or focus is TextEdit:
		return
	if key.alt_pressed or key.meta_pressed:
		return
	if _handle_history_key(key):
		get_viewport().set_input_as_handled()


func _handle_function_key(code: Key) -> void:
	match code:
		KEY_F1:
			Speech.say(HELP, true)
		KEY_F2:
			Speech.say(_players_summary(), true)
		KEY_F3:
			_copy_invite()
		KEY_F10:
			Sfx.play("leave")
			leave_requested.emit()
		_:
			_client.send_safety(SAFETY_KEYS[code])


## Copia um convite pronto: endereço do servidor e código da mesa. Se o servidor é local a este
## computador, pergunta a ele por quais endereços os amigos o alcançam (rede local, VPN).
func _copy_invite() -> void:
	var room_id := str(_room.get("id", ""))
	var server: String = str(_client.http_base).trim_prefix("http://").trim_prefix("https://")
	var loopback := server.begins_with("127.") or server.begins_with("localhost") or server.begins_with("[::1]")
	var options: Array = []
	if loopback:
		for item in await _client.fetch_addresses():
			options.append("%s (%s)" % [item["address"], item["name"]])
	if options.is_empty():
		options.append(server)
	var invite := "Guacamole. Mesa %s.\nNo cliente, em Servidor use %s e depois Entrar em uma mesa com o código %s." % [
		room_id, " ou ".join(options), room_id,
	]
	DisplayServer.clipboard_set(invite)
	Speech.say("Convite copiado. Código %s. Servidor %s." % [A11y.spell(room_id), ", ou ".join(options)], true)


func _handle_history_key(key: InputEventKey) -> bool:
	# A tecla da barra em teclado US é a mesma que o ";" do ABNT2: vale a posição física.
	if key.physical_keycode == KEY_SLASH or key.keycode == KEY_SLASH:
		if not key.echo:
			_open_input("/" if key.unicode == 47 else "")
		return true
	match key.physical_keycode:
		KEY_COMMA:
			_move(-1)
			return true
		KEY_PERIOD:
			_move(1)
			return true
	match key.keycode:
		KEY_HOME:
			if not key.ctrl_pressed:
				return false
			_go_to(0)
		KEY_END:
			if not key.ctrl_pressed:
				return false
			_go_to(entries.size() - 1)
		KEY_PAGEUP:
			_move(-10)
		KEY_PAGEDOWN:
			_move(10)
		_:
			return false
	return true


# --- Histórico ----------------------------------------------------------------------------

func _move(delta: int) -> void:
	if entries.is_empty():
		Sfx.play("edge")
		Speech.say("O histórico está vazio.", true)
		return
	var target := clampi(cursor + delta, 0, entries.size() - 1)
	if target == cursor:
		Sfx.play("edge")
		Speech.say("Início do histórico." if delta < 0 else "Fim do histórico.", true)
		return
	_go_to(target)


func _go_to(index: int) -> void:
	if entries.is_empty():
		return
	cursor = clampi(index, 0, entries.size() - 1)
	var position := float(cursor) / maxf(1.0, entries.size() - 1.0)
	Sfx.play("tick", 0.75 + 0.6 * position)
	Speech.say(_spoken(entries[cursor]), true)
	_render()


func _render() -> void:
	_log.clear()
	for i in entries.size():
		var entry := entries[i]
		var color: String = KIND_COLORS.get(entry.get("kind", "text"), "f1f3f5")
		var line := _display_text(entry).replace("[", "[lb]")
		if i == cursor:
			_log.append_text("[bgcolor=#2b3a55][color=#%s]▶ %s[/color][/bgcolor]\n" % [color, line])
		else:
			_log.append_text("[color=#%s]   %s[/color]\n" % [color, line])
	_scroll_to_cursor.call_deferred()


func _scroll_to_cursor() -> void:
	if cursor >= 0:
		_log.scroll_to_paragraph(cursor)


func _speech_text(entry: Dictionary) -> String:
	var kind: String = entry.get("kind", "text")
	var text: String = entry.get("text", "")
	var author: String = entry.get("author", "")
	if entry.get("private", false):
		text = "Privado: " + text
	if kind == "system" or kind == "local" or author.is_empty():
		return text
	return "%s: %s" % [author, text]


## O separador visual das rolagens vira uma pausa na fala, que é mais confiável que ler o símbolo.
func _spoken(entry: Dictionary) -> String:
	return _speech_text(entry).replace(" · ", ". ")


func _display_text(entry: Dictionary) -> String:
	return "%s  %s" % [_clock(str(entry.get("at", ""))), _speech_text(entry)]


func _clock(iso: String) -> String:
	if iso.length() < 19:
		return "--:--"
	var utc := Time.get_unix_time_from_datetime_string(iso.substr(0, 19))
	var local := Time.get_datetime_dict_from_unix_time(int(utc) + Time.get_time_zone_from_system()["bias"] * 60)
	return "%02d:%02d" % [local["hour"], local["minute"]]


# --- Mensagens recebidas ------------------------------------------------------------------

func _on_entry(entry: Dictionary) -> void:
	var was_at_end := cursor == entries.size() - 1
	entries.append(entry)
	if was_at_end:
		cursor = entries.size() - 1
	_render()

	var kind: String = entry.get("kind", "text")
	var mine: bool = str(entry.get("author", "")) == _you_name and kind != "system"
	match kind:
		"safety":
			Sfx.play("safety")
			Speech.say(_spoken(entry), true)
		"roll":
			Sfx.play("roll")
			Speech.say(_spoken(entry), false)
		"system":
			Sfx.play("join" if str(entry.get("text", "")).contains("entrou") else "leave")
			Speech.say(_spoken(entry), false)
		_:
			if not mine:
				Sfx.play("msg_in")
				Speech.say(_spoken(entry), false)


func _on_presence(players: Array) -> void:
	_players = players
	_refresh_header()


func _on_room(room: Dictionary) -> void:
	_room = room
	_refresh_header()


func _on_server_error(message: String) -> void:
	Sfx.play("error")
	Speech.say(message, true)
	var was_at_end := cursor == entries.size() - 1
	entries.append({"kind": "local", "author": "", "text": message, "at": Time.get_datetime_string_from_system(true)})
	if was_at_end:
		cursor = entries.size() - 1
	_render()


func _refresh_header() -> void:
	_header.text = "%s  ·  código %s  ·  %s" % [_room.get("name", ""), _room.get("id", ""), _players_summary()]


func _players_summary() -> String:
	var names := PackedStringArray()
	for player in _players:
		names.append(str(player.get("name", "")))
	if names.is_empty():
		return "Ninguém conectado."
	var count := names.size()
	return "%d %s: %s." % [count, "pessoa conectada" if count == 1 else "pessoas conectadas", ", ".join(names)]


# --- Campo de mensagem --------------------------------------------------------------------

func _open_input(prefill: String) -> void:
	# O foco volta para onde estava, e não sempre para a lista de fichas.
	var before := get_viewport().gui_get_focus_owner()
	if before != _composer:
		_focus_before_input = before
	_composer.text = prefill
	_composer.caret_column = prefill.length()
	_composer.grab_focus()
	Sfx.play("open_input")


func _close_input() -> void:
	_composer.text = ""
	var back := _focus_before_input
	_focus_before_input = null
	if back != null and is_instance_valid(back) and back.is_visible_in_tree() and back.focus_mode != Control.FOCUS_NONE:
		back.grab_focus()
	else:
		_sheets.focus_zone().grab_focus()


func _on_submit(text: String) -> void:
	var line := text.strip_edges()
	_close_input()
	if line.is_empty():
		Sfx.play("close_input")
		return
	Sfx.play("msg_out")
	if cursor != entries.size() - 1:
		cursor = entries.size() - 1
		_render()
	_client.send_chat(line)


func _on_cancel() -> void:
	_close_input()
	Sfx.play("close_input")
	Speech.say("Cancelado.", true)
