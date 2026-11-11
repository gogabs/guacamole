extends SceneTree
## Dois clientes numa mesa: um só pela camada de rede (Ana) e um dirigindo a interface real (Caio).
## Uso: godot --headless --path client --script res://tests/two_clients.gd -- 127.0.0.1:8000

const Client := preload("res://scripts/net/client.gd")
const Store := preload("res://scripts/ui/store.gd")

var failures := 0


func _initialize() -> void:
	_run()


func _check(condition: bool, label: String) -> void:
	if condition:
		print("ok   - ", label)
	else:
		print("FAIL - ", label)
		failures += 1


func _wait(condition: Callable, seconds: float = 4.0) -> bool:
	var deadline := Time.get_ticks_msec() + int(seconds * 1000.0)
	while not condition.call():
		if Time.get_ticks_msec() > deadline:
			return false
		await process_frame
	return true


func _key(physical: Key, keycode: Key, unicode: int = 0) -> void:
	var event := InputEventKey.new()
	event.pressed = true
	event.physical_keycode = physical
	event.keycode = keycode
	event.unicode = unicode
	Input.parse_input_event(event)
	await process_frame
	await process_frame


func _shift_key(code: Key) -> void:
	var event := InputEventKey.new()
	event.pressed = true
	event.physical_keycode = code
	event.keycode = code
	event.shift_pressed = true
	Input.parse_input_event(event)
	await process_frame
	await process_frame


func _ctrl_key(code: Key) -> void:
	var event := InputEventKey.new()
	event.pressed = true
	event.physical_keycode = code
	event.keycode = code
	event.ctrl_pressed = true
	Input.parse_input_event(event)
	await process_frame
	await process_frame


func _goto_row(sheets: Control, matches: Callable) -> void:
	await _key(KEY_HOME, KEY_HOME)
	for i in 120:
		if sheets._rows[sheets._cursor].is_empty() or matches.call(sheets._rows[sheets._cursor]):
			return
		await _key(KEY_DOWN, KEY_DOWN)


func _run() -> void:
	# Em _initialize a árvore ainda não está ativa (HTTPRequest recusa pedidos).
	await process_frame
	Store.path = "user://test_settings.cfg"
	var args := OS.get_cmdline_user_args()
	var server: String = args[0] if args.size() > 0 else "127.0.0.1:8000"

	var ana := Client.new()
	root.add_child(ana)
	ana.configure(server)
	var ana_entries: Array = []
	var ana_errors: Array = []
	ana.entry_received.connect(func(e: Dictionary) -> void: ana_entries.append(e))
	ana.server_error.connect(func(m: String) -> void: ana_errors.append(m))

	var created: Dictionary = await ana.create_room("Mesa de teste", "Ana")
	_check(created["ok"], "Ana cria a mesa")
	var room_id: String = str(created["data"]["room"]["id"])
	ana.connect_to_room(room_id, "Ana", str(created["data"]["hostToken"]))
	_check(await _wait(func() -> bool: return not ana.you.is_empty()), "Ana recebe welcome")
	_check(ana.you.get("role") == "host", "Ana é anfitriã")

	# Caio usa a interface de verdade.
	var app: Control = load("res://main.tscn").instantiate()
	root.add_child(app)
	await process_frame
	var connect_screen: Control = app._screen
	var menu: Control = connect_screen._menu
	_check(menu.current_id() == "name", "menu abre no item Nome")
	await _key(KEY_DOWN, KEY_DOWN)
	_check(menu.current_id() == "create", "seta para baixo vai para Criar mesa")
	await _key(KEY_UP, KEY_UP)
	_check(menu.current_id() == "name", "seta para cima volta para Nome")

	await _key(KEY_ENTER, KEY_ENTER)
	_check(connect_screen._edit_box.visible and connect_screen._edit_field.has_focus(), "Enter no Nome abre o campo de edição")
	connect_screen._edit_field.text = "descartado"
	connect_screen._edit_field.cancelled.emit()
	_check(not connect_screen._edit_box.visible and menu.get_value("name") != "descartado", "Escape fecha o campo sem alterar o nome")

	await _key(KEY_ENTER, KEY_ENTER)
	connect_screen._edit_field.text = "Caio"
	connect_screen._edit_field.text_submitted.emit("Caio")
	_check(not connect_screen._edit_box.visible, "campo some ao confirmar")
	_check(menu.get_value("name") == "Caio", "nome atualizado no menu")

	await _key(KEY_DOWN, KEY_DOWN)
	await _key(KEY_DOWN, KEY_DOWN)
	_check(menu.current_id() == "join", "dois passos abaixo está Entrar em uma mesa")
	await _key(KEY_ENTER, KEY_ENTER)
	_check(connect_screen._edit_box.visible and connect_screen._edit_field.text == "", "Entrar abre o campo de código vazio")
	connect_screen._server_value = server
	connect_screen._edit_field.text = room_id
	connect_screen._edit_field.text_submitted.emit(room_id)
	_check(
		await _wait(func() -> bool: return app._screen != null and app._screen.has_method("_move")),
		"Caio chega na tela da mesa"
	)
	var table: Control = app._screen
	await process_frame
	await process_frame
	_check(root.gui_get_focus_owner() == table._sheets._zone, "a mesa abre com o foco na região de fichas")
	_check(table.entries.size() >= 1, "histórico inicial carregado")
	_check(
		await _wait(func() -> bool: return ana_entries.any(func(e: Dictionary) -> bool: return str(e["text"]).contains("Caio entrou"))),
		"Ana é avisada de que Caio entrou"
	)

	# Chat de Ana chega no histórico de Caio.
	ana.send_chat("olá, Caio")
	_check(
		await _wait(func() -> bool: return table.entries.any(func(e: Dictionary) -> bool: return e["text"] == "olá, Caio" and e["author"] == "Ana")),
		"chat de Ana aparece no histórico de Caio"
	)

	# Rolagem e segurança de Caio chegam em Ana.
	table._on_submit("/roll 2d6+1")
	_check(
		await _wait(func() -> bool: return ana_entries.any(func(e: Dictionary) -> bool: return e["kind"] == "roll" and e["author"] == "Caio")),
		"rolagem de Caio chega em Ana"
	)
	table._on_submit("/x")
	_check(
		await _wait(func() -> bool: return ana_entries.any(func(e: Dictionary) -> bool: return e["kind"] == "safety" and e.get("action") == "stop")),
		"/x de Caio chega em Ana como segurança"
	)
	await _key(KEY_F6, KEY_F6)
	_check(
		await _wait(func() -> bool: return ana_entries.any(func(e: Dictionary) -> bool: return e.get("action") == "pause")),
		"F6 envia pausa"
	)

	# Erro privado: só Caio ouve.
	table._on_submit("/roll banana")
	_check(await _wait(func() -> bool: return table.entries.any(func(e: Dictionary) -> bool: return e["kind"] == "local")), "erro vira entrada local em Caio")
	_check(ana_errors.is_empty(), "Ana não recebe o erro de Caio")

	# O histórico não recebe foco: suas teclas valem a partir da ficha, que é a região única.
	var sheets: Control = table._sheets
	sheets._zone.grab_focus()
	var last: int = table.entries.size() - 1
	_check(table.cursor == last, "cursor começa na última entrada")
	await _key(KEY_COMMA, KEY_COMMA, 44)
	_check(table.cursor == last - 1, "vírgula volta uma entrada")
	await _key(KEY_PERIOD, KEY_PERIOD, 46)
	_check(table.cursor == last, "ponto avança uma entrada")
	await _ctrl_key(KEY_HOME)
	_check(table.cursor == 0, "Ctrl+Home vai à primeira entrada")
	await _ctrl_key(KEY_END)
	_check(table.cursor == last, "Ctrl+End vai à última entrada")
	for i in 60:
		table._on_server_error("linha de enchimento %d" % i)
	await process_frame
	await process_frame
	await _ctrl_key(KEY_END)
	await process_frame
	_check(table._log.get_v_scroll_bar().value > 0, "o histórico rola até a mensagem atual mesmo sem barra de rolagem")
	_check(not table._log.scroll_active, "o histórico não tem barra de rolagem")
	last = table.entries.size() - 1
	_check(not table._history_zone.has_focus() and table._history_zone.focus_mode == Control.FOCUS_NONE, "o histórico não aceita foco")
	await _key(KEY_DOWN, KEY_DOWN)
	await _key(KEY_RIGHT, KEY_RIGHT)
	_check(root.gui_get_focus_owner() == sheets._zone, "setas não tiram o foco da ficha")
	await _key(KEY_TAB, KEY_TAB)
	_check(root.gui_get_focus_owner() == table._scene._zone, "Tab vai da ficha à cena, sem passar por histórico, campo ou barras")
	await _key(KEY_TAB, KEY_TAB)
	_check(root.gui_get_focus_owner() == sheets._zone, "e volta para a ficha")
	_check(sheets._character_id == "" and sheets._rows.size() == 4, "sem fichas: só as opções de criar (um modelo cada)")
	for _i in 3:
		await _key(KEY_DOWN, KEY_DOWN)
	await _key(KEY_ENTER, KEY_ENTER)
	_check(await _wait(func() -> bool: return sheets._character_id != ""), "Enter em Nova ficha de Ironsworn cria e abre a ficha")
	var sheet_id: String = sheets._character_id
	_check(await _wait(func() -> bool: return ana.characters.has(sheet_id)), "Ana também recebe a ficha")

	await _goto_row(sheets, func(row: Dictionary) -> bool: return row["kind"] == "field" and row["field"]["id"] == "iron.stat.iron")
	await _key(KEY_RIGHT, KEY_RIGHT)
	_check(await _wait(func() -> bool: return int(table._client.characters[sheet_id]["values"]["iron.stat.iron"]) == 1), "seta direita soma 1 ao atributo")
	_check(await _wait(func() -> bool: return int(ana.characters[sheet_id]["values"]["iron.stat.iron"]) == 1), "a mudança chega em Ana")
	await _key(KEY_ENTER, KEY_ENTER)
	_check(sheets._edit.visible and sheets._edit.has_focus(), "Enter no atributo abre o campo de edição")
	sheets._edit.text = "3"
	sheets._edit.text_submitted.emit("3")
	_check(await _wait(func() -> bool: return int(table._client.characters[sheet_id]["values"]["iron.stat.iron"]) == 3), "valor digitado é aplicado")
	_check(root.gui_get_focus_owner() == sheets._zone and not sheets._edit.visible, "o campo some e o foco volta à ficha")
	var rolls_before: int = ana_entries.filter(func(e: Dictionary) -> bool: return e["kind"] == "roll").size()
	await _key(KEY_R, KEY_R)
	_check(
		await _wait(func() -> bool: return ana_entries.filter(func(e: Dictionary) -> bool: return e["kind"] == "roll").size() == rolls_before + 1),
		"R rola o atributo e o resultado chega em Ana"
	)
	_check(ana_entries.back()["author"] == "Caio" and str(ana_entries.back()["text"]).contains(" · "), "a rolagem sai em nome da ficha, no formato resultado · detalhe")

	# Saúde também rola; Shift+R é privado (só Caio recebe).
	await _goto_row(sheets, func(row: Dictionary) -> bool: return row["kind"] == "field" and row["field"]["id"] == "iron.meter.health")
	var caio_rolls: int = table.entries.filter(func(e: Dictionary) -> bool: return e["kind"] == "roll").size()
	var ana_rolls: int = ana_entries.filter(func(e: Dictionary) -> bool: return e["kind"] == "roll").size()
	await _shift_key(KEY_R)
	_check(await _wait(func() -> bool: return table.entries.filter(func(e: Dictionary) -> bool: return e["kind"] == "roll").size() == caio_rolls + 1), "Shift+R em Saúde rola")
	_check(table.entries.back().get("private", false), "a rolagem privada chega marcada a Caio")
	await _key(KEY_R, KEY_R)
	_check(await _wait(func() -> bool: return ana_entries.filter(func(e: Dictionary) -> bool: return e["kind"] == "roll").size() == ana_rolls + 1), "só a rolagem pública chega em Ana")
	var before_jump: int = sheets._cursor
	await _ctrl_key(KEY_UP)
	_check(sheets._rows[sheets._cursor]["kind"] == "section" and sheets._cursor < before_jump, "Ctrl+Cima pula para o início da seção")
	await _goto_row(sheets, func(row: Dictionary) -> bool: return row["kind"] == "track_add" and row["field"]["id"] == "iron.vows")
	await _key(KEY_ENTER, KEY_ENTER)
	_check(sheets._edit.visible, "Enter em Nova trilha pede o nome")
	sheets._edit.text = "Vingar o irmão"
	sheets._edit.text_submitted.emit("Vingar o irmão")
	_check(sheets._mode == "choice", "depois do nome vem a escolha da graduação")
	await _key(KEY_ENTER, KEY_ENTER)
	_check(await _wait(func() -> bool: return (table._client.characters[sheet_id]["values"]["iron.vows"] as Array).size() == 1), "a trilha é criada")
	await _key(KEY_M, KEY_M)
	_check(await _wait(func() -> bool: return int(table._client.characters[sheet_id]["values"]["iron.vows"][0]["ticks"]) == 4), "M marca progresso (formidável = 4 marcas)")
	rolls_before = ana_entries.filter(func(e: Dictionary) -> bool: return e["kind"] == "roll").size()
	await _key(KEY_R, KEY_R)
	_check(
		await _wait(func() -> bool: return ana_entries.filter(func(e: Dictionary) -> bool: return e["kind"] == "roll").size() == rolls_before + 1),
		"R na trilha faz uma rolagem de progresso"
	)

	await _key(KEY_ESCAPE, KEY_ESCAPE)
	_check(sheets._character_id == "", "Escape volta à lista de fichas")
	await _key(KEY_HOME, KEY_HOME)
	await _key(KEY_DELETE, KEY_DELETE)
	_check(sheets._mode == "choice", "Delete pede confirmação")
	await _key(KEY_DOWN, KEY_DOWN)
	await _key(KEY_ENTER, KEY_ENTER)
	_check(await _wait(func() -> bool: return table._client.characters.is_empty() and ana.characters.is_empty()), "a ficha é excluída para todos")

	# Cena: Tab leva da ficha à cena; cards por teclado, sincronizados com Ana (anfitriã).
	var scene_panel: Control = table._scene
	await _key(KEY_TAB, KEY_TAB)
	_check(root.gui_get_focus_owner() == scene_panel._zone, "Tab leva da ficha à região de cena")
	_check(scene_panel._rows.size() == 1 and scene_panel._rows[0]["kind"] == "new_card", "cena vazia: só Adicionar card")
	await _key(KEY_ENTER, KEY_ENTER)
	_check(scene_panel._edit.visible, "Enter em Adicionar card pede o título")
	scene_panel._edit.text = "Taverna"
	scene_panel._edit.text_submitted.emit("Taverna")
	_check(scene_panel._area.visible, "depois do título vem o texto, multilinha")
	scene_panel._area.text = "Fumaça.\nCanecas."
	scene_panel._area.submitted.emit("Fumaça.\nCanecas.")
	_check(await _wait(func() -> bool: return (ana.scene["scenes"][0]["cards"] as Array).size() == 1), "o card chega em Ana")
	_check(table.entries.any(func(e: Dictionary) -> bool: return e["kind"] == "system" and str(e["text"]).contains("adicionou o card Taverna")), "o histórico anuncia o card")
	await _key(KEY_ENTER, KEY_ENTER)
	_check(scene_panel._edit.visible and scene_panel._edit.text == "Taverna", "Enter num card edita o título atual")
	scene_panel._edit.cancelled.emit()
	await _key(KEY_S, KEY_S)
	_check(not scene_panel._scenes_view, "S não abre a lista de cenas para quem não é anfitrião")
	ana.scene_op({"type": "scene:create", "id": "s2", "name": "Duelo"})
	_check(await _wait(func() -> bool: return scene_panel._title() == "Cena: Duelo"), "Ana (anfitriã) cria outra cena e Caio vê a troca")
	await _key(KEY_ENTER, KEY_ENTER)
	scene_panel._edit.text = "Ponte"
	scene_panel._edit.text_submitted.emit("Ponte")
	scene_panel._area.submitted.emit("")
	_check(await _wait(func() -> bool: return (ana.scene["scenes"][1]["cards"] as Array).size() == 1), "card na cena ativa nova")
	await _key(KEY_DELETE, KEY_DELETE)
	_check(scene_panel._mode == "choice", "Delete pede confirmação")
	await _key(KEY_DOWN, KEY_DOWN)
	await _key(KEY_ENTER, KEY_ENTER)
	_check(await _wait(func() -> bool: return (ana.scene["scenes"][1]["cards"] as Array).is_empty()), "card removido para todos")
	ana.scene_op({"type": "card:add", "id": "seg", "title": "Segredo", "text": "O bardo é espião."})
	_check(await _wait(func() -> bool: return (ana.scene["scenes"][1]["cards"] as Array).size() == 1), "Ana adiciona um card")
	ana.scene_op({"type": "card:visibility", "cardId": "seg", "hidden": true})
	_check(await _wait(func() -> bool: return (table._client.scene["scenes"][1]["cards"] as Array).is_empty()), "card oculto some para Caio")
	_check(not JSON.stringify(table._client.scene).contains("espião"), "o texto do card oculto nunca chega a Caio")
	_check((ana.scene["scenes"][1]["cards"] as Array)[0]["hidden"], "Ana (anfitriã) continua vendo o card oculto")
	ana.scene_op({"type": "card:visibility", "cardId": "seg", "hidden": false})
	_check(await _wait(func() -> bool: return (table._client.scene["scenes"][1]["cards"] as Array).size() == 1), "revelar entrega o card a Caio")
	_check(table.entries.any(func(e: Dictionary) -> bool: return e["kind"] == "system" and str(e["text"]).contains("revelou o card Segredo")), "o histórico anuncia a revelação")
	await _key(KEY_V, KEY_V)
	_check(scene_panel._rows[0]["kind"] == "card" and not (table._client.scene["scenes"][1]["cards"] as Array)[0]["hidden"], "V não oculta para quem não é anfitrião")
	ana.scene_op({"type": "card:remove", "cardId": "seg"})
	_check(await _wait(func() -> bool: return (table._client.scene["scenes"][1]["cards"] as Array).is_empty()), "card revelado removido")
	_check(table._client.templates.size() == 4, "o servidor oferece 4 modelos de ficha")
	ana.scene_op({"type": "scene:editors", "editors": "host"})
	_check(await _wait(func() -> bool: return table._client.scene["editors"] == "host"), "Ana restringe a edição dos cards")
	_check(await _wait(func() -> bool: return scene_panel._rows.is_empty()), "Caio deixa de ver Adicionar card")
	sheets._zone.grab_focus()

	# Campo de mensagem: só por ; ou mouse (Tab não chega nele). Lá dentro , ; . são caracteres.
	var cursor_before: int = table.cursor
	_check(table._composer.focus_mode == Control.FOCUS_CLICK, "o campo de mensagem só aceita foco por clique")
	await _key(KEY_SLASH, KEY_SEMICOLON, 59)
	_check(table._composer.has_focus(), "; abre o campo de mensagem")
	await _key(KEY_COMMA, KEY_COMMA, 44)
	await _key(KEY_SLASH, KEY_SEMICOLON, 59)
	await _key(KEY_PERIOD, KEY_PERIOD, 46)
	_check(table._composer.text == ",;.", "vírgula, ponto e vírgula e ponto são digitados no campo")
	_check(table.cursor == cursor_before, "o histórico não se mexe enquanto o campo tem o foco")
	await _key(KEY_ESCAPE, KEY_ESCAPE)
	_check(root.gui_get_focus_owner() == sheets._zone and table._composer.text == "", "Escape limpa o campo e devolve o foco à ficha")
	await _key(KEY_COMMA, KEY_COMMA, 44)

	# Tecla ";" do ABNT2 (posição física da barra) abre o campo de mensagem.
	await _key(KEY_SLASH, KEY_SEMICOLON, 59)
	_check(table._composer.has_focus(), "; (posição da barra) abre o campo de mensagem")
	_check(table._composer.text == "", "campo abre vazio com ;")
	table._close_input()
	await _key(KEY_SLASH, KEY_SLASH, 47)
	_check(table._composer.text == "/", "barra de teclado US abre o campo já com /")
	table._close_input()

	app.queue_free()
	ana.leave()
	DirAccess.remove_absolute(ProjectSettings.globalize_path(Store.path))
	print("---")
	print("Falhas: ", failures)
	quit(1 if failures > 0 else 0)