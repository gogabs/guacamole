extends RefCounted
## Fichas guardadas neste computador e arquivos de ficha: um .json por ficha, ou um .zip com várias.
##
## O arquivo guarda só o que descreve a ficha (modelo, nome, descrição e valores). O dono e o estado
## da mesa ficam de fora: quem importa vira o dono, e o servidor valida tudo contra o modelo.

const FORMAT := "guacamole-ficha"

## Testes apontam para outra pasta para não mexer nas fichas reais.
static var dir := "user://fichas"


static func to_sheet(character: Dictionary) -> Dictionary:
	return {
		"id": str(character.get("id", "")),
		"templateId": str(character.get("templateId", "")),
		"name": str(character.get("name", "")),
		"description": str(character.get("description", "")),
		"values": character.get("values", {}),
	}


static func _path(id: String) -> String:
	return "%s/%s.json" % [dir, id.validate_filename()]


static func _encode(sheets: Array) -> String:
	if sheets.size() == 1:
		return JSON.stringify({"format": FORMAT, "version": 1, "sheet": sheets[0]}, "\t")
	return JSON.stringify({"format": FORMAT, "version": 1, "sheets": sheets}, "\t")


## Extrai as fichas de um texto JSON. Ignora o que não for ficha reconhecível.
static func parse(text: String) -> Array[Dictionary]:
	var sheets: Array[Dictionary] = []
	var data: Variant = JSON.parse_string(text)
	if not data is Dictionary or data.get("format", "") != FORMAT:
		return sheets
	var found: Array = []
	if data.has("sheet"):
		found.append(data["sheet"])
	elif data.get("sheets") is Array:
		found.append_array(data["sheets"])
	for item in found:
		if item is Dictionary and item.get("templateId") is String and item.get("values") is Dictionary:
			sheets.append(to_sheet(item))
	return sheets


# --- Fichas locais ---------------------------------------------------------------------------

static func save(character: Dictionary) -> bool:
	var sheet := to_sheet(character)
	if str(sheet["id"]).is_empty():
		return false
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir))
	var file := FileAccess.open(_path(sheet["id"]), FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(_encode([sheet]))
	return true


static func has(id: String) -> bool:
	return FileAccess.file_exists(_path(id))


static func remove(id: String) -> void:
	if has(id):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(_path(id)))


static func list() -> Array[Dictionary]:
	var sheets: Array[Dictionary] = []
	if not DirAccess.dir_exists_absolute(dir):
		return sheets
	for file_name in DirAccess.get_files_at(dir):
		if file_name.get_extension() != "json":
			continue
		var text := FileAccess.get_file_as_string("%s/%s" % [dir, file_name])
		sheets.append_array(parse(text))
	sheets.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return str(a["name"]).naturalnocasecmp_to(str(b["name"])) < 0)
	return sheets


# --- Arquivos escolhidos pelo jogador ------------------------------------------------------------

## Grava um .json (uma ou mais fichas) ou, se o caminho terminar em .zip, um pacote.
static func write_file(path: String, sheets: Array) -> Error:
	if path.get_extension().to_lower() != "zip":
		var file := FileAccess.open(path, FileAccess.WRITE)
		if file == null:
			return FileAccess.get_open_error()
		file.store_string(_encode(sheets))
		return OK
	var zip := ZIPPacker.new()
	var error := zip.open(path)
	if error != OK:
		return error
	for i in sheets.size():
		var entry_name := "%02d-%s.json" % [i + 1, str(sheets[i]["name"]).validate_filename()]
		zip.start_file(entry_name)
		zip.write_file(_encode([sheets[i]]).to_utf8_buffer())
		zip.close_file()
	zip.close()
	return OK


## Lê um .json ou um .zip. Devolve as fichas reconhecidas, possivelmente nenhuma.
static func read_file(path: String) -> Array[Dictionary]:
	if path.get_extension().to_lower() != "zip":
		return parse(FileAccess.get_file_as_string(path))
	var sheets: Array[Dictionary] = []
	var zip := ZIPReader.new()
	if zip.open(path) != OK:
		return sheets
	for entry_name in zip.get_files():
		if entry_name.get_extension().to_lower() == "json":
			sheets.append_array(parse(zip.read_file(entry_name).get_string_from_utf8()))
	zip.close()
	return sheets


## Abre o diálogo nativo de arquivos do sistema. `done` recebe o caminho escolhido ou "" se cancelou.
## Devolve false quando o sistema não oferece o diálogo.
static func pick(save_mode: bool, title: String, suggested: String, done: Callable) -> bool:
	if not DisplayServer.has_feature(DisplayServer.FEATURE_NATIVE_DIALOG_FILE):
		return false
	var mode := DisplayServer.FILE_DIALOG_MODE_SAVE_FILE if save_mode else DisplayServer.FILE_DIALOG_MODE_OPEN_FILE
	var filters := PackedStringArray(["*.json, *.zip ; Fichas do Guacamole"])
	DisplayServer.file_dialog_show(
		title, "", suggested, false, mode, filters,
		func(status: bool, paths: PackedStringArray, _filter: int) -> void:
			done.call(paths[0] if status and not paths.is_empty() else "")
	)
	return true
