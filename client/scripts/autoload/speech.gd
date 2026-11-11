extends Node
## Fala. Usa o Prismatoid (add-on Prism, singleton "Prism") quando estiver instalado, o que
## entrega o texto ao leitor de telas do usuário (NVDA, JAWS...) ou a um motor de fala.
## Sem o add-on, cai para o TTS do próprio Godot.

var last_spoken := ""

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
func say(text: String, interrupt: bool = true) -> void:
	if text.is_empty():
		return
	last_spoken = text
	print("[fala] ", text)
	if _prism_backend != null:
		_prism_backend.call("speak", text, interrupt)
	elif _voice != "":
		DisplayServer.tts_speak(text, _voice, 100, 1.0, 1.0, 0, interrupt)


func stop() -> void:
	if _prism_backend == null and _voice != "":
		DisplayServer.tts_stop()
