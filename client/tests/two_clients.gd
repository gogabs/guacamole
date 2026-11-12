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


## Um tom de `seconds` segundos, estéreo a 48 kHz.
func _tone(seconds: float, amplitude: float) -> PackedVector2Array:
	var frames := PackedVector2Array()
	for i in int(48000.0 * seconds):
		var s := amplitude * sin(TAU * 440.0 * float(i) / 48000.0)
		frames.append(Vector2(s, s))
	return frames


func _rms(pcm: PackedVector2Array) -> float:
	var sum := 0.0
	for v in pcm:
		sum += v.x * v.x
	return sqrt(sum / maxf(1.0, float(pcm.size())))


func _noise(seconds: float, amplitude: float) -> PackedVector2Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	var frames := PackedVector2Array()
	var low := 0.0
	for i in int(48000.0 * seconds):
		# Passa-baixas: um zumbido de ventilador, o tipo de ruído que o RNNoise tira.
		low = low * 0.95 + rng.randf_range(-amplitude, amplitude) * 0.4
		frames.append(Vector2(low, low))
	return frames


func _voice_tests(table: Control, ana: Node) -> void:
	var voice: Node = table._voice
	var panel: Control = table._audio
	_check(voice.available(), "a extensão de voz carregou")
	if not voice.available():
		return
	var kinds: Array = panel._rows.map(func(r: Dictionary) -> String: return r["kind"])
	_check(kinds.has("voice_mode") and kinds.has("voice_speakers"), "a região de áudio lista os controles de voz")
	var mode_row: Dictionary = panel._rows[kinds.find("voice_mode")]
	_check(panel._row_text(mode_row) == "Voz: desligado", "a voz começa desligada")
	_check(panel._row_text(panel._rows[kinds.find("voice_noise")]) == "Supressão de ruído: ligada", "supressão de ruído ligada por padrão")

	# O modo fica salvo no computador de quem testa: parte sempre do pan simples.
	voice.set_spatial("pan")
	_check(panel._row_text(panel._rows[kinds.find("voice_positional")]).begins_with("Voz posicional, mesa redonda: pan simples"), "a linha da voz posicional mostra o modo")

	var codec: RefCounted = ClassDB.instantiate("VoiceCodec")
	var packets: Array = codec.encode(_tone(0.5, 0.4))
	_check(packets.size() >= 24 and packets.size() <= 25, "o codec gera 50 pacotes por segundo, de 20 ms (%d em meio segundo)" % packets.size())
	_check((codec.decode("teste", packets[0], 1.0, 1.0) as PackedVector2Array).size() == 960, "cada pacote decodifica em 20 ms de áudio")
	for packet in packets:
		ana.send_voice(packet)
	_check(await _wait(func() -> bool: return voice._peers.has("Ana")), "Caio ouve a voz de Ana")
	_check(await _wait(func() -> bool: return voice.speakers().has("Ana")), "Ana aparece como falando")
	# Na mesa redonda de dois, Ana senta do outro lado: à frente, sem pan e um pouco mais baixa.
	var across: Vector2 = voice.gains_for("Ana")
	_check(is_equal_approx(across.x, across.y) and across.x < 1.0 and across.x > 0.5, "com duas pessoas a outra fica à frente, sem pan (%s)" % across)
	_check(panel._row_text({"kind": "voice_speakers"}) == "Falando agora: Ana", "a lista diz quem fala")
	_check(await _wait(func() -> bool: return voice.speakers().is_empty(), 3.0), "depois do silêncio ninguém fala")

	# Geometria da mesa redonda com 4 pessoas: o lugar seguinte fica à esquerda, o anterior à direita, o oposto à frente.
	var left: Vector2 = voice.table_gains(0, 1, 4)
	var right: Vector2 = voice.table_gains(0, 3, 4)
	var front: Vector2 = voice.table_gains(0, 2, 4)
	_check(left.x > left.y and right.y > right.x and is_equal_approx(front.x, front.y), "o seguinte soa à esquerda, o anterior à direita e o oposto à frente")
	_check(is_equal_approx(left.x, right.y) and is_equal_approx(left.y, right.x), "a mesa é simétrica")
	_check(front.x < left.x, "quem está do outro lado da mesa soa mais baixo que o vizinho")
	var ring: Vector2 = voice.table_gains(1, 3, 8)
	_check(voice.table_gains(2, 2, 4) == Vector2.ONE and voice.table_gains(0, 1, 1) == Vector2.ONE and ring.x != ring.y, "sozinho ou sem ordem a voz fica no centro")
	voice.set_spatial("off")
	_check(voice.gains_for("Ana") == Vector2.ONE, "desligada a voz posicional, todas soam no centro")
	voice.set_spatial("pan")
	voice.cycle_spatial()
	_check(voice.spatial == "off" and panel._row_text({"kind": "voice_positional"}).ends_with("desligada, todas no centro"), "Enter na linha troca o modo: pan, desligada, HRTF")
	voice.cycle_spatial()
	_check(voice.spatial == "hrtf" and panel._row_text({"kind": "voice_positional"}).ends_with("HRTF, para fones"), "e depois vem o HRTF")

	# HRTF: o modelo de cabeça põe a voz do lado certo, e na frente fica igual nos dois ouvidos.
	_check(codec.hrtf_available() and codec.hrtf_source() == "modelo", "o HRTF usa o modelo de cabeça embutido")
	var sides := {}
	for label in ["direita", "esquerda", "frente"]:
		var direction: Vector3 = {"direita": Vector3(1, 0, 0), "esquerda": Vector3(-1, 0, 0), "frente": Vector3(0, 0, 1)}[label]
		var mixer: RefCounted = ClassDB.instantiate("VoiceCodec")
		var heard: Array = mixer.encode(_tone(1.0, 0.4))
		var energy := Vector2.ZERO
		for i in heard.size():
			var block: PackedVector2Array = mixer.decode_hrtf("x", heard[i], direction.x, direction.y, direction.z, 1.0)
			if i >= 20:
				for v in block:
					energy += Vector2(v.x * v.x, v.y * v.y)
		sides[label] = energy
	_check(sides["direita"].y > sides["direita"].x * 1.5 and sides["esquerda"].x > sides["esquerda"].y * 1.5, "HRTF: a fonte à direita soa mais no ouvido direito e a da esquerda no esquerdo")
	_check(absf(sides["frente"].x - sides["frente"].y) < 0.05 * sides["frente"].x, "HRTF: a fonte à frente soa igual nos dois ouvidos")
	var neighbor: Vector3 = voice.table_direction(0, 1, 4)
	_check(neighbor.x < -0.5 and neighbor.z > 0.0 and absf(neighbor.length() - 1.0) < 0.001, "o vizinho da mesa está à esquerda e à frente (%s)" % neighbor)
	_check(absf(voice.table_direction(0, 2, 4).x) < 0.0001 and voice.table_direction(0, 2, 4).z > 0.99, "o oposto da mesa está bem à frente")

	# Colchão contra chegada irregular: pacotes entregues em rajadas não podem picotar a voz.
	var speech: Array = codec.encode(_tone(3.0, 0.4))
	# Duas tentativas por modo: uma pausa do próprio computador de testes (centenas de ms) não é do colchão.
	for mode in ["pan", "hrtf"]:
		voice.set_spatial(mode)
		var cuts := 999
		for attempt in 2:
			await _wait(func() -> bool: return voice.speakers().is_empty(), 3.0)
			var cuts_before: int = voice._peers["Ana"]["playback"].get_skips()
			var jitter := RandomNumberGenerator.new()
			jitter.seed = 5
			var started := Time.get_ticks_msec()
			var next := 0
			while next < speech.size():
				var due := next * 20.0 + jitter.randf_range(0.0, 25.0)
				if float(Time.get_ticks_msec() - started) >= due:
					voice._on_voice("Ana", speech[next])
					next += 1
				await process_frame
			cuts = mini(cuts, voice._peers["Ana"]["playback"].get_skips() - cuts_before)
			if cuts <= 6:
				break
		_check(cuts <= 6, "voz em %s com chegada irregular (até 25 ms, mais o ritmo dos quadros) quase não tem cortes: %d" % [mode, cuts])
	voice.set_spatial("pan")

	# Sempre ativo: envia tudo, voz e silêncio, sem filtro de nível que corte microfones baixos.
	var heard: Array = []
	ana.voice_received.connect(func(peer: String, packet: PackedByteArray) -> void: heard.append([peer, packet]))
	voice.mode = "open"
	voice.feed(_tone(0.5, 0.4))
	_check(await _wait(func() -> bool: return heard.size() >= 24 and heard[0][0] == "Caio"), "o modo sempre ativo envia a voz de Caio para Ana")
	await create_timer(0.3).timeout
	heard.clear()
	voice.feed(PackedVector2Array(_tone(1.0, 0.0)))
	_check(await _wait(func() -> bool: return heard.size() >= 48), "o modo sempre ativo envia também o silêncio, sem cortar nada (%d pacotes)" % heard.size())
	voice.mode = "off"
	_check(voice.MODE_NAMES["open"] == "sempre ativo" and voice.MODE_ORDER == ["off", "ptt", "open"], "os modos são desligado, push-to-talk e sempre ativo")
	# Normalização: microfone baixo sobe, microfone alto desce, ambos para perto do mesmo nível.
	for amplitude in [0.03, 0.6]:
		var leveler: RefCounted = ClassDB.instantiate("VoiceCodec")
		leveler.set_suppression(false)
		leveler.encode(_tone(3.0, amplitude))
		var rms: float = leveler.level()  # RMS do último pacote, depois do ganho
		_check(rms > 0.07 and rms < 0.13, "a normalização leva um tom de amplitude %s a volume parecido (RMS %.3f, ganho %.1f dB)" % [amplitude, rms, leveler.gain_db()])
	var plain: RefCounted = ClassDB.instantiate("VoiceCodec")
	plain.set_suppression(false)
	plain.set_normalization(false)
	plain.encode(_tone(1.0, 0.03))
	_check(absf(plain.level() - 0.03 / sqrt(2.0)) < 0.004 and plain.gain_db() == 0.0, "com a normalização desligada o volume não muda")
	_check(voice.normalize and panel._row_text(panel._rows[kinds.find("voice_normalize")]).begins_with("Normalização de volume do microfone: ligada"), "a normalização vem ligada na região de áudio")

	# Supressão de ruído: um zumbido de fundo fica muito mais baixo com ela ligada.
	var raw: RefCounted = ClassDB.instantiate("VoiceCodec")
	raw.set_suppression(false)
	raw.encode(_noise(1.0, 0.05))
	var clean: RefCounted = ClassDB.instantiate("VoiceCodec")
	clean.set_suppression(true)
	clean.encode(_noise(1.0, 0.05))
	_check(clean.level() < raw.level() * 0.5, "a supressão derruba o ruído de fundo (%.4f contra %.4f)" % [clean.level(), raw.level()])

	# Outro dispositivo e microfone ligado em modo push-to-talk não derrubam o app sem hardware.
	voice.set_mode("ptt")
	_check(voice.mode == "ptt" and panel._row_text(mode_row).begins_with("Voz: push-to-talk"), "o modo push-to-talk liga")
	voice.set_mode("off")


func _updater_tests() -> void:
	const Updater := preload("res://scripts/net/updater.gd")
	_check(Updater.is_newer("0.2.0", "0.1.9") and Updater.is_newer("v1.0.0", "0.9.9") and Updater.is_newer("0.1.10", "0.1.9"), "versões novas são reconhecidas")
	_check(not Updater.is_newer("0.1.0", "0.1.0") and not Updater.is_newer("0.1", "0.1.0") and not Updater.is_newer("0.0.9", "0.1.0"), "a mesma versão ou mais velha não atualiza")
	var release := {
		"tag_name": "v0.2.0", "draft": false, "prerelease": false, "body": "Novidades",
		"assets": [
			{"name": "Guacamole-servidor.zip", "browser_download_url": "https://x/s.zip", "size": 5},
			{"name": Updater.ASSET, "browser_download_url": "https://x/c.zip", "size": 10, "digest": "sha256:abc123"},
		],
	}
	var info := Updater.parse_release(release)
	_check(info["version"] == "0.2.0" and info["url"] == "https://x/c.zip" and info["digest"] == "abc123" and info["size"] == 10, "a release vira versão, endereço e hash do zip do cliente")
	_check(Updater.parse_release({"tag_name": "v9", "assets": []}).is_empty(), "release sem o zip do cliente é ignorada")
	release["prerelease"] = true
	_check(Updater.parse_release(release).is_empty(), "pré-lançamento é ignorado")
	_check(not Updater.can_install(), "pelo editor ou testes não há o que trocar")
	_check(Updater.current_version() == str(ProjectSettings.get_setting("application/config/version")) and not Updater.is_newer(Updater.current_version(), Updater.current_version()), "a versão do programa vem do projeto")


func _scene_file_tests(ana: Node, table: Control) -> void:
	const SceneFile := preload("res://scripts/ui/scene_file.gd")
	var active: Dictionary = {}
	for scene in ana.scene["scenes"]:
		if scene["id"] == ana.scene["activeId"]:
			active = scene
	var count: int = (active["cards"] as Array).size()
	var media := SceneFile.media_ids(active).size()
	# Um som tocando e uma imagem de fundo entram no arquivo; o som sai parado.
	var path := "user://teste.guacascene"
	var saved: Dictionary = await SceneFile.save(ana, active, path)
	_check(saved["ok"], "Ana salva a cena ativa em arquivo (%s)" % saved["message"])
	var zip := ZIPReader.new()
	_check(zip.open(path) == OK and zip.file_exists("cena.json"), "o arquivo é um zip com cena.json")
	var in_zip := Array(zip.get_files()).filter(func(f: String) -> bool: return f.begins_with("midia/") and not f.ends_with("/"))
	_check(in_zip.size() == media, "o zip leva %d arquivo(s) de mídia" % media)
	zip.close()

	var before: int = (ana.scene["scenes"] as Array).size()
	var loaded: Dictionary = await SceneFile.load_file(ana, path, "carregada")
	_check(loaded["ok"], "Ana carrega o arquivo (%s)" % loaded["message"])
	_check(await _wait(func() -> bool: return (ana.scene["scenes"] as Array).size() == before + 1 and ana.scene["activeId"] == "carregada"), "a cena carregada vira a ativa")
	var copy: Dictionary = {}
	for scene in ana.scene["scenes"]:
		if scene["id"] == "carregada":
			copy = scene
	_check((copy["cards"] as Array).size() == count and (copy["zones"] as Array).size() == (active["zones"] as Array).size(), "cards e zonas voltam iguais")
	var playing := (copy["cards"] as Array).filter(func(c: Dictionary) -> bool: return c.get("audio") is Dictionary and c["audio"]["playing"])
	_check(playing.is_empty(), "nenhum som volta tocando")
	var garbage := FileAccess.open("user://lixo.guacascene", FileAccess.WRITE)
	garbage.store_string("não é zip")
	garbage.close()
	var refused: Dictionary = await SceneFile.load_file(ana, "user://lixo.guacascene", "x")
	_check(not refused["ok"], "um arquivo qualquer é recusado")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	DirAccess.remove_absolute(ProjectSettings.globalize_path("user://lixo.guacascene"))
	var panel: Control = table._scene
	# Áudio como tipo de card: só o anfitrião o vê na lista.
	panel._new_card()
	var guest_kinds: Array = panel._choice_options.map(func(o: Dictionary) -> String: return o["value"])
	panel._mode = "browse"
	var real_role: String = table._client.you["role"]
	table._client.you["role"] = "host"
	panel._new_card()
	var host_kinds: Array = panel._choice_options.map(func(o: Dictionary) -> String: return o["value"])
	panel._mode = "browse"
	table._client.you["role"] = real_role
	_check(not guest_kinds.has("audio") and host_kinds.has("audio") and host_kinds.size() == guest_kinds.size() + 1, "o tipo Áudio aparece na criação de cards só para o anfitrião")
	panel._rebuild()
	panel._scenes_view = true
	panel._rebuild()
	var rows: Array = panel._rows.map(func(r: Dictionary) -> String: return r["kind"])
	_check(rows.has("new_scene") and not rows.has("save_scene") and not rows.has("load_scene"), "quem não é anfitrião não vê salvar nem carregar")
	panel._scenes_view = false
	panel._rebuild()

	# A mesa inteira: salvar, importar como mesa nova e entrar nela.
	const TableFile := preload("res://scripts/ui/table_file.gd")
	const StoreScript := preload("res://scripts/ui/store.gd")
	_check(StoreScript.get_value("room") == str(ana.room["id"]), "o cliente lembra da última mesa")
	var table_path := "user://teste.guacamesa"
	var table_saved: Dictionary = await TableFile.save(ana, table_path, true)
	_check(table_saved["ok"], "Ana salva a mesa inteira (%s)" % table_saved["message"])
	var table_zip := ZIPReader.new()
	_check(table_zip.open(table_path) == OK and table_zip.file_exists("mesa.json"), "o arquivo da mesa é um zip com mesa.json")
	table_zip.close()
	var dora := preload("res://scripts/net/client.gd").new()
	table.get_tree().root.add_child(dora)
	dora.configure(ana.http_base)
	var made: Dictionary = await TableFile.import_file(dora, table_path, "Dora")
	_check(made["ok"] and made["code"] != str(ana.room["id"]), "importar cria uma mesa com outro código (%s)" % made["message"])
	dora.connect_to_room(made["code"], "Dora", made["token"])
	_check(await _wait(func() -> bool: return not dora.you.is_empty()), "Dora entra na mesa importada")
	_check(dora.you.get("role") == "host", "quem importa é o anfitrião")
	_check((dora.scene["scenes"] as Array).size() == (ana.scene["scenes"] as Array).size(), "as cenas vieram")
	_check(dora.characters.size() == ana.characters.size(), "as fichas vieram")
	var first_media: Array = SceneFile.media_ids(copy)
	_check(first_media.is_empty() or not (await dora.download_bytes(str(first_media[0]))).is_empty(), "a mídia da mesa foi enviada junto")
	var not_a_table: Dictionary = await TableFile.import_file(dora, "user://teste.guacascene", "Dora")
	_check(not not_a_table["ok"], "um arquivo de cena não vale como mesa")
	dora.leave()
	dora.queue_free()
	DirAccess.remove_absolute(ProjectSettings.globalize_path(table_path))


func _run() -> void:
	# Em _initialize a árvore ainda não está ativa (HTTPRequest recusa pedidos).
	await process_frame
	Store.path = "user://test_settings.cfg"
	# Uma execução interrompida deixaria a última mesa salva e mudaria o menu.
	DirAccess.remove_absolute(ProjectSettings.globalize_path(Store.path))
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
	_check(root.gui_get_focus_owner() == table._audio._zone, "depois vem o áudio")
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
	_check(scene_panel._rows.map(func(r: Dictionary) -> String: return r["kind"]) == ["info", "header", "new_card"], "cena vazia: descrição, cabeçalho dos soltos e Adicionar card")
	scene_panel._cursor = 2
	await _key(KEY_ENTER, KEY_ENTER)
	_check(scene_panel._mode == "choice", "Adicionar card pergunta o tipo")
	await _key(KEY_ENTER, KEY_ENTER)
	_check(scene_panel._edit.visible, "nota pede o título")
	scene_panel._edit.text = "Taverna"
	scene_panel._edit.text_submitted.emit("Taverna")
	_check(scene_panel._area.visible, "depois do título vem o texto, multilinha")
	scene_panel._area.text = "Fumaça.\nCanecas."
	scene_panel._area.submitted.emit("Fumaça.\nCanecas.")
	_check(await _wait(func() -> bool: return (ana.scene["scenes"][0]["cards"] as Array).size() == 1), "o card chega em Ana")
	_check(await _wait(func() -> bool: return table.entries.any(func(e: Dictionary) -> bool: return e["kind"] == "system" and str(e["text"]).contains("adicionou o card Taverna"))), "o histórico anuncia o card")
	await _key(KEY_ENTER, KEY_ENTER)
	_check(scene_panel._open_id != "" and scene_panel._rows.map(func(r: Dictionary) -> String: return r["kind"]) == ["o_title", "o_line", "o_line"], "Enter num card de texto o abre, uma linha por linha")
	_check(scene_panel._row_text(scene_panel._rows[1]) == "Fumaça." and scene_panel._row_text(scene_panel._rows[2]) == "Canecas.", "as linhas do texto são lidas separadas")
	await _key(KEY_E, KEY_E)
	_check(scene_panel._edit.visible and scene_panel._edit.text == "Taverna", "E edita o título atual")
	scene_panel._edit.cancelled.emit()
	await _key(KEY_ESCAPE, KEY_ESCAPE)
	_check(scene_panel._open_id == "", "Escape fecha o card")
	await _key(KEY_S, KEY_S)
	_check(not scene_panel._scenes_view, "S não abre a lista de cenas para quem não é anfitrião")
	ana.scene_op({"type": "scene:create", "id": "s2", "name": "Duelo"})
	_check(await _wait(func() -> bool: return scene_panel._title() == "Cena: Duelo"), "Ana (anfitriã) cria outra cena e Caio vê a troca")
	await _key(KEY_ENTER, KEY_ENTER)
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
	_check(scene_panel._rows[2]["kind"] == "card" and not (table._client.scene["scenes"][1]["cards"] as Array)[0]["hidden"], "V não oculta para quem não é anfitrião")
	ana.scene_op({"type": "card:remove", "cardId": "seg"})
	_check(await _wait(func() -> bool: return (table._client.scene["scenes"][1]["cards"] as Array).is_empty()), "card revelado removido")
	_check(table._client.templates.size() == 5, "o servidor oferece 5 modelos de ficha")

	# Zonas, relógio e tokens: Ana cria, Caio navega por seções e mexe no que pode.
	ana.scene_op({"type": "zone:add", "id": "z1", "name": "Altar", "description": "Pedra fria.", "cells": [{"x": 1, "y": 1}, {"x": 2, "y": 1}]})
	ana.scene_op({"type": "card:add", "id": "rel", "title": "Ritual", "text": "", "kind": "clock", "segments": 6})
	_check(await _wait(func() -> bool: return scene_panel._rows.map(func(r: Dictionary) -> String: return r["kind"]) == ["info", "header", "card", "new_card", "zone"]), "a zona e o relógio chegam em seções, o relógio solto")
	_check(scene_panel._row_text(scene_panel._rows[2]) == "Relógio, Ritual, 0 de 6", "o relógio fala o progresso")
	scene_panel._cursor = 2
	await _key(KEY_RIGHT, KEY_RIGHT)
	_check(await _wait(func() -> bool: return (ana.scene["scenes"][1]["cards"] as Array)[0]["clock"]["filled"] == 1), "Direita avança o relógio para todos")
	await _key(KEY_P, KEY_P)
	_check(scene_panel._mode == "choice", "P pergunta onde fica o card")
	await _key(KEY_DOWN, KEY_DOWN)
	await _key(KEY_ENTER, KEY_ENTER)
	_check(await _wait(func() -> bool: return (ana.scene["scenes"][1]["cards"] as Array)[0]["zoneId"] == "z1"), "o card vira token da zona")
	_check(scene_panel._rows.map(func(r: Dictionary) -> String: return r["kind"]) == ["info", "header", "new_card", "zone", "card"], "o card passa para a seção da zona")
	_check(scene_panel._rows[scene_panel._cursor]["kind"] == "card", "o cursor acompanha o card")
	_check(scene_panel._row_text(scene_panel._rows[3]).contains("Altar") and scene_panel._row_text(scene_panel._rows[3]).contains("2 células"), "a zona fala nome e tamanho")
	scene_panel._cursor = 3
	await _key(KEY_ENTER, KEY_ENTER)
	_check(scene_panel._mode == "browse" and not scene_panel._edit.visible, "quem não é anfitrião só ouve a zona")

	# Imagem: o envio ao servidor e o download por outro cliente.
	var png := Image.create(2, 2, false, Image.FORMAT_RGB8)
	png.fill(Color.RED)
	var png_path := ProjectSettings.globalize_path("user://test_fundo.png")
	png.save_png(png_path)
	var uploaded: Dictionary = await ana.upload_media(png_path)
	_check(uploaded["ok"] and str(uploaded["id"]).length() == 64, "Ana envia uma imagem ao servidor")
	var refused: Dictionary = await ana.upload_media(ProjectSettings.globalize_path("res://project.godot"))
	_check(not refused["ok"], "o servidor recusa arquivo que não é imagem")
	ana.scene_op({"type": "scene:background", "sceneId": "s2", "mediaId": uploaded["id"]})
	_check(await _wait(func() -> bool: return table._client.scene["scenes"][1]["background"] == uploaded["id"]), "o fundo chega a Caio")
	table._client.media_texture(str(uploaded["id"]))
	_check(await _wait(func() -> bool: return table._client.media_texture(str(uploaded["id"])) != null), "Caio baixa a imagem do fundo")
	DirAccess.remove_absolute(png_path)

	# Áudio: o anfitrião liga sons; Caio os ouve, posicionais quando estão numa zona.
	var wav_path := ProjectSettings.globalize_path("user://test_som.wav")
	var wav := PackedByteArray()
	var samples := 4000
	wav.append_array("RIFF".to_ascii_buffer())
	wav.append_array(_u32(36 + samples * 2))
	wav.append_array("WAVEfmt ".to_ascii_buffer())
	wav.append_array(_u32(16))
	wav.append_array(PackedByteArray([1, 0, 1, 0]))
	wav.append_array(_u32(8000))
	wav.append_array(_u32(16000))
	wav.append_array(PackedByteArray([2, 0, 16, 0]))
	wav.append_array("data".to_ascii_buffer())
	wav.append_array(_u32(samples * 2))
	wav.resize(44 + samples * 2)
	# Um tom de 440 Hz de verdade (não silêncio), para dar para medir o que sai no barramento principal.
	for i in samples:
		wav.encode_s16(44 + i * 2, int(12000.0 * sin(TAU * 440.0 * float(i) / 8000.0)))
	var wav_file := FileAccess.open(wav_path, FileAccess.WRITE)
	wav_file.store_buffer(wav)
	wav_file.close()
	var sound: Dictionary = await ana.upload_media(wav_path)
	_check(sound["ok"], "Ana envia um áudio ao servidor")
	ana.scene_op({"type": "card:add", "id": "fogo", "title": "Fogueira", "text": "", "kind": "audio", "mediaId": sound["id"], "mode": "ambient", "zoneId": "z1"})
	ana.scene_op({"type": "card:add", "id": "trovao", "title": "Trovão", "text": "", "kind": "audio", "mediaId": sound["id"], "mode": "effect"})
	var audio_panel: Control = table._audio
	var engine: Node = table._audio_engine
	_check(await _wait(func() -> bool: return audio_panel._rows.filter(func(r: Dictionary) -> bool: return r["kind"] == "audio").size() == 2), "Caio vê os dois sons na região de Áudio")
	_check(audio_panel._rows.map(func(r: Dictionary) -> String: return r["kind"]).filter(func(k: String) -> bool: return not k.begins_with("voice")) == ["master", "position", "header", "audio", "header", "audio"], "a lista tem volume, posição e seções de ambiência e efeito")
	var first_audio: int = audio_panel._rows.find_custom(func(r: Dictionary) -> bool: return r["kind"] == "audio")
	_check(audio_panel._row_text(audio_panel._rows[first_audio]).contains("Fogueira, ambiência, parado") and audio_panel._row_text(audio_panel._rows[first_audio]).contains("na zona Altar"), "o som fala modo, estado e zona")
	ana.scene_op({"type": "audio:play", "cardId": "fogo"})
	_check(await _wait(func() -> bool: return engine.has_voice("fogo")), "Caio baixa o som e ele começa a tocar")
	_check(engine.is_positional("fogo"), "o som numa zona é posicional")
	_check(await _wait(func() -> bool: return AudioServer.get_bus_peak_volume_left_db(0, 0) > -45.0 or AudioServer.get_bus_peak_volume_right_db(0, 0) > -45.0, 3.0), "o som numa zona sai de fato no barramento principal (%.1f dB)" % maxf(AudioServer.get_bus_peak_volume_left_db(0, 0), AudioServer.get_bus_peak_volume_right_db(0, 0)))
	var box: Rect2 = audio_panel._zone_box("z1")
	var spot := box.position + Vector2(0.25, 0.75)
	var voice_at: Callable = func() -> Vector2: return engine._card_spot(engine._active(), engine._card("fogo"))
	ana.scene_op({"type": "card:spot", "cardId": "fogo", "at": {"x": spot.x, "y": spot.y}})
	_check(await _wait(func() -> bool: return voice_at.call().is_equal_approx(spot * engine.CELL)), "o som toca do ponto exato dentro da zona")
	_check(engine._voices["fogo"]["playback"] is AudioStreamGeneratorPlayback and not engine._voices["fogo"]["player"] is Node3D, "os sons da cena posicionais saem pelo codec, não pelo áudio 3D do Godot")
	# A direção: à direita, à esquerda e à frente de quem ouve (o alto do grid é a frente).
	var here: Vector2 = engine._listener_position(engine._active())
	var right_of: Vector3 = engine.placement(here, here + Vector2(100, 0))["direction"]
	var left_of: Vector3 = engine.placement(here, here + Vector2(-100, 0))["direction"]
	var ahead: Vector3 = engine.placement(here, here + Vector2(0, -100))["direction"]
	_check(right_of.x > 0.99 and left_of.x < -0.99 and ahead.z > 0.99, "à direita do grid é a direita de quem ouve e o alto do grid é a frente")
	_check(float(engine.placement(here, here + Vector2(1200, 0))["closeness"]) > 0.5 and float(engine.placement(here, here)["closeness"]) == 1.0, "a queda de volume com a distância é suave: nunca some")
	# O áudio de verdade: o som posicionado à direita sai mais no ouvido direito, e à esquerda no esquerdo.
	var energy_of: Callable = func(direction: Vector3, hrtf: bool) -> Vector2:
		engine._codec.voice_start("probe", sound["id"], 0.0, true)
		var sum := Vector2.ZERO
		for k in 20:
			for v in engine._codec.voice_render("probe", direction.x, direction.y, direction.z, 1.0, hrtf):
				sum += Vector2(v.x * v.x, v.y * v.y)
		engine._codec.voice_stop("probe")
		return sum
	for hrtf_mode in [false, true]:
		var to_right: Vector2 = energy_of.call(Vector3(1, 0, 0), hrtf_mode)
		var to_left: Vector2 = energy_of.call(Vector3(-1, 0, 0), hrtf_mode)
		var in_front: Vector2 = energy_of.call(Vector3(0, 0, 1), hrtf_mode)
		_check(to_right.y > to_right.x * 1.5 and to_left.x > to_left.y * 1.5 and absf(in_front.x - in_front.y) < 0.05 * maxf(in_front.x, in_front.y), "o som da cena %s soa do lado certo (direita %s, esquerda %s, frente %s)" % ["em HRTF" if hrtf_mode else "em pan", to_right, to_left, in_front])
	ana.scene_op({"type": "card:spot", "cardId": "fogo", "at": {"x": spot.x, "y": spot.y}})
	_check(audio_panel._row_text(audio_panel._rows[first_audio]).contains("em ponto exato"), "a lista diz que o som tem ponto exato")
	audio_panel._spot_box = box
	audio_panel._spot_at = spot
	_check(audio_panel._spot_text().begins_with("Coluna "), "o ponto é falado em coluna e linha: %s" % audio_panel._spot_text())
	ana.scene_op({"type": "card:spot", "cardId": "fogo", "at": null})
	_check(await _wait(func() -> bool: return voice_at.call().is_equal_approx(engine.spot_of("z1"))), "sem ponto exato o som volta ao centro da zona")
	audio_panel._zone.grab_focus()
	audio_panel._cursor = 0
	await _key(KEY_LEFT, KEY_LEFT)
	_check(is_equal_approx(engine.master, 0.9), "Esquerda no volume geral baixa só o de Caio")
	audio_panel._cursor = first_audio
	await _key(KEY_ENTER, KEY_ENTER)
	_check(engine.has_voice("fogo"), "quem não é anfitrião não para o som")
	ana.scene_op({"type": "audio:stop", "cardId": "fogo"})
	_check(await _wait(func() -> bool: return not engine.has_voice("fogo")), "parar o som o silencia para Caio")
	# Pôr um som que já toca numa zona: ele continua soando, agora posicional.
	ana.scene_op({"type": "card:add", "id": "chuva", "title": "Chuva", "text": "", "kind": "audio", "mediaId": sound["id"], "mode": "ambient"})
	await _wait(func() -> bool: return not _card_of(table._client, "chuva").is_empty())
	await _wait(func() -> bool: return maxf(AudioServer.get_bus_peak_volume_left_db(0, 0), AudioServer.get_bus_peak_volume_right_db(0, 0)) < -60.0, 3.0)
	ana.scene_op({"type": "audio:play", "cardId": "chuva"})
	_check(await _wait(func() -> bool: return engine.has_voice("chuva") and AudioServer.get_bus_peak_volume_left_db(0, 0) > -45.0), "o som solto toca")
	_check(not engine.is_positional("chuva"), "e solto não é posicional")
	ana.scene_op({"type": "card:place", "cardId": "chuva", "zoneId": "z1"})
	_check(await _wait(func() -> bool: return engine.is_positional("chuva")), "pôr o som numa zona o torna posicional")
	await _wait(func() -> bool: return maxf(AudioServer.get_bus_peak_volume_left_db(0, 0), AudioServer.get_bus_peak_volume_right_db(0, 0)) < -60.0, 0.1)
	var after_place := -100.0
	for i in 20:
		await create_timer(0.1).timeout
		after_place = maxf(after_place, maxf(AudioServer.get_bus_peak_volume_left_db(0, 0), AudioServer.get_bus_peak_volume_right_db(0, 0)))
	_check(after_place > -20.0, "depois de posto na zona o som continua saindo bem alto (%.1f dB; solto era -11)" % after_place)
	ana.scene_op({"type": "audio:stop", "cardId": "chuva"})
	ana.scene_op({"type": "card:remove", "cardId": "chuva"})
	await create_timer(0.3).timeout
	ana.scene_op({"type": "audio:play", "cardId": "trovao"})
	await _key(KEY_1, KEY_1)
	scene_panel._zone.grab_focus()
	DirAccess.remove_absolute(wav_path)
	await _voice_tests(table, ana)

	# Contador, temporizador e tabela: Ana cria, Caio usa pelo teclado.
	ana.scene_op({"type": "card:add", "id": "vidas", "title": "Vidas", "text": "", "kind": "counter", "min": 0, "max": 5, "value": 3})
	ana.scene_op({"type": "card:add", "id": "prazo", "title": "Prazo", "text": "", "kind": "timer", "duration": 1})
	ana.scene_op({"type": "card:add", "id": "enc", "title": "Encontro", "text": "", "kind": "table", "entries": ["Lobo", "Bandido", "Nada"]})
	_check(await _wait(func() -> bool: return (table._client.scene["scenes"][1]["cards"] as Array).size() == 6), "Caio recebe contador, temporizador e tabela")
	_on_card(scene_panel, "vidas")
	_check(scene_panel._current_text() == "Contador, Vidas: 3, de 0 a 5", "o contador fala valor e limites")
	await _key(KEY_RIGHT, KEY_RIGHT)
	_check(await _wait(func() -> bool: return _card_of(ana, "vidas")["counter"]["value"] == 4), "Direita sobe o contador para todos")
	_on_card(scene_panel, "prazo")
	_check(scene_panel._current_text() == "Temporizador, Prazo, 1 segundo", "o temporizador parado fala o que falta")
	await _key(KEY_ENTER, KEY_ENTER)
	_check(await _wait(func() -> bool: return _card_of(ana, "prazo")["timer"]["running"]), "Enter inicia o temporizador para todos")
	_check(await _wait(func() -> bool: return scene_panel._ended.size() > 0, 5.0), "o fim do temporizador é avisado")
	_check(scene_panel._current_text() == "Temporizador, Prazo, esgotado", "e a lista diz que esgotou")
	await _key(KEY_R, KEY_R)
	_check(await _wait(func() -> bool: return not _card_of(ana, "prazo")["timer"]["running"] and _card_of(ana, "prazo")["timer"]["base"] == 0), "R zera o temporizador")
	_on_card(scene_panel, "enc")
	await _key(KEY_ENTER, KEY_ENTER)
	_check(await _wait(func() -> bool: return _card_of(ana, "enc")["table"]["last"] != null), "Enter sorteia na tabela")
	_check(scene_panel._current_text().contains("último sorteio"), "a tabela fala o último sorteio")
	_check(table.entries.any(func(e: Dictionary) -> bool: return e["kind"] == "system" and str(e["text"]).contains("sorteou em Encontro")), "o sorteio vai para o histórico")

	# Ordem de turnos (pipoca), votação e lista de verificação: abrir o card e agir por dentro.
	ana.scene_op({"type": "card:add", "id": "cmb", "title": "Combate", "text": "", "kind": "turns", "system": "popcorn"})
	ana.scene_op({"type": "card:add", "id": "voto", "title": "Onde vamos", "text": "", "kind": "poll", "entries": ["Norte", "Sul"], "anonymous": false})
	ana.scene_op({"type": "card:add", "id": "lista", "title": "Suprimentos", "text": "", "kind": "checklist", "entries": ["Água", "Corda"]})
	_check(await _wait(func() -> bool: return (table._client.scene["scenes"][1]["cards"] as Array).size() == 9), "Caio recebe turnos, votação e lista")
	ana.scene_op({"type": "turns:add", "cardId": "cmb", "entryId": "e1", "name": "Ana", "owner": "Ana"})
	ana.scene_op({"type": "turns:add", "cardId": "cmb", "entryId": "e2", "name": "Caio", "owner": "Caio"})
	ana.scene_op({"type": "turns:add", "cardId": "cmb", "entryId": "e3", "name": "Goblin"})
	_check(await _wait(func() -> bool: return (_card_of(table._client, "cmb")["turns"]["entries"] as Array).size() == 3), "os três participantes chegam")
	_on_card(scene_panel, "cmb")
	_check(scene_panel._current_text().begins_with("Ordem de turnos, Combate, pipoca"), "o card de turnos fala o sistema")
	await _key(KEY_ENTER, KEY_ENTER)
	_check(scene_panel._open_id == "cmb", "Enter abre o card de turnos")
	_check(scene_panel._rows.map(func(r: Dictionary) -> String: return r["kind"]).slice(0, 5) == ["o_title", "o_entry", "o_entry", "o_entry", "o_add_entry"], "dentro: os participantes e os botões")
	_on_detail_row(scene_panel, "o_entry", 2)
	await _key(KEY_ENTER, KEY_ENTER)
	_check(_card_of(ana, "cmb")["turns"]["current"] == null, "sem ninguém na vez, só o anfitrião escolhe o primeiro")
	ana.scene_op({"type": "turns:pick", "cardId": "cmb", "entryId": "e2"})
	_check(await _wait(func() -> bool: return _card_of(table._client, "cmb")["turns"]["current"] == "e2"), "Ana (anfitriã) dá o primeiro turno a Caio")
	_check(scene_panel._row_text(scene_panel._rows[2]) == "Caio, é a vez", "a lista diz de quem é a vez")
	_on_detail_row(scene_panel, "o_entry", 2)
	await _key(KEY_ENTER, KEY_ENTER)
	_check(await _wait(func() -> bool: return _card_of(ana, "cmb")["turns"]["current"] == "e3"), "Caio, na vez, escolhe o Goblin pelo teclado")
	await _key(KEY_ESCAPE, KEY_ESCAPE)
	_check(scene_panel._open_id == "" and scene_panel._rows[scene_panel._cursor]["kind"] == "card", "Escape volta aos cards")

	_on_card(scene_panel, "voto")
	await _key(KEY_ENTER, KEY_ENTER)
	_on_detail_row(scene_panel, "o_option", 1)
	await _key(KEY_ENTER, KEY_ENTER)
	_check(await _wait(func() -> bool: return _card_of(ana, "voto")["poll"]["total"] == 1), "Caio vota e o total chega a Ana")
	_check((_card_of(ana, "voto")["poll"]["votes"] as Dictionary).is_empty(), "o voto de Caio não chega a Ana enquanto a votação está aberta")
	_check(scene_panel._row_text(scene_panel._rows[2]) == "Sul, seu voto", "Caio vê o próprio voto")
	await _key(KEY_ESCAPE, KEY_ESCAPE)
	ana.scene_op({"type": "poll:state", "cardId": "voto", "open": false})
	_check(await _wait(func() -> bool: return not _card_of(table._client, "voto")["poll"]["open"]), "o anfitrião encerra a votação")
	_check((_card_of(ana, "voto")["poll"]["votes"] as Dictionary).has("Caio"), "ao encerrar, todos veem os votos")
	_check(table.entries.any(func(e: Dictionary) -> bool: return e["kind"] == "system" and str(e["text"]).contains("Votação Onde vamos encerrada")), "o resultado vai para o histórico")

	_on_card(scene_panel, "lista")
	await _key(KEY_ENTER, KEY_ENTER)
	_on_detail_row(scene_panel, "o_item", 0)
	await _key(KEY_ENTER, KEY_ENTER)
	_check(await _wait(func() -> bool: return _card_of(ana, "lista")["checklist"]["items"][0]["done"]), "Enter marca o item da lista para todos")
	_check(scene_panel._row_text(scene_panel._rows[1]) == "Água, marcado", "o item fala marcado")
	await _key(KEY_ESCAPE, KEY_ESCAPE)

	# Control mais cima ou baixo salta entre as seções: cards soltos e cada zona.
	scene_panel._cursor = 0
	scene_panel._jump_section(1)
	_check(scene_panel._rows[scene_panel._cursor]["kind"] == "header", "Control Baixo vai ao início dos cards soltos")
	scene_panel._jump_section(1)
	_check(scene_panel._rows[scene_panel._cursor]["kind"] == "zone", "Control Baixo seguinte vai à zona")
	scene_panel._jump_section(-1)
	_check(scene_panel._rows[scene_panel._cursor]["kind"] == "header", "Control Cima volta à seção anterior")

	# Campos: começam a aceitar digitação na hora, mesmo reabertos em cadeia, e filtram números.
	scene_panel._zone.grab_focus()
	scene_panel._begin_edit("Primeiro", "ab", func(_first: String) -> void:
		scene_panel._begin_number("Segundo", "7", func(_second: String) -> void: pass))
	await process_frame
	await process_frame
	_check(scene_panel._edit.is_editing(), "o campo aberto começa em modo de edição")
	await _key(KEY_ENTER, KEY_ENTER)
	await process_frame
	_check(scene_panel._edit.visible and scene_panel._edit.accessibility_name == "Segundo" and scene_panel._edit.is_editing(), "o campo reaberto em cadeia também aceita digitação")
	await _key(KEY_UP, KEY_UP)
	await _key(KEY_TAB, KEY_TAB)
	_check(root.gui_get_focus_owner() == scene_panel._edit, "Tab e setas verticais não tiram o foco do campo")
	scene_panel._edit.text = "1.5x"
	scene_panel._edit._on_text_changed(scene_panel._edit.text)
	_check(scene_panel._edit.text == "15", "campo de número descarta ponto e letras")
	scene_panel._edit.text = "-3-"
	scene_panel._edit.kind = "int"
	scene_panel._edit._on_text_changed(scene_panel._edit.text)
	_check(scene_panel._edit.text == "-3", "campo com sinal aceita um menos no início")
	scene_panel._edit.kind = "duration"
	scene_panel._edit.text = "2:3a0"
	scene_panel._edit._on_text_changed(scene_panel._edit.text)
	_check(scene_panel._edit.text == "2:30", "campo de duração aceita dois pontos")
	scene_panel._edit.cancelled.emit()

	# O campo de mensagem devolve o foco para onde ele estava, não sempre para as fichas.
	scene_panel._zone.grab_focus()
	await _key(KEY_SLASH, KEY_SEMICOLON, 59)
	_check(table._composer.has_focus(), "; abre o campo de mensagem a partir da cena")
	await _key(KEY_ESCAPE, KEY_ESCAPE)
	_check(root.gui_get_focus_owner() == scene_panel._zone, "Escape devolve o foco à região de cena")
	audio_panel._zone.grab_focus()
	await _key(KEY_SLASH, KEY_SEMICOLON, 59)
	table._composer.text_submitted.emit("")
	await process_frame
	_check(root.gui_get_focus_owner() == audio_panel._zone, "fechar o campo pelo envio devolve o foco à região de áudio")
	scene_panel._zone.grab_focus()

	# Control Baixo, de verdade, também salta entre seções.
	scene_panel._cursor = 0
	await _ctrl_key(KEY_DOWN)
	_check(scene_panel._rows[scene_panel._cursor]["kind"] == "header", "Control Baixo pelo teclado vai à primeira seção")

	ana.scene_op({"type": "scene:editors", "editors": "host"})
	_check(await _wait(func() -> bool: return table._client.scene["editors"] == "host"), "Ana restringe a edição dos cards")
	_check(await _wait(func() -> bool: return not scene_panel._rows.any(func(r: Dictionary) -> bool: return r["kind"] == "new_card")), "Caio deixa de ver Adicionar card")
	sheets._zone.grab_focus()

	# Compêndios: terceira região, adicionar, abrir itens, rolar oráculos e escolher ativos.
	var comp: Control = table._compendiums
	await _key(KEY_TAB, KEY_TAB)
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

	_updater_tests()
	await _scene_file_tests(ana, table)

	app.queue_free()
	ana.leave()
	DirAccess.remove_absolute(ProjectSettings.globalize_path(Store.path))
	print("---")
	print("Falhas: ", failures)
	quit(1 if failures > 0 else 0)


func _u32(value: int) -> PackedByteArray:
	var bytes := PackedByteArray()
	bytes.resize(4)
	bytes.encode_u32(0, value)
	return bytes

func _card_of(client: Node, card_id: String) -> Dictionary:
	for card in client.scene["scenes"][1]["cards"]:
		if card["id"] == card_id:
			return card
	return {}


## Põe o cursor da região de cena no card.
func _on_card(panel: Control, card_id: String) -> void:
	for i in panel._rows.size():
		if panel._rows[i]["kind"] == "card" and panel._active()["cards"][panel._rows[i]["index"]]["id"] == card_id:
			panel._cursor = i

## Põe o cursor numa linha do interior de um card aberto.
func _on_detail_row(panel: Control, kind: String, index: int) -> void:
	for i in panel._rows.size():
		if panel._rows[i]["kind"] == kind and int(panel._rows[i].get("index", 0)) == index:
			panel._cursor = i