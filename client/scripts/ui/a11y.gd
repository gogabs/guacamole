extends RefCounted
## Acessibilidade feita à mão: cada controle focável anuncia rótulo, tipo e valor ao receber
## foco, com o som do seu tipo de componente.

const KIND_NAMES := {
	"field": "campo de texto",
	"button": "botão",
}

const CHAR_NAMES := {
	" ": "espaço", ".": "ponto", ",": "vírgula", ";": "ponto e vírgula", ":": "dois pontos",
	"/": "barra", "\\": "barra invertida", "-": "hífen", "_": "sublinhado", "+": "mais",
	"=": "igual", "!": "exclamação", "?": "interrogação", "(": "abre parênteses",
	")": "fecha parênteses", "@": "arroba", "#": "jogo da velha", "*": "asterisco",
	"\"": "aspas", "'": "apóstrofo", "&": "e comercial", "%": "por cento", "$": "cifrão",
}


static func wire(control: Control, label: String, kind: String) -> void:
	control.set_meta("a11y_label", label)
	control.set_meta("a11y_kind", kind)
	control.focus_entered.connect(func() -> void: announce_focus(control))


static func announce_focus(control: Control) -> void:
	var label: String = control.get_meta("a11y_label", "")
	var kind: String = control.get_meta("a11y_kind", "")
	var parts: PackedStringArray = [label, KIND_NAMES.get(kind, kind)]
	if control is LineEdit:
		var value := (control as LineEdit).text
		parts.append("vazio" if value.is_empty() else value)
	Sfx.play("focus_" + kind)
	Speech.say(", ".join(parts), true)


static func char_name(c: String) -> String:
	if CHAR_NAMES.has(c):
		return CHAR_NAMES[c]
	if c == c.to_upper() and c != c.to_lower():
		return "maiúscula " + c
	return c


## "ABC234" -> "A B C 2 3 4", para a fala soletrar o código da mesa.
static func spell(text: String) -> String:
	var letters := PackedStringArray()
	for i in text.length():
		letters.append(text[i])
	return " ".join(letters)
