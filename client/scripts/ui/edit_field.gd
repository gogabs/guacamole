extends LineEdit
## Campo de edição nativo: o AccessKit o anuncia (nome e descrição abaixo), então o app não
## fala nada sobre ele. Só toca um clique por tecla digitada. Escape emite `cancelled`;
## Tab e as setas verticais são engolidos para o foco nunca sair daqui.
##
## `kind` limita o que se pode digitar: "text" (qualquer coisa), "uint" (só dígitos),
## "int" (dígitos e um menos no início) e "duration" (dígitos e dois pontos, como 2:30).

signal cancelled

var kind := "text"


func _ready() -> void:
	# Ao enviar com Enter o Godot encerra a edição do campo; se o mesmo campo for reaberto
	# na hora (uma pergunta seguida de outra), ele ficaria sem aceitar digitação.
	keep_editing_on_text_submit = true
	# Foco por Tab não começa a edição sozinho no Godot: sem isto o campo ignora a digitação
	# e as setas passam a mover o foco. Adiado para valer depois de qualquer fim de edição.
	focus_entered.connect(_start_editing, CONNECT_DEFERRED)
	gui_input.connect(_on_gui_input)
	text_changed.connect(_on_text_changed)


func setup(a11y_name: String, a11y_description: String = "") -> void:
	accessibility_name = a11y_name
	accessibility_description = a11y_description


func _start_editing() -> void:
	if has_focus():
		edit()


func _on_text_changed(new_text: String) -> void:
	var clean := _filtered(new_text)
	if clean != new_text:
		var caret := maxi(0, caret_column - (new_text.length() - clean.length()))
		text = clean
		caret_column = caret
		Sfx.play("error")
		return
	Sfx.play("key")


## O texto sem o que `kind` não aceita.
func _filtered(value: String) -> String:
	if kind == "text":
		return value
	var clean := ""
	for i in value.length():
		var c := value[i]
		var digit := c >= "0" and c <= "9"
		if digit or (kind == "duration" and c == ":") or (kind == "int" and c == "-" and clean.is_empty()):
			clean += c
	return clean


func _on_gui_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key == null or not key.pressed:
		return
	match key.keycode:
		KEY_ESCAPE:
			cancelled.emit()
			accept_event()
		KEY_TAB, KEY_UP, KEY_DOWN:
			accept_event()
