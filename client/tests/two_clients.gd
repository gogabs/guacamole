extends SceneTree
## Dois clientes numa mesa: um só pela camada de rede (Ana) e um dirigindo a interface real (Caio).
## Uso: godot --headless --path client --script res://tests/two_clients.gd -- 127.0.0.1:8000

const Client := preload("res://scripts/net/client.gd")
const Store := preload("res://scripts/ui/store.gd")
const SheetLibrary := preload("res://scripts/ui/sheet_library.gd")

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


## Linhas de uma lista de compêndio sem contar as de grupo.
func _items_in(panel: Control) -> int:
	return panel._rows.filter(func(row: Dictionary) -> bool: return row["kind"] != "header").size()


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
	SheetLibrary.dir = "user://test_fichas_locais"
	# As fichas de Caio são salvas sozinhas; sobras de uma execução anterior mudariam a lista.
	if DirAccess.dir_exists_absolute(SheetLibrary.dir):
		for file_name in DirAccess.get_files_at(SheetLibrary.dir):
			DirAccess.remove_absolute("%s/%s" % [SheetLibrary.dir, file_name])
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
	_check(root.gui_get_focus_owner() == table._compendiums._zone, "depois vêm os compêndios")
	await _key(KEY_TAB, KEY_TAB)
	_check(root.gui_get_focus_owner() == sheets._zone, "e volta para a ficha")
	_check(sheets._character_id == "" and sheets._rows.size() == 3, "sem fichas: Nova ficha, Carregar e Importar")
	await _goto_row(sheets, func(row: Dictionary) -> bool: return row["kind"] == "new")
	_check(sheets._focus_text() == "Nova ficha, botão", "as opções de ação se anunciam como botão")
	await _key(KEY_ENTER, KEY_ENTER)
	_check(sheets._edit.visible and sheets._edit.text == "Caio", "Nova ficha pede o nome, já com o nome do jogador")
	sheets._edit.text_submitted.emit("Caio")
	_check(sheets._mode == "choice" and sheets._choice_options.size() == 5, "depois do nome vem a escolha do modelo")
	for _i in 3:
		await _key(KEY_DOWN, KEY_DOWN)
	_check(sheets._choice_options[sheets._choice_index]["value"] == "template.ironsworn", "o quarto modelo é Ironsworn")
	await _key(KEY_ENTER, KEY_ENTER)
	_check(await _wait(func() -> bool: return sheets._character_id != ""), "Enter em Nova ficha de Ironsworn cria e abre a ficha")
	var sheet_id: String = sheets._character_id
	_check(await _wait(func() -> bool: return ana.characters.has(sheet_id)), "Ana também recebe a ficha")
	_check(sheets._rows[0]["kind"] == "meta" and sheets._rows[1]["kind"] == "meta", "a ficha começa com Nome e Descrição")
	await _key(KEY_DOWN, KEY_DOWN)
	await _key(KEY_ENTER, KEY_ENTER)
	_check(sheets._area.visible, "Enter na descrição abre o editor multilinha")
	var description := "Jovem clériga gnomo de olhos fulgurantes e cabelo castanho todo espivitado, parecendo um ninho de passarinho."
	sheets._area.submitted.emit(description)
	_check(await _wait(func() -> bool: return str(ana.characters[sheet_id]["description"]) == description), "a descrição chega em Ana")

	await _goto_row(sheets, func(row: Dictionary) -> bool: return row["kind"] == "field" and row["field"]["id"] == "iron.stat.iron")
	var iron_before := int(table._client.characters[sheet_id]["values"]["iron.stat.iron"])
	await _key(KEY_RIGHT, KEY_RIGHT)
	_check(await _wait(func() -> bool: return int(table._client.characters[sheet_id]["values"]["iron.stat.iron"]) == iron_before + 1), "seta direita soma 1 ao atributo")
	_check(await _wait(func() -> bool: return int(ana.characters[sheet_id]["values"]["iron.stat.iron"]) == iron_before + 1), "a mudança chega em Ana")
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
	_check(sheets._focus_text().ends_with("controle deslizante"), "a trilha se anuncia como controle deslizante")
	await _key(KEY_RIGHT, KEY_RIGHT)
	_check(await _wait(func() -> bool: return int(table._client.characters[sheet_id]["values"]["iron.vows"][0]["ticks"]) == 4), "Direita avança o progresso (formidável = 4 marcas)")
	await _key(KEY_LEFT, KEY_LEFT)
	_check(await _wait(func() -> bool: return int(table._client.characters[sheet_id]["values"]["iron.vows"][0]["ticks"]) == 0), "Esquerda recua o progresso")
	await _key(KEY_RIGHT, KEY_RIGHT)
	_check(await _wait(func() -> bool: return int(table._client.characters[sheet_id]["values"]["iron.vows"][0]["ticks"]) == 4), "Direita avança de novo")
	rolls_before = ana_entries.filter(func(e: Dictionary) -> bool: return e["kind"] == "roll").size()
	await _key(KEY_R, KEY_R)
	_check(
		await _wait(func() -> bool: return ana_entries.filter(func(e: Dictionary) -> bool: return e["kind"] == "roll").size() == rolls_before + 1),
		"R na trilha faz uma rolagem de progresso"
	)

	await _key(KEY_ESCAPE, KEY_ESCAPE)
	_check(sheets._character_id == "", "Escape volta à lista de fichas")
	var summary: String = sheets._row_text(sheets._rows[0])
	_check(
		summary.begins_with("Caio (Ironsworn); Jovem clériga gnomo") and summary.ends_with("…") and not summary.contains(", de "),
		"a lista mostra nome, modelo e o começo da descrição"
	)

	# Tirar da mesa sem apagar: a cópia local já existe (automática); depois carrega de volta.
	_check(SheetLibrary.has(sheet_id), "a ficha do jogador é salva neste computador sozinha")
	await _key(KEY_HOME, KEY_HOME)
	await _key(KEY_DELETE, KEY_DELETE)
	_check(sheets._mode == "choice" and sheets._choice_options.size() == 2, "Delete oferece manter ou tirar (a cópia salva continua)")
	await _key(KEY_DOWN, KEY_DOWN)
	await _key(KEY_ENTER, KEY_ENTER)
	_check(await _wait(func() -> bool: return table._client.characters.is_empty() and ana.characters.is_empty()), "a ficha sai da mesa para todos")
	_check(SheetLibrary.has(sheet_id), "e a cópia ficou salva neste computador")
	await _goto_row(sheets, func(row: Dictionary) -> bool: return row["kind"] == "open_local")
	await _key(KEY_ENTER, KEY_ENTER)
	_check(sheets._local and sheets._rows[0]["kind"] == "local", "Carregar abre a lista de fichas salvas")
	_check(sheets._row_text(sheets._rows[0]).begins_with("Caio (Ironsworn); Jovem clériga"), "a ficha salva mostra nome e descrição")
	await _key(KEY_ENTER, KEY_ENTER)
	_check(await _wait(func() -> bool: return sheets._character_id == sheet_id and ana.characters.has(sheet_id)), "Enter na ficha salva coloca na mesa com o mesmo id e abre")
	_check(int(table._client.characters[sheet_id]["values"]["iron.stat.iron"]) == 3, "os valores voltam com a ficha")
	_check(str(table._client.characters[sheet_id]["description"]).begins_with("Jovem clériga"), "a descrição volta com a ficha")

	# Exportar e importar: um arquivo .json e um pacote .zip.
	var mine: Dictionary = SheetLibrary.to_sheet(table._client.characters[sheet_id])
	var other := mine.duplicate(true)
	other["id"] = "outra"
	other["name"] = "Outra"
	sheets.export_path("user://test_fichas.zip", [mine, other])
	_check(SheetLibrary.read_file("user://test_fichas.zip").size() == 2, "o pacote .zip leva duas fichas")
	sheets.export_path("user://test_ficha.json", [other])
	_check(SheetLibrary.read_file("user://test_ficha.json")[0]["name"] == "Outra", "o arquivo .json leva uma ficha")
	await _key(KEY_ESCAPE, KEY_ESCAPE)
	sheets.import_path("user://test_fichas.zip")
	_check(await _wait(func() -> bool: return ana.characters.size() == 3), "importar o pacote põe as duas fichas na mesa")
	_check(ana.characters.keys().filter(func(id: String) -> bool: return id == "outra").size() == 1, "o id livre do arquivo é mantido")
	for id in ana.characters.keys():
		ana.delete_sheet(id)
	_check(await _wait(func() -> bool: return table._client.characters.is_empty()), "fichas de teste removidas")
	SheetLibrary.remove(sheet_id)
	DirAccess.remove_absolute(ProjectSettings.globalize_path("user://test_fichas.zip"))
	DirAccess.remove_absolute(ProjectSettings.globalize_path("user://test_ficha.json"))

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
	_check(table._client.templates.size() == 5, "o servidor oferece 5 modelos de ficha")
	ana.scene_op({"type": "scene:editors", "editors": "host"})
	_check(await _wait(func() -> bool: return table._client.scene["editors"] == "host"), "Ana restringe a edição dos cards")
	_check(await _wait(func() -> bool: return scene_panel._rows.is_empty()), "Caio deixa de ver Adicionar card")
	sheets._zone.grab_focus()

	# Compêndios: terceira região, adicionar, abrir itens, rolar oráculos e escolher ativos.
	var comp: Control = table._compendiums
	await _key(KEY_TAB, KEY_TAB)
	await _key(KEY_TAB, KEY_TAB)
	_check(root.gui_get_focus_owner() == comp._zone, "Tab chega à região de compêndios")
	_check(comp._rows.size() == 1 and comp._rows[0]["kind"] == "add", "sem compêndios: só Adicionar compêndio")
	_check(comp._focus_text() == "Adicionar compêndio, botão", "Adicionar compêndio se anuncia como botão")
	await _key(KEY_ENTER, KEY_ENTER)
	_check(comp._screen == "catalog" and comp._rows.size() == 5, "Enter mostra os 5 compêndios disponíveis")
	_check(comp._row_text(comp._rows[4]).begins_with("Ironsworn. Contém: Movimentos, 35 entradas; Oráculos"), "a lista diz o que há dentro de cada compêndio")
	_check(comp._row_text(comp._rows[3]).begins_with("Dungeon World 2. Contém: Regras, "), "o Dungeon World 2 também está no catálogo")
	await _key(KEY_END, KEY_END)
	await _key(KEY_ENTER, KEY_ENTER)
	_check(await _wait(func() -> bool: return table._client.has_compendium("ironsworn")), "Enter adiciona o compêndio à mesa")
	_check(
		await _wait(func() -> bool: return ana_entries.any(func(e: Dictionary) -> bool: return str(e["text"]) == "Caio adicionou o compêndio Ironsworn à mesa.")),
		"Ana é avisada do compêndio novo"
	)
	_check(ana.has_compendium("ironsworn"), "o compêndio vale para a mesa toda")
	_check(comp._screen == "root" and comp._rows.size() == 6 and comp._rows[comp._cursor]["kind"] == "section", "volta à lista com a seção Ironsworn e os 4 itens")
	_check(comp._row_text(comp._rows[comp._cursor]) == "Ironsworn, seção, 4 itens", "a seção diz quantos itens tem")
	_check(not comp._focus_text().ends_with("botão"), "a seção não é botão")
	await _key(KEY_DOWN, KEY_DOWN)
	_check(comp._focus_text() == "Movimentos, 35 entradas, botão", "o item diz o que tem e é botão")
	await _key(KEY_DOWN, KEY_DOWN)
	await _key(KEY_ENTER, KEY_ENTER)
	_check(await _wait(func() -> bool: return comp._screen == "list"), "Enter num item abre o conteúdo")
	_check(_items_in(comp) == 36 and comp._rows[0]["kind"] == "header" and comp._rows[1]["kind"] == "odds", "Oráculos: grupo, sim ou não, sorteios e tabelas")
	_check(comp._focus_text() == "Sorteios rápidos, grupo, 3 itens", "cada grupo abre com uma linha própria")
	await _key(KEY_DOWN, KEY_DOWN, 0)
	_check(comp._rows[comp._cursor]["kind"] == "odds", "a linha do grupo é seguida pelos itens")
	var group_start: int = comp._cursor
	await _ctrl_key(KEY_DOWN)
	_check(comp._rows[comp._cursor]["kind"] == "header" and comp._cursor > group_start, "Control Baixo pula para o grupo seguinte")
	await _ctrl_key(KEY_UP)
	_check(comp._rows[comp._cursor]["kind"] == "header" and comp._cursor == 0, "Control Cima volta ao começo do grupo")
	for i in 8:
		if comp._rows[comp._cursor]["kind"] == "table":
			break
		await _key(KEY_DOWN, KEY_DOWN)
	_check(comp._rows[comp._cursor]["kind"] == "table", "a lista segue com as tabelas")
	var rolls_seen: int = ana_entries.filter(func(e: Dictionary) -> bool: return e["kind"] == "roll").size()
	await _key(KEY_R, KEY_R)
	_check(
		await _wait(func() -> bool: return ana_entries.filter(func(e: Dictionary) -> bool: return e["kind"] == "roll").size() == rolls_seen + 1),
		"R rola a tabela e o resultado vai ao histórico da mesa"
	)
	var last_roll: Dictionary = ana_entries.filter(func(e: Dictionary) -> bool: return e["kind"] == "roll").back()
	_check(last_roll["author"] == "Caio" and str(last_roll["text"]).contains(", d100 "), "o resultado diz quem rolou e a tabela")
	await _shift_key(KEY_R)
	_check(
		await _wait(func() -> bool: return table.entries.any(func(e: Dictionary) -> bool: return e.get("private", false) and str(e["text"]).contains(", d100 "))),
		"Shift R rola em privado, só para Caio"
	)
	_check(ana_entries.filter(func(e: Dictionary) -> bool: return e["kind"] == "roll").size() == rolls_seen + 1, "e Ana não recebe a rolagem privada")
	await _key(KEY_HOME, KEY_HOME)
	await _key(KEY_DOWN, KEY_DOWN)
	await _key(KEY_ENTER, KEY_ENTER)
	_check(comp._mode == "choice" and comp._choice_options.size() == 5, "Enter na pergunta de sim ou não pede a probabilidade")
	await _key(KEY_ENTER, KEY_ENTER)
	_check(
		await _wait(func() -> bool: return ana_entries.any(func(e: Dictionary) -> bool: return e["kind"] == "roll" and str(e["text"]).contains("Pergunta de sim ou não, 50/50"))),
		"a pergunta rola com a probabilidade escolhida (50/50 por padrão)"
	)
	await _key(KEY_F, KEY_F)
	_check(comp._edit.visible and comp._mode == "find", "F abre o campo de busca")
	comp._edit.text = "nomes"
	comp._edit.text_submitted.emit("nomes")
	_check(comp._rows.size() > 0 and comp._rows.size() < 36, "a busca filtra as linhas, sem ligar para acentos")
	await _key(KEY_ESCAPE, KEY_ESCAPE)
	_check(comp._screen == "list" and _items_in(comp) == 36, "Escape limpa a busca antes de sair")
	await _key(KEY_ESCAPE, KEY_ESCAPE)
	_check(comp._screen == "root", "Escape volta à lista de itens")
	await _key(KEY_DOWN, KEY_DOWN)
	await _key(KEY_ENTER, KEY_ENTER)
	_check(await _wait(func() -> bool: return comp._screen == "list" and _items_in(comp) == 78), "Ativos: 78 ativos")
	_check(comp._focus_text() == "Companheiro, grupo, 10 itens", "os ativos se agrupam por tipo")
	await _key(KEY_DOWN, KEY_DOWN)
	await _key(KEY_ENTER, KEY_ENTER)
	_check(comp._screen == "reader" and comp._rows.size() >= 4, "Enter num ativo abre o leitor com as habilidades")
	await _key(KEY_ESCAPE, KEY_ESCAPE)
	_check(comp._screen == "list", "Escape volta à lista de ativos")
	await _key(KEY_ESCAPE, KEY_ESCAPE)
	await _key(KEY_DELETE, KEY_DELETE)
	_check(comp._mode == "browse", "quem não é anfitrião não tira compêndios")

	# O campo Ativos da ficha oferece os ativos do compêndio.
	var iron_template := ""
	for template in table._client.templates:
		if template["system"] == "ironsworn":
			iron_template = str(template["id"])
	table._client.create_sheet(iron_template, "Caio")
	_check(await _wait(func() -> bool: return table._client.characters.size() == 1), "Caio cria uma ficha de Ironsworn")
	var iron_id: String = table._client.characters.keys()[0]
	sheets._open(iron_id)
	sheets._zone.grab_focus()
	await _goto_row(sheets, func(row: Dictionary) -> bool: return row["kind"] == "card_add" and row["field"]["id"] == "iron.assets")
	_check(sheets._row_text(sheets._rows[sheets._cursor]) == "Adicionar ativo, do compêndio", "Adicionar ativo avisa que escolhe do compêndio")
	await _key(KEY_ENTER, KEY_ENTER)
	_check(await _wait(func() -> bool: return sheets._mode == "choice"), "Enter oferece os tipos de ativo")
	_check(sheets._choice_options.size() == 5 and sheets._choice_options[4]["label"] == "Escrever outro", "quatro tipos e Escrever outro")
	await _key(KEY_ENTER, KEY_ENTER)
	_check(sheets._mode == "choice" and sheets._choice_title == "Companheiro", "o tipo abre a lista dos ativos")
	var companion: Dictionary = {}
	for option in sheets._choice_options:
		if option["label"] == "Companheiro Humano":
			companion = option["value"]
	_check(not companion.is_empty(), "o Companheiro Humano está entre os ativos")
	while sheets._choice_options[sheets._choice_index]["label"] != "Companheiro Humano":
		await _key(KEY_DOWN, KEY_DOWN)
	await _key(KEY_ENTER, KEY_ENTER)
	_check(sheets._mode == "edit" and sheets._edit.visible, "o ativo pergunta o nome")
	sheets._edit.text_submitted.emit("Brenna")
	await process_frame
	_check(sheets._mode == "edit", "e depois a especialidade, sem os medidores")
	sheets._edit.text_submitted.emit("Batedora")
	var cards := func() -> Array: return table._client.characters[iron_id]["values"]["iron.assets"]
	_check(await _wait(func() -> bool: return cards.call().size() == 1), "o ativo escolhido entra na ficha")
	var card: Dictionary = cards.call()[0]
	_check(card["title"] == "Companheiro Humano" and card["text"] != "", "a carta guarda o nome e o texto do ativo")
	_check(card["details"] == [{"label": "Nome", "value": "Brenna"}, {"label": "Especialidade", "value": "Batedora"}], "e os campos que o jogador escolheu")
	var meter: Dictionary = card["meters"][0]
	_check(card["meters"].size() == 1 and meter["label"] == "Saúde" and int(meter["value"]) == 4 and int(meter["max"]) == 4, "a saúde vira um medidor cheio")
	_check(card["abilities"].size() == 3 and not card["abilities"][0]["marked"], "as habilidades vêm desmarcadas")

	# A carta: Enter abre o texto; esquerda e direita ajustam a saúde; Enter marca habilidades.
	await _goto_row(sheets, func(row: Dictionary) -> bool: return row["kind"] == "card_item")
	_check(sheets._row_text(sheets._rows[sheets._cursor]) == "Ativo 1: Companheiro Humano, Brenna, Batedora, Saúde 4 de 4", "a lista mostra o nome do ativo e os detalhes")
	await _key(KEY_ENTER, KEY_ENTER)
	_check(sheets._card_id != "" and sheets._row_text(sheets._rows[sheets._cursor]).begins_with("Texto: "), "Enter no ativo mostra o texto")
	await _goto_row(sheets, func(row: Dictionary) -> bool: return row["kind"] == "card_meter")
	await _key(KEY_LEFT, KEY_LEFT)
	_check(await _wait(func() -> bool: return cards.call()[0]["meters"][0]["value"] == 3), "esquerda reduz a saúde")
	_check(sheets._row_text(sheets._rows[sheets._cursor]) == "Saúde: 3 de 4", "o medidor diz o valor e o máximo")
	await _goto_row(sheets, func(row: Dictionary) -> bool: return row["kind"] == "card_ability")
	await _key(KEY_ENTER, KEY_ENTER)
	_check(await _wait(func() -> bool: return cards.call()[0]["abilities"][0]["marked"]), "Enter marca a habilidade")
	await _key(KEY_ESCAPE, KEY_ESCAPE)
	_check(sheets._card_id == "" and sheets._rows[sheets._cursor]["kind"] == "card_item", "Escape volta à lista, no ativo")

	# Dono da ficha e troca entre as fichas suas.
	var second_id := ""
	table._client.create_sheet(iron_template, "Dara")
	_check(await _wait(func() -> bool: return table._client.characters.size() == 2), "Caio cria uma segunda ficha")
	for id in table._client.characters:
		if id != iron_id:
			second_id = id
	await _ctrl_key(KEY_RIGHT)
	_check(sheets._character_id != iron_id, "Control Direita troca para a outra ficha de Caio")
	await _ctrl_key(KEY_RIGHT)
	_check(sheets._character_id == iron_id, "e volta, dando a volta na lista")
	await _key(KEY_HOME, KEY_HOME)
	await _goto_row(sheets, func(row: Dictionary) -> bool: return row["kind"] == "meta" and row["key"] == "owner")
	_check(sheets._row_text(sheets._rows[sheets._cursor]) == "Dono: você", "a linha Dono mostra de quem é")
	await _key(KEY_RIGHT, KEY_RIGHT)
	_check(sheets._owner_pick == "Ana" and str(table._client.characters[iron_id]["owner"]) == "Caio", "direita escolhe Ana sem passar a ficha ainda")
	await _key(KEY_ENTER, KEY_ENTER)
	_check(await _wait(func() -> bool: return str(table._client.characters[iron_id]["owner"]) == "Ana"), "Enter passa a ficha para Ana")
	await _ctrl_key(KEY_RIGHT)
	_check(sheets._character_id == second_id, "agora só resta uma ficha de Caio")
	table._client.assign_sheet(iron_id, "Caio")
	_check(await _wait(func() -> bool: return str(table._client.characters[iron_id]["owner"]) == "Caio"), "Caio pega a ficha de volta")
	table._client.delete_sheet(second_id)
	_check(await _wait(func() -> bool: return table._client.characters.size() == 1), "a ficha extra sai da mesa")
	sheets._open(iron_id)
	# Dungeon World: movimento da classe pelo compêndio, condição marcada e a rolagem com desvantagem.
	table._client.add_compendium("dungeon-world-2")
	_check(await _wait(func() -> bool: return table._client.has_compendium("dungeon-world-2")), "Caio adiciona o Dungeon World 2")
	var dw_template := ""
	for template in table._client.templates:
		if template["system"] == "dungeon-world":
			dw_template = str(template["id"])
	table._client.create_sheet(dw_template, "Brenna")
	_check(await _wait(func() -> bool: return table._client.characters.size() == 2), "Caio cria uma ficha de Dungeon World 2")
	var dw_id := ""
	for id in table._client.characters:
		if id != iron_id:
			dw_id = id
	sheets._open(dw_id)
	sheets._zone.grab_focus()
	await _goto_row(sheets, func(row: Dictionary) -> bool: return row["kind"] == "card_add" and row["field"]["id"] == "dw.moves")
	await _key(KEY_ENTER, KEY_ENTER)
	_check(await _wait(func() -> bool: return sheets._mode == "choice"), "Adicionar movimento oferece as classes")
	_check(sheets._choice_options.size() == 10 and sheets._choice_options[0]["label"] == "Bárbaro", "nove classes e Escrever outro")
	await _key(KEY_ENTER, KEY_ENTER)
	await _key(KEY_ENTER, KEY_ENTER)
	var moves := func() -> Array: return table._client.characters[dw_id]["values"]["dw.moves"]
	_check(await _wait(func() -> bool: return moves.call().size() == 1), "o movimento inicial entra na ficha")
	var rage: Dictionary = moves.call()[0]
	_check(rage["title"] == "Bárbaro: Fúria!" and rage["abilities"].size() == 1 and rage["abilities"][0]["marked"], "já vem marcado")
	table._client.sheet_op(dw_id, {"type": "field:set", "fieldId": "dw.cond.angry", "value": "Marcada"})
	_check(await _wait(func() -> bool: return table._client.characters[dw_id]["values"]["dw.cond.angry"] == "Marcada"), "Irritado marcado")
	table._client.roll_field(dw_id, "dw.stat.int")
	_check(
		await _wait(func() -> bool: return table.entries.any(func(e: Dictionary) -> bool: return e["kind"] == "roll" and str(e["text"]).contains("desvantagem por Irritado"))),
		"a condição marcada dá desvantagem na Inteligência"
	)
	await _goto_row(sheets, func(row: Dictionary) -> bool: return row["kind"] == "field" and row["field"]["id"] == "dw.stat.str")
	var entries_before: int = table.entries.size()
	await _key(KEY_V, KEY_V)
	_check(
		await _wait(func() -> bool: return table.entries.size() > entries_before and str(table.entries.back()["text"]).contains("com vantagem")),
		"V rola o atributo com vantagem"
	)
	table._client.delete_sheet(dw_id)
	_check(await _wait(func() -> bool: return table._client.characters.size() == 1), "a ficha de Dungeon World sai da mesa")
	sheets._open(iron_id)

	table._client.remove_compendium("ironsworn")
	_check(
		await _wait(func() -> bool: return table.entries.any(func(e: Dictionary) -> bool: return e["kind"] == "local" and str(e["text"]).contains("Só o anfitrião tira"))),
		"o servidor recusa tirar o compêndio de quem não é anfitrião"
	)
	ana.remove_compendium("ironsworn")
	_check(await _wait(func() -> bool: return not table._client.has_compendium("ironsworn")), "o anfitrião tira o compêndio da mesa")
	ana.remove_compendium("dungeon-world-2")
	_check(await _wait(func() -> bool: return not table._client.has_compendium("dungeon-world-2")), "e o do Dungeon World 2")
	_check(comp._rows.size() == 1, "a seção some da região")
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