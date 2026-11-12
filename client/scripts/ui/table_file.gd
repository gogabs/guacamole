extends RefCounted
## Mesa em arquivo (.guacamesa): um zip com `mesa.json` (cenas, fichas e donos, compêndios, acesso
## e, se quiser, o histórico do chat) e, em `midia/`, todos os arquivos de imagem e áudio da mesa.
## Importar cria uma mesa nova, com outro código, em qualquer servidor; quem importa é o anfitrião.

const EXTENSION := "guacamesa"


## Grava a mesa em `path`. Só o anfitrião da mesa conectada consegue. Devolve {ok, message}.
static func save(client: Node, path: String, include_history: bool) -> Dictionary:
	var exported: Dictionary = await client.export_room(include_history)
	if not exported["ok"]:
		return {"ok": false, "message": str(exported["message"])}
	var table: Dictionary = exported["data"]
	var media: Dictionary = {}
	for info in table["mesa"].get("media", []):
		var bytes: PackedByteArray = await client.download_bytes(str(info["id"]))
		if bytes.is_empty():
			return {"ok": false, "message": "Não consegui baixar um arquivo da mesa."}
		media[str(info["id"])] = bytes
	var zip := ZIPPacker.new()
	if zip.open(path) != OK:
		return {"ok": false, "message": "Não foi possível criar o arquivo."}
	zip.start_file("mesa.json")
	zip.write_file(JSON.stringify(table).to_utf8_buffer())
	zip.close_file()
	for id in media:
		zip.start_file("midia/%s" % id)
		zip.write_file(media[id])
		zip.close_file()
	zip.close()
	return {"ok": true, "message": "Mesa salva, com %d arquivos de mídia." % media.size()}


## Lê o arquivo e cria a mesa no servidor atual de `client`. Devolve {ok, code, token, message}.
static func import_file(client: Node, path: String, host_name: String) -> Dictionary:
	var zip := ZIPReader.new()
	if zip.open(path) != OK:
		return {"ok": false, "code": "", "token": "", "message": "Não foi possível abrir o arquivo."}
	var parsed: Variant = null
	if zip.file_exists("mesa.json"):
		parsed = JSON.parse_string(zip.read_file("mesa.json").get_string_from_utf8())
	if not parsed is Dictionary or parsed.get("formato") != "guacamole-mesa":
		zip.close()
		return {"ok": false, "code": "", "token": "", "message": "Esse arquivo não é uma mesa do Guacamole."}
	var media: Dictionary = {}
	for entry in zip.get_files():
		if entry.begins_with("midia/") and not entry.ends_with("/"):
			media[entry.get_file()] = zip.read_file(entry)
	zip.close()
	return await client.import_room(parsed, media, host_name)
