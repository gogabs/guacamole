extends RefCounted
## Diário da mesa em Lonelog: o servidor monta o Markdown a partir do histórico completo e o
## cliente grava o arquivo escolhido.


## Grava o diário em `path`. Só o anfitrião da mesa conectada consegue. Devolve {ok, message}.
static func save(client: Node, path: String) -> Dictionary:
	var exported: Dictionary = await client.export_lonelog()
	if not exported["ok"]:
		return {"ok": false, "message": str(exported["message"])}
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return {"ok": false, "message": "Não foi possível criar o arquivo."}
	file.store_string(str(exported["data"].get("markdown", "")))
	file.close()
	return {"ok": true, "message": "Diário salvo."}
