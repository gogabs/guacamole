extends LineEdit
## Campo de texto que fala o que acontece nele: caractere digitado, caractere apagado e o
## caractere sob o cursor ao mover com as setas.

const A11y := preload("res://scripts/ui/a11y.gd")

var _previous_text := ""
var _previous_caret := 0


func _ready() -> void:
	text_changed.connect(_on_text_changed)
	_previous_text = text


func _process(_delta: float) -> void:
	if not has_focus():
		_previous_text = text
		_previous_caret = caret_column
		return
	if text != _previous_text:
		# Alterado por código (limpar, preencher): sem fala.
		_previous_text = text
	elif caret_column != _previous_caret:
		var under := "fim" if caret_column >= text.length() else A11y.char_name(text[caret_column])
		Speech.say(under, true)
		Sfx.play("key", 1.2)
	_previous_caret = caret_column


func _on_text_changed(new_text: String) -> void:
	var delta := new_text.length() - _previous_text.length()
	if delta > 0:
		var start := maxi(0, caret_column - delta)
		Speech.say(A11y.char_name(new_text.substr(start, delta)), true)
		Sfx.play("key")
	elif delta < 0:
		var removed := _previous_text.substr(caret_column, -delta)
		Speech.say("apagou " + A11y.char_name(removed), true)
		Sfx.play("key", 0.7)
	_previous_text = new_text
	_previous_caret = caret_column
