extends Node
## Ditado e legendas, tudo no próprio computador: a extensão em Rust (Transcriber, com Whisper)
## transcreve o microfone e este nó decide o destino do texto.
##
## Modos: "legendas" manda o que você disse como legenda para os outros da mesa; "diário" põe o que
## você disse no chat (e no diário em Lonelog), pedindo confirmação a cada frase (F5 aceita, F6
## descarta); "diário sem confirmar" põe direto. Falar "ação", "pergunta", "resultado",
## "consequência" ou "nota" no começo da frase anota com o símbolo do Lonelog.
##
## O modelo do Whisper (cerca de 142 MB) não vem no pacote: é baixado uma vez, com a sua permissão,
## para a pasta de dados do app.

signal changed
## Chegou uma frase para confirmar (modo diário).
signal heard(text: String)

const MODEL_NAME := "ggml-base.bin"
const MODEL_URL := "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"
const MODEL_MB := 142
## Um arquivo menor que isto é um download truncado ou uma página de erro.
const MIN_MODEL_BYTES := 100_000_000
const MODEL_DIR := "user://modelos"
const SETTINGS := "user://ditado.cfg"
const LANGUAGE := "pt"
const MAX_CAPTIONS := 30
const ACCEPT_KEY := KEY_F5
const DISCARD_KEY := KEY_F6
const MODE_NAMES := {
	"off": "desligado",
	"captions": "legendas para a mesa",
	"diary": "diário, confirmando cada frase",
	"auto": "diário, sem confirmar",
}
const MODE_ORDER := ["off", "captions", "diary", "auto"]
## Marcas faladas no começo da frase e o que viram no diário.
const SPOKEN_MARKS := {
	"ação": "@ %s", "acao": "@ %s", "pergunta": "? %s", "resultado": "-> %s",
	"consequência": "=> %s", "consequencia": "=> %s", "nota": "(nota: %s)",
}

var mode := "off"
## Ler em voz alta as legendas dos outros (por padrão não: a voz deles já está sendo ouvida).
var read_captions := false
## Legendas recebidas, as mais novas por último: [{author, text}].
var captions: Array = []

var _client: Node
var _voice: Node
var _transcriber: RefCounted
var _listening := false
var _queue: Array = []
var _http: HTTPRequest
var _download_progress := -1  # -1 sem download, 0 a 100 baixando
var _download_error := ""
var _model_say := 0


func setup(client: Node, voice: Node) -> void:
	_client = client
	_voice = voice


func _ready() -> void:
	if ClassDB.class_exists("Transcriber"):
		_transcriber = ClassDB.instantiate("Transcriber")
	_load_settings()
	if _client != null:
		_client.caption_received.connect(_on_caption)


func _exit_tree() -> void:
	_stop()


## A extensão nativa carregou? Sem ela o ditado fica indisponível, o resto do app segue.
func available() -> bool:
	return _transcriber != null


# --- Configuração ---------------------------------------------------------------------------------

func _load_settings() -> void:
	var file := ConfigFile.new()
	if file.load(SETTINGS) == OK:
		read_captions = bool(file.get_value("ditado", "ler_legendas", false))


func _save_settings() -> void:
	var file := ConfigFile.new()
	file.set_value("ditado", "ler_legendas", read_captions)
	file.save(SETTINGS)


func set_read_captions(on: bool) -> void:
	read_captions = on
	_save_settings()
	changed.emit()


# --- Modelo ---------------------------------------------------------------------------------------

func model_path() -> String:
	return ProjectSettings.globalize_path("%s/%s" % [MODEL_DIR, MODEL_NAME])


func model_ready() -> bool:
	var file := FileAccess.open(model_path(), FileAccess.READ)
	return file != null and file.get_length() >= MIN_MODEL_BYTES


func downloading() -> bool:
	return _download_progress >= 0


## Estado do modelo em palavras, para a linha do painel.
func model_text() -> String:
	if downloading():
		return "Modelo de voz: baixando, %d%%" % _download_progress
	if model_ready():
		return "Modelo de voz: pronto"
	if not _download_error.is_empty():
		return "Modelo de voz: %s. Enter tenta de novo" % _download_error
	return "Modelo de voz: não baixado. Enter baixa, cerca de %d megabytes" % MODEL_MB


## Baixa o modelo uma vez. Avisa por fala a cada 20%.
func download_model() -> void:
	if downloading() or model_ready():
		return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(MODEL_DIR))
	_download_error = ""
	_download_progress = 0
	_model_say = 0
	_http = HTTPRequest.new()
	_http.download_file = model_path() + ".part"
	_http.max_redirects = 8
	_http.use_threads = true
	add_child(_http)
	_http.request_completed.connect(_on_download_done)
	if _http.request(MODEL_URL) != OK:
		_finish_download("não consegui iniciar o download")
		return
	Speech.say("Baixando o modelo de voz.", true)
	changed.emit()


func _on_download_done(result: int, code: int, _headers: PackedStringArray, _body: PackedByteArray) -> void:
	var part := model_path() + ".part"
	var size := 0
	var file := FileAccess.open(part, FileAccess.READ)
	if file != null:
		size = file.get_length()
		file.close()
	if result != HTTPRequest.RESULT_SUCCESS or code != 200 or size < MIN_MODEL_BYTES:
		DirAccess.remove_absolute(part)
		_finish_download("o download falhou")
		return
	DirAccess.rename_absolute(part, model_path())
	_finish_download("")


func _finish_download(error: String) -> void:
	_download_progress = -1
	_download_error = error
	if _http != null:
		_http.queue_free()
		_http = null
	Sfx.play("msg_out" if error.is_empty() else "error")
	Speech.say("Modelo de voz pronto." if error.is_empty() else "Modelo de voz: %s." % error, true)
	changed.emit()


# --- Modo -----------------------------------------------------------------------------------------

func cycle_mode() -> String:
	return set_mode(MODE_ORDER[(MODE_ORDER.find(mode) + 1) % MODE_ORDER.size()])


## Muda o modo. Devolve o modo que ficou (continua desligado se faltar o modelo ou a extensão).
func set_mode(value: String) -> String:
	if value == mode or not MODE_NAMES.has(value):
		return mode
	if value != "off" and (not available() or not model_ready()):
		return mode
	var was_off := mode == "off"
	mode = value
	_queue.clear()
	if mode == "off":
		_stop()
	elif was_off:
		_start()  # entre modos ligados o modelo já carregado continua
	changed.emit()
	return mode


func _start() -> void:
	if _transcriber == null:
		return
	if not _transcriber.start(model_path(), LANGUAGE, AudioServer.get_mix_rate()):
		Speech.say(str(_transcriber.last_error()), true)
		mode = "off"
		return
	if not _listening:
		_listening = true
		_voice.listen_to_mic(true)
		_voice.mic_frames.connect(_on_frames)


func _stop() -> void:
	if _transcriber != null:
		_transcriber.stop()
	if _listening:
		_listening = false
		_voice.mic_frames.disconnect(_on_frames)
		_voice.listen_to_mic(false)


func _on_frames(frames: PackedVector2Array) -> void:
	_transcriber.push(frames)


## Só para os testes e para o fim do ditado: transcreve já o que foi falado até agora.
func flush() -> void:
	if _transcriber != null:
		_transcriber.flush()


func _process(_delta: float) -> void:
	if _http != null:
		var total := _http.get_body_size()
		if total > 0:
			var percent := int(100.0 * float(_http.get_downloaded_bytes()) / float(total))
			if percent != _download_progress:
				_download_progress = percent
				if percent / 20 > _model_say:
					_model_say = percent / 20
					Speech.say("%d por cento." % percent, false)
				changed.emit()
	if _transcriber == null or mode == "off":
		return
	var failure := str(_transcriber.last_error())
	if not failure.is_empty():
		Speech.say(failure, true)
		set_mode("off")
		return
	for text in _transcriber.poll():
		_on_text(str(text))


func _on_text(text: String) -> void:
	match mode:
		"captions":
			if _client != null:
				_client.send_caption(text)
		"diary":
			_queue.append(text)
			if _queue.size() == 1:
				_announce_pending()
			heard.emit(text)
		"auto":
			_commit(text)


# --- Diário ---------------------------------------------------------------------------------------

## A frase falada como linha do diário em Lonelog: uma marca falada no começo ("ação", "pergunta",
## "resultado", "consequência", "nota") vira o símbolo; sem marca, é narração.
static func format_line(text: String) -> String:
	var line := text.strip_edges()
	var regex := RegEx.create_from_string("^([^\\s,.:;\\-–—]+)[\\s,.:;\\-–—]+(.+)$")
	var found := regex.search(line)
	if found != null:
		var mark := found.get_string(1).to_lower()
		if SPOKEN_MARKS.has(mark):
			return str(SPOKEN_MARKS[mark]) % found.get_string(2).strip_edges()
	return line


func pending() -> Array:
	return _queue


func _announce_pending() -> void:
	if _queue.is_empty():
		return
	Speech.say("Ouvi: %s. F5 aceita, F6 descarta." % _queue[0], true)


func _commit(text: String) -> void:
	if _client != null:
		_client.send_chat(format_line(text))


func accept() -> void:
	if _queue.is_empty():
		return
	_commit(str(_queue.pop_front()))
	_announce_pending()


func discard() -> void:
	if _queue.is_empty():
		return
	_queue.pop_front()
	Speech.say("Descartado.", true)
	_announce_pending()


func _input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key == null or not key.pressed or key.echo or _queue.is_empty():
		return
	if key.keycode == ACCEPT_KEY:
		accept()
		get_viewport().set_input_as_handled()
	elif key.keycode == DISCARD_KEY:
		discard()
		get_viewport().set_input_as_handled()


# --- Legendas dos outros --------------------------------------------------------------------------

func _on_caption(author: String, text: String) -> void:
	captions.append({"author": author, "text": text})
	if captions.size() > MAX_CAPTIONS:
		captions.pop_front()
	if read_captions:
		Speech.say("%s: %s" % [author, text], false)
	changed.emit()
