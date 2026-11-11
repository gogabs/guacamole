extends SceneTree
## Dois clientes numa mesa: um só pela camada de rede (Ana) e um dirigindo a interface real (Caio).
## Uso: godot --headless --path client --script res://tests/two_clients.gd -- 127.0.0.1:8000

const Client := preload("res://scripts/net/client.gd")

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


func _run() -> void:
	# Em _initialize a árvore ainda não está ativa (HTTPRequest recusa pedidos).
	await process_frame
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
	_check(connect_screen != null and connect_screen.has_signal("submitted"), "tela de conexão aparece")
	connect_screen._server.text = server
	connect_screen._name.text = "Caio"
	connect_screen._code.text = room_id
	connect_screen._submit()
	_check(
		await _wait(func() -> bool: return app._screen != null and app._screen.has_method("_move")),
		"Caio chega na tela da mesa"
	)
	var table: Control = app._screen
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

	# Navegação por teclado no histórico.
	var last: int = table.entries.size() - 1
	_check(table.cursor == last, "cursor começa na última entrada")
	await _key(KEY_COMMA, KEY_COMMA, 44)
	_check(table.cursor == last - 1, "vírgula volta uma entrada")
	await _key(KEY_PERIOD, KEY_PERIOD, 46)
	_check(table.cursor == last, "ponto avança uma entrada")
	await _key(KEY_HOME, KEY_HOME)
	_check(table.cursor == 0, "Home vai à primeira entrada")
	await _key(KEY_END, KEY_END)
	_check(table.cursor == last, "End vai à última entrada")

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
	print("---")
	print("Falhas: ", failures)
	quit(1 if failures > 0 else 0)
