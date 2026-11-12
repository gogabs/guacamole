extends RefCounted
## O interior dos cards que têm uma lista própria: ordem de turnos, votação e lista de
## verificação. A região Cena abre o card com Enter e delega a ele as linhas, a fala e as teclas;
## Escape volta à lista de cards. Tudo passa pelo servidor: aqui só se pedem operações.

const HELP := {
	"note": "Card de texto. Setas navegam pelas linhas, E edita o card, Escape volta aos cards.",
	"image": "Imagem. Setas navegam pela descrição, E edita o card, Escape volta aos cards.",
	"checklist": "Lista de verificação. Setas navegam, Enter marca ou desmarca, E edita o texto, Delete remove, Escape volta aos cards.",
	"poll": "Votação. Setas navegam, Enter vota na opção, e dá para mudar o voto enquanto está aberta. Escape volta aos cards.",
	"turns": (
		"Ordem de turnos. Setas navegam. No manual, Shift mais cima ou baixo muda a ordem e Enter em passar o turno avança. "
		+ "Na iniciativa, Enter dá o valor, R rola os dados do participante. No pipoca, Enter escolhe o próximo. "
		+ "Delete tira o participante. Escape volta aos cards."
	),
}
const SYSTEM_NAMES := {"manual": "manual", "initiative": "iniciativa", "popcorn": "pipoca"}

var panel: Control


func _init(owner_panel: Control) -> void:
	panel = owner_panel


func card() -> Dictionary:
	for c in panel._active()["cards"]:
		if c["id"] == panel._open_id:
			return c
	return {}


func _me() -> String:
	return str(panel._client.you.get("name", ""))


func rows() -> Array[Dictionary]:
	var out: Array[Dictionary] = [{"kind": "o_title"}]
	var c := card()
	if c.is_empty():
		return out
	match str(c["kind"]):
		"note", "image":
			for i in maxi(1, lines(c).size()):
				out.append({"kind": "o_line", "index": i})
		"checklist":
			var items: Array = c["checklist"]["items"]
			for i in items.size():
				out.append({"kind": "o_item", "index": i})
			if panel._can_edit():
				out.append({"kind": "o_add_item"})
		"poll":
			var options: Array = c["poll"]["options"]
			for i in options.size():
				out.append({"kind": "o_option", "index": i})
			if panel._is_host():
				out.append({"kind": "o_poll_state"})
				out.append({"kind": "o_poll_reset"})
		"turns":
			var turns: Dictionary = c["turns"]
			var entries: Array = turns["entries"]
			if turns["system"] != "popcorn":
				out.append({"kind": "o_next"})
			for i in entries.size():
				out.append({"kind": "o_entry", "index": i})
			if panel._can_edit():
				out.append({"kind": "o_add_entry"})
				out.append({"kind": "o_system"})
				if turns["system"] == "initiative":
					out.append({"kind": "o_roll_all"})
				out.append({"kind": "o_turns_reset"})
	return out


## As linhas não vazias do texto do card.
func lines(c: Dictionary) -> Array:
	var found: Array = []
	for line in str(c["text"]).split("\n"):
		if not line.strip_edges().is_empty():
			found.append(line.strip_edges())
	return found


func title() -> String:
	var c := card()
	return "Cena: %s, %s" % [panel._active()["name"], c.get("title", "")]


func summary(c: Dictionary) -> String:
	match str(c["kind"]):
		"checklist":
			var items: Array = c["checklist"]["items"]
			var done := 0
			for item in items:
				if item["done"]:
					done += 1
			return "Lista, %s, %d de %d marcados" % [c["title"], done, items.size()]
		"poll":
			var poll: Dictionary = c["poll"]
			return "Votação, %s, %s, %s" % [c["title"], "aberta" if poll["open"] else "encerrada", panel._plural(int(poll["total"]), "voto", "votos")]
		"turns":
			var turns: Dictionary = c["turns"]
			var line := "Ordem de turnos, %s, %s" % [c["title"], SYSTEM_NAMES[turns["system"]]]
			for entry in turns["entries"]:
				if entry["id"] == turns["current"]:
					line += ", vez de %s" % entry["name"]
			return line
	if str(c["kind"]) == "image":
		return "Imagem, %s" % c["title"]
	return str(c["title"])


func text(row: Dictionary) -> String:
	var c := card()
	match row["kind"]:
		"o_title":
			return _detail_summary(c)
		"o_line":
			var found := lines(c)
			return str(found[row["index"]]) if not found.is_empty() else "Sem texto"
		"o_item":
			var item: Dictionary = c["checklist"]["items"][row["index"]]
			return "%s, %s" % [item["text"], "marcado" if item["done"] else "não marcado"]
		"o_add_item":
			return "Adicionar item"
		"o_option":
			return _option_text(c["poll"], c["poll"]["options"][row["index"]])
		"o_poll_state":
			return "Encerrar a votação e mostrar o resultado" if c["poll"]["open"] else "Reabrir a votação"
		"o_poll_reset":
			return "Zerar os votos e reabrir"
		"o_next":
			return "Passar o turno"
		"o_entry":
			return _entry_text(c["turns"], c["turns"]["entries"][row["index"]])
		"o_add_entry":
			return "Adicionar participante"
		"o_system":
			return "Sistema de turnos: %s" % SYSTEM_NAMES[c["turns"]["system"]]
		"o_roll_all":
			return "Rolar a iniciativa de quem ainda não tem"
		"o_turns_reset":
			return "Zerar a ordem de turnos"
	return ""


func is_button(row: Dictionary) -> bool:
	return row["kind"] != "o_title" and row["kind"] != "o_line"


func _detail_summary(c: Dictionary) -> String:
	var line := summary(c)
	if str(c["kind"]) == "turns":
		line += ", rodada %d" % int(c["turns"]["round"])
	return line


func _option_text(poll: Dictionary, option: Dictionary) -> String:
	var mine: Variant = (poll["votes"] as Dictionary).get(_me())
	if poll["open"]:
		return "%s%s" % [option["text"], ", seu voto" if mine == option["id"] else ""]
	var voters: Array = []
	var count := 0
	for voter in poll["votes"]:
		if poll["votes"][voter] == option["id"]:
			count += 1
			voters.append(str(voter))
	var line := "%s, %s" % [option["text"], panel._plural(count, "voto", "votos")]
	if not poll["anonymous"] and not voters.is_empty():
		line += ", " + ", ".join(voters)
	return line


func _entry_text(turns: Dictionary, entry: Dictionary) -> String:
	var parts: Array = [str(entry["name"])]
	if entry["id"] == turns["current"]:
		parts.append("é a vez")
	if turns["system"] == "initiative":
		parts.append("iniciativa %d" % int(entry["value"]) if entry["value"] != null else "sem iniciativa")
	elif turns["system"] == "popcorn" and entry["done"] and entry["id"] != turns["current"]:
		parts.append("já jogou")
	if entry["owner"] != null and entry["owner"] != entry["name"]:
		parts.append("de %s" % entry["owner"])
	return ", ".join(parts)


func help() -> String:
	return str(HELP.get(str(card().get("kind", "")), ""))


# --- Teclas -------------------------------------------------------------------------------------

func key(event: InputEventKey, row: Dictionary) -> bool:
	var kind: String = row.get("kind", "")
	match event.keycode:
		KEY_ENTER, KEY_KP_ENTER, KEY_SPACE:
			if not event.echo and not row.is_empty():
				Sfx.play("activate")
				_activate(row)
		KEY_DELETE:
			if not event.echo:
				_remove(row)
		KEY_E:
			if not event.echo and kind == "o_item":
				_edit_item(row)
			elif not event.echo and str(card().get("kind", "")) in ["note", "image"]:
				if _guard():
					var c := card()
					panel._edit_card(str(c["id"]), str(c["title"]), str(c["text"]))
		KEY_R:
			if not event.echo and kind == "o_entry":
				_roll_entry(row)
		KEY_UP, KEY_DOWN:
			if event.shift_pressed and kind == "o_entry":
				_move_entry(row, -1 if event.keycode == KEY_UP else 1)
			else:
				return false
		_:
			return false
	return true


func _guard() -> bool:
	if panel._can_edit():
		return true
	Sfx.play("error")
	Speech.say("Só o anfitrião mexe nos cards desta mesa.", true)
	return false


func _cid() -> String:
	return str(panel._open_id)


func _activate(row: Dictionary) -> void:
	var c := card()
	match row["kind"]:
		"o_item":
			if _guard():
				panel._op({"type": "check:toggle", "cardId": _cid(), "itemId": c["checklist"]["items"][row["index"]]["id"]})
		"o_add_item":
			if _guard():
				panel._begin_edit("Texto do item", "", func(value: String) -> void:
					if not value.strip_edges().is_empty():
						panel._op({"type": "check:add", "cardId": _cid(), "itemId": panel._new_id(), "text": value}))
		"o_option":
			if not c["poll"]["open"]:
				Speech.say("A votação já foi encerrada.", true)
				return
			panel._op({"type": "poll:vote", "cardId": _cid(), "optionId": c["poll"]["options"][row["index"]]["id"]})
		"o_poll_state":
			if _host_only():
				panel._op({"type": "poll:state", "cardId": _cid(), "open": not c["poll"]["open"]})
		"o_poll_reset":
			if _host_only():
				panel._op({"type": "poll:reset", "cardId": _cid()})
		"o_next":
			panel._op({"type": "turns:next", "cardId": _cid()})
		"o_entry":
			_activate_entry(c["turns"], c["turns"]["entries"][row["index"]])
		"o_add_entry":
			if _guard():
				_add_entry()
		"o_system":
			if _guard():
				_choose_system(c["turns"])
		"o_roll_all":
			if _guard():
				panel._op({"type": "turns:roll", "cardId": _cid()})
		"o_turns_reset":
			if _guard():
				panel._op({"type": "turns:reset", "cardId": _cid()})
		"o_title", "o_line":
			Speech.say(text(row), true)


func _host_only() -> bool:
	if panel._is_host():
		return true
	Sfx.play("error")
	Speech.say("Só o anfitrião faz isso.", true)
	return false


func _activate_entry(turns: Dictionary, entry: Dictionary) -> void:
	match str(turns["system"]):
		"popcorn":
			panel._op({"type": "turns:pick", "cardId": _cid(), "entryId": entry["id"]})
		"initiative":
			if not _guard():
				return
			var start := str(int(entry["value"])) if entry["value"] != null else ""
			panel._begin_signed("Iniciativa de %s, vazio para limpar" % entry["name"], start, func(value: String) -> void:
				if value.strip_edges().is_empty():
					panel._op({"type": "turns:value", "cardId": _cid(), "entryId": entry["id"], "value": null})
				elif value.strip_edges().is_valid_int():
					panel._op({"type": "turns:value", "cardId": _cid(), "entryId": entry["id"], "value": int(value)})
				else:
					Sfx.play("error")
					Speech.say("Use um número.", true))
		_:
			Speech.say(_entry_text(turns, entry), true)


func _add_entry() -> void:
	var options: Array = []
	for player in panel._client.players:
		var who := str(player["name"])
		options.append({"label": "%s, pessoa da mesa" % who, "value": who})
	options.append({"label": "Outro participante, como um monstro", "value": ""})
	panel._begin_choice("Quem entra na ordem?", options, func(who: String) -> void:
		if not who.is_empty():
			panel._op({"type": "turns:add", "cardId": _cid(), "entryId": panel._new_id(), "name": who, "owner": who})
		else:
			panel._begin_edit("Nome do participante", "", func(value: String) -> void:
				if not value.strip_edges().is_empty():
					panel._op({"type": "turns:add", "cardId": _cid(), "entryId": panel._new_id(), "name": value, "owner": null})))


func _choose_system(turns: Dictionary) -> void:
	panel._begin_choice("Como se define a ordem? Trocar zera a rodada.", [
		{"label": "Manual, o anfitrião põe a ordem na mão", "value": "manual"},
		{"label": "Iniciativa, rolada ou digitada, do maior ao menor", "value": "initiative"},
		{"label": "Pipoca, quem joga escolhe o próximo", "value": "popcorn"},
	], func(system: String) -> void:
		if system != "initiative":
			panel._op({"type": "turns:system", "cardId": _cid(), "system": system})
			return
		panel._begin_edit("Dados da iniciativa, como 1d20 ou 2d6", "%dd%d" % [int(turns["count"]), int(turns["sides"])], func(dice: String) -> void:
			var parts := dice.to_lower().strip_edges().split("d")
			var op := {"type": "turns:system", "cardId": _cid(), "system": "initiative"}
			if parts.size() == 2 and parts[0].is_valid_int() and parts[1].is_valid_int():
				op["count"] = int(parts[0])
				op["sides"] = int(parts[1])
			panel._op(op)))


func _roll_entry(row: Dictionary) -> void:
	var c := card()
	if c["turns"]["system"] != "initiative":
		return
	if _guard():
		panel._op({"type": "turns:roll", "cardId": _cid(), "entryId": c["turns"]["entries"][row["index"]]["id"]})


func _move_entry(row: Dictionary, direction: int) -> void:
	var c := card()
	if c["turns"]["system"] != "manual":
		Speech.say("A ordem só muda na mão no sistema manual.", true)
		return
	if not _guard():
		return
	var entries: Array = c["turns"]["entries"]
	var target: int = int(row["index"]) + direction
	if target < 0 or target >= entries.size():
		Sfx.play("edge")
		return
	panel._follow_entry = str(entries[row["index"]]["id"])
	Sfx.play("tick", 1.2 if direction < 0 else 0.8)
	panel._op({"type": "turns:move", "cardId": _cid(), "entryId": entries[row["index"]]["id"], "direction": direction})


func _edit_item(row: Dictionary) -> void:
	if not _guard():
		return
	var item: Dictionary = card()["checklist"]["items"][row["index"]]
	panel._begin_edit("Texto do item", str(item["text"]), func(value: String) -> void:
		if not value.strip_edges().is_empty():
			panel._op({"type": "check:edit", "cardId": _cid(), "itemId": item["id"], "text": value}))


func _remove(row: Dictionary) -> void:
	var c := card()
	match str(row.get("kind", "")):
		"o_item":
			if not _guard():
				return
			var item: Dictionary = c["checklist"]["items"][row["index"]]
			panel._begin_choice("Remover o item %s?" % item["text"],
				[{"label": "Não, manter", "value": false}, {"label": "Sim, remover", "value": true}],
				func(confirmed: bool) -> void:
					if confirmed:
						panel._op({"type": "check:remove", "cardId": _cid(), "itemId": item["id"]}))
		"o_entry":
			if not _guard():
				return
			var entry: Dictionary = c["turns"]["entries"][row["index"]]
			panel._begin_choice("Tirar %s da ordem?" % entry["name"],
				[{"label": "Não, manter", "value": false}, {"label": "Sim, tirar", "value": true}],
				func(confirmed: bool) -> void:
					if confirmed:
						panel._op({"type": "turns:remove", "cardId": _cid(), "entryId": entry["id"]}))


# --- Criação ------------------------------------------------------------------------------------

## Pergunta o que cada tipo precisa e cria o card.
func create(kind: String, title: String) -> void:
	match kind:
		"turns":
			panel._begin_choice("Como se define a ordem?", [
				{"label": "Manual, o anfitrião põe a ordem na mão", "value": "manual"},
				{"label": "Iniciativa, rolada ou digitada, do maior ao menor", "value": "initiative"},
				{"label": "Pipoca, quem joga escolhe o próximo", "value": "popcorn"},
			], func(system: String) -> void:
				panel._op({"type": "card:add", "id": panel._new_id(), "title": title, "text": "", "kind": "turns", "system": system}))
		"poll":
			panel._begin_edit("Opções da votação, uma por linha, ao menos duas", "", func(lines: String) -> void:
				panel._begin_choice("O resultado mostra quem votou em quê?", [
					{"label": "Sim, mostrar os nomes", "value": false},
					{"label": "Não, votação anônima", "value": true},
				], func(anonymous: bool) -> void:
					panel._op({"type": "card:add", "id": panel._new_id(), "title": title, "text": "", "kind": "poll", "entries": lines.split("\n"), "anonymous": anonymous})), true)
		"checklist":
			panel._begin_edit("Itens iniciais, um por linha, pode ficar vazio", "", func(lines: String) -> void:
				panel._op({"type": "card:add", "id": panel._new_id(), "title": title, "text": "", "kind": "checklist", "entries": lines.split("\n")}), true)
