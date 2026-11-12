extends Node
## Atualizador: consulta a última release do GitHub, baixa o zip do cliente, confere o hash e troca
## os arquivos do programa. O Windows não deixa sobrescrever o .exe em uso, então um script
## pequeno espera o programa fechar, copia os arquivos novos e o abre de novo.

signal checked(info: Dictionary)
signal progress(done: int, total: int)

const REPO := "gogabs/guacamole"
const API := "https://api.github.com/repos/%s/releases/latest" % REPO
const ASSET := "Guacamole-cliente-windows.zip"
const MAX_ZIP := 300 * 1024 * 1024

## {version, url, size, digest, notes} da última release, vazio se não há nada mais novo.
var available: Dictionary = {}

var _busy := false


## A versão deste programa, de application/config/version.
static func current_version() -> String:
	return str(ProjectSettings.get_setting("application/config/version", "0.0.0"))


## "1.2.10" é maior que "1.2.9"; um "v" na frente é ignorado.
static func is_newer(candidate: String, installed: String) -> bool:
	var a := _parts(candidate)
	var b := _parts(installed)
	for i in maxi(a.size(), b.size()):
		var x: int = a[i] if i < a.size() else 0
		var y: int = b[i] if i < b.size() else 0
		if x != y:
			return x > y
	return false


static func _parts(version: String) -> Array[int]:
	var parts: Array[int] = []
	for piece in version.trim_prefix("v").split("."):
		parts.append(int(piece))
	return parts


## Extrai da resposta da API o que importa; vazio se a release não tem o zip do cliente.
static func parse_release(release: Dictionary) -> Dictionary:
	if release.get("draft", false) or release.get("prerelease", false):
		return {}
	for asset in release.get("assets", []):
		if str(asset.get("name", "")) == ASSET:
			var digest := str(asset.get("digest", "")).trim_prefix("sha256:")
			return {
				"version": str(release.get("tag_name", "")).trim_prefix("v"),
				"url": str(asset.get("browser_download_url", "")),
				"size": int(asset.get("size", 0)),
				"digest": digest,
				"notes": str(release.get("body", "")),
			}
	return {}


## O programa foi exportado (e não está rodando pelo editor)? Só assim há o que trocar.
static func can_install() -> bool:
	return OS.has_feature("template") and OS.get_name() == "Windows"


## Pergunta ao GitHub se há versão mais nova. Emite `checked` com o resultado (vazio se não há).
func check() -> void:
	if _busy:
		return
	_busy = true
	var request := HTTPRequest.new()
	request.timeout = 10.0
	add_child(request)
	var headers := PackedStringArray(["Accept: application/vnd.github+json", "User-Agent: Guacamole-atualizador"])
	if request.request(API, headers) != OK:
		request.queue_free()
		_busy = false
		return
	var result: Array = await request.request_completed
	request.queue_free()
	_busy = false
	available = {}
	if result[0] == HTTPRequest.RESULT_SUCCESS and int(result[1]) == 200:
		var parsed: Variant = JSON.parse_string((result[3] as PackedByteArray).get_string_from_utf8())
		if parsed is Dictionary:
			var info := parse_release(parsed)
			if not info.is_empty() and is_newer(str(info["version"]), current_version()):
				available = info
	checked.emit(available)


## Baixa, confere e instala `available`. Em caso de sucesso o programa fecha e reabre sozinho.
## Devolve {ok, message}; só volta se algo deu errado.
func install() -> Dictionary:
	if available.is_empty():
		return {"ok": false, "message": "Não há atualização para instalar."}
	if not can_install():
		return {"ok": false, "message": "Só o programa instalado se atualiza, e só no Windows."}
	if _busy:
		return {"ok": false, "message": "Já estou ocupado com isso."}
	_busy = true
	var info := available
	var zip_path := "user://atualizacao.zip"
	var downloaded := await _download(str(info["url"]), zip_path, int(info["size"]))
	_busy = false
	if not downloaded:
		return {"ok": false, "message": "Não consegui baixar a atualização."}
	var expected := str(info["digest"])
	if not expected.is_empty() and FileAccess.get_sha256(zip_path) != expected:
		DirAccess.remove_absolute(zip_path)
		return {"ok": false, "message": "O arquivo baixado não confere com o da release. Nada foi alterado."}
	var staging := ProjectSettings.globalize_path("user://atualizacao")
	var extracted := _extract(zip_path, staging)
	DirAccess.remove_absolute(zip_path)
	if not extracted:
		return {"ok": false, "message": "O arquivo da atualização está com problema. Nada foi alterado."}
	_launch_swap(staging)
	return {"ok": true, "message": "Reiniciando para atualizar."}


func _download(url: String, path: String, expected_size: int) -> bool:
	var request := HTTPRequest.new()
	request.download_file = path
	request.body_size_limit = MAX_ZIP
	request.timeout = 0.0
	add_child(request)
	var outcome := {"done": false, "ok": false}
	request.request_completed.connect(func(result: int, code: int, _headers: PackedStringArray, _body: PackedByteArray) -> void:
		outcome["ok"] = result == HTTPRequest.RESULT_SUCCESS and code == 200
		outcome["done"] = true)
	var headers := PackedStringArray(["User-Agent: Guacamole-atualizador"])
	if request.request(url, headers) != OK:
		request.queue_free()
		return false
	while not outcome["done"]:
		progress.emit(request.get_downloaded_bytes(), maxi(expected_size, request.get_body_size()))
		await get_tree().create_timer(0.25).timeout
	request.queue_free()
	return outcome["ok"]


## Descompacta em `target` (pasta limpa). Recusa caminhos que sairiam dela.
func _extract(zip_path: String, target: String) -> bool:
	var zip := ZIPReader.new()
	if zip.open(zip_path) != OK:
		return false
	_clear(target)
	DirAccess.make_dir_recursive_absolute(target)
	var found_exe := false
	for entry in zip.get_files():
		if entry.contains("..") or entry.begins_with("/") or entry.contains(":"):
			zip.close()
			return false
		var destination := "%s/%s" % [target, entry]
		if entry.ends_with("/"):
			DirAccess.make_dir_recursive_absolute(destination)
			continue
		DirAccess.make_dir_recursive_absolute(destination.get_base_dir())
		var file := FileAccess.open(destination, FileAccess.WRITE)
		if file == null:
			zip.close()
			return false
		file.store_buffer(zip.read_file(entry))
		file.close()
		if entry.to_lower().ends_with(".exe"):
			found_exe = true
	zip.close()
	return found_exe


func _clear(path: String) -> void:
	if not DirAccess.dir_exists_absolute(path):
		return
	for sub in DirAccess.get_directories_at(path):
		_clear("%s/%s" % [path, sub])
	for file_name in DirAccess.get_files_at(path):
		DirAccess.remove_absolute("%s/%s" % [path, file_name])
	DirAccess.remove_absolute(path)


## Escreve o script que espera este programa fechar, copia os arquivos novos por cima e o reabre.
func _launch_swap(staging: String) -> void:
	var exe := OS.get_executable_path()
	var folder := exe.get_base_dir()
	var script := ProjectSettings.globalize_path("user://atualizar.cmd")
	var lines := [
		"@echo off",
		"set tries=0",
		":retry",
		"timeout /t 1 /nobreak >nul",
		"xcopy \"%s\\*\" \"%s\\\" /e /y /q >nul" % [staging.replace("/", "\\"), folder.replace("/", "\\")],
		"if errorlevel 1 (",
		"  set /a tries+=1",
		"  if %tries% lss 30 goto retry",
		")",
		"rmdir /s /q \"%s\"" % staging.replace("/", "\\"),
		"start \"\" \"%s\"" % exe.replace("/", "\\"),
		"del \"%~f0\"",
	]
	var file := FileAccess.open(script, FileAccess.WRITE)
	file.store_string("\r\n".join(lines) + "\r\n")
	file.close()
	OS.create_process("cmd.exe", ["/c", script.replace("/", "\\")])
	get_tree().quit()
