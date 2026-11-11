extends Node
## Fala. Usa o Prismatoid (add-on Prism, singleton "Prism") quando estiver instalado, o que
## entrega o texto ao leitor de telas do usuário (NVDA, JAWS...) ou a um motor de fala.
## Sem o add-on, cai para o TTS do próprio Godot.

const MIN_GAP_MS := 60

var last_spoken := ""

var _queue: Array[Dictionary] = []
var _last_sent := 0
var _prism_backend: Object = null
var _voice := ""


func _ready() -> void:
	# Chamadas dinâmicas: o projeto abre mesmo sem o add-on instalado.
	if Engine.has_singleton("Prism"):
		var prism := Engine.get_singleton("Prism")
		var backend: Object = prism.call("create_best")
		if backend != null and backend.call("is_valid"):
			_prism_backend = backend
			return
	var voices := DisplayServer.tts_get_voices_for_language("pt")
	if voices.is_empty():
		voices = DisplayServer.tts_get_voices()
	if not voices.is_empty():
		_voice = voices[0]


func backend_name() -> String:
	if _prism_backend != null:
		return "Prismatoid"
	if _voice != "":
		return "TTS do Godot"
	return "sem voz"


## `interrupt` corta o que estiver sendo falado; false enfileira.
##
## As falas saem no máximo a cada MIN_GAP_MS. Segurar uma seta dispara dezenas de falas por segundo e o
## leitor de telas as enfileirava, deixando a voz atrasada: uma fala que interrompe agora descarta
## as que ainda não saíram, então só a última chega.
func say(text: String, interrupt: bool = true) -> void:
	if text.is_empty():
		return
	last_spoken = text
	print("[fala] ", text)
	if interrupt:
		_queue.clear()
	_queue.append({"text": text, "interrupt": interrupt})


func _process(_delta: float) -> void:
	if _queue.is_empty() or Time.get_ticks_msec() - _last_sent < MIN_GAP_MS:
		return
	var next: Dictionary = _queue.pop_front()
	_last_sent = Time.get_ticks_msec()
	_speak(str(next["text"]), bool(next["interrupt"]))


func _speak(text: String, interrupt: bool) -> void:
	if _prism_backend != null:
		_prism_backend.call("speak", text, interrupt)
	elif _voice != "":
		DisplayServer.tts_speak(text, _voice, 100, 1.0, 1.0, 0, interrupt)


func stop() -> void:
	_queue.clear()
	if _prism_backend == null and _voice != "":
		DisplayServer.tts_stop()
