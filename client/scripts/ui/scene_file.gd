extends RefCounted
## Cena em arquivo (.guacascene): um zip com `cena.json` e, em `midia/`, os arquivos de imagem e
## áudio que a cena usa, cada um com o hash do conteúdo como nome (o mesmo id da mesa). Só o que é
## da cena vai junto: nada de voz, lugares ou ficha. Os sons são salvos parados.

const FORMAT := "guacamole-cena"
const VERSION := 1
const EXTENSION := "guacascene"


## Os ids de mídia que a cena usa, sem repetir.
static func media_ids(scene: Dictionary) -> Array:
	var ids: Array = []
	var background: Variant = scene.get("background")
	if background is String and not (background as String).is_empty():
		ids.append(background)
	for card in scene.get("cards", []):
		var id: Variant = card.get("mediaId")
		if id is String and not (id as String).is_empty() and not ids.has(id):
			ids.append(id)
	return ids


## Grava a cena e a mídia dela em `path`. Devolve {ok, message}.
static func save(client: Node, scene: Dictionary, path: String) -> Dictionary:
	var media: Dictionary = {}
	for id in media_ids(scene):
		var bytes: PackedByteArray = await client.download_bytes(str(id))
		if bytes.is_empty():
			return {"ok": false, "message": "Não consegui baixar um arquivo da cena."}
		media[id] = bytes
	var stored: Dictionary = scene.duplicate(true)
	for card in stored["cards"]:
		if card.get("audio") is Dictionary:
			card["audio"]["playing"] = false
			card["audio"]["startedAt"] = null
	var zip := ZIPPacker.new()
	if zip.open(path) != OK:
		return {"ok": false, "message": "Não foi possível criar o arquivo."}
	zip.start_file("cena.json")
	zip.write_file(JSON.stringify({"formato": FORMAT, "versao": VERSION, "cena": stored}).to_utf8_buffer())
	zip.close_file()
	for id in media:
		zip.start_file("midia/%s" % id)
		zip.write_file(media[id])
		zip.close_file()
	zip.close()
	return {"ok": true, "message": "Cena %s salva, com %d arquivos de mídia." % [scene.get("name", ""), media.size()]}


## Lê o arquivo, envia a mídia ao servidor e pede ao anfitrião da mesa que traga a cena.
## Devolve {ok, message}.
static func load_file(client: Node, path: String, scene_id: String) -> Dictionary:
	var zip := ZIPReader.new()
	if zip.open(path) != OK:
		return {"ok": false, "message": "Não foi possível abrir o arquivo."}
	if not zip.file_exists("cena.json"):
		zip.close()
		return {"ok": false, "message": "Esse arquivo não é uma cena do Guacamole."}
	var parsed: Variant = JSON.parse_string(zip.read_file("cena.json").get_string_from_utf8())
	if not parsed is Dictionary or parsed.get("formato") != FORMAT or not parsed.get("cena") is Dictionary:
		zip.close()
		return {"ok": false, "message": "Esse arquivo não é uma cena do Guacamole."}
	for entry in zip.get_files():
		if not entry.begins_with("midia/") or entry.ends_with("/"):
			continue
		var sent: Dictionary = await client.upload_bytes(zip.read_file(entry), entry.get_file())
		if not sent["ok"]:
			zip.close()
			return {"ok": false, "message": str(sent["message"])}
	zip.close()
	client.scene_op({"type": "scene:import", "id": scene_id, "scene": parsed["cena"]})
	return {"ok": true, "message": ""}
