extends LineEdit
## Campo de edição nativo: o AccessKit o anuncia (nome e descrição abaixo), então o app não
## fala nada sobre ele. Só toca um clique por tecla digitada. Escape emite `cancelled`;
## Tab e as setas verticais são engolidos para o foco nunca sair daqui.

signal cancelled


func _ready() -> void:
	# Foco por Tab não começa a edição sozinho no Godot: sem isto o campo ignora a digitação.
	focus_entered.connect(edit)
	gui_input.connect(_on_gui_input)
	text_changed.connect(func(_text: String) -> void: Sfx.play("key"))


func setup(a11y_name: String, a11y_description: String = "") -> void:
	accessibility_name = a11y_name
	accessibility_description = a11y_description


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
