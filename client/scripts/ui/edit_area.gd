extends TextEdit
## Campo de edição de várias linhas (anotações, ativos). Enter pula linha, Ctrl+Enter confirma,
## Escape cancela. Tab é engolido para o foco nunca sair daqui. O AccessKit o anuncia.

signal submitted(text: String)
signal cancelled


func _ready() -> void:
	custom_minimum_size.y = 140
	wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	gui_input.connect(_on_gui_input)
	text_changed.connect(func() -> void: Sfx.play("key"))


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
		KEY_ENTER, KEY_KP_ENTER:
			if key.ctrl_pressed:
				submitted.emit(text)
				accept_event()
		KEY_TAB:
			accept_event()
