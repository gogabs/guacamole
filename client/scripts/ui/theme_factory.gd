extends RefCounted
## Tema escuro de alto contraste, fonte grande e foco bem visível.

const BACKGROUND := Color("14161c")
const PANEL := Color("1d212b")
const TEXT := Color("f1f3f5")
const ACCENT := Color("ffd166")


static func build() -> Theme:
	var theme := Theme.new()
	theme.default_font_size = 24

	var field := _box(PANEL, 2, Color("5b6270"))
	var field_focus := _box(PANEL, 4, ACCENT)
	theme.set_stylebox("normal", "LineEdit", field)
	theme.set_stylebox("focus", "LineEdit", field_focus)
	theme.set_color("font_color", "LineEdit", TEXT)
	theme.set_color("font_placeholder_color", "LineEdit", Color("9aa0a6"))
	theme.set_color("caret_color", "LineEdit", ACCENT)

	theme.set_stylebox("normal", "Button", _box(Color("2b3a55"), 2, Color("5b6270")))
	theme.set_stylebox("hover", "Button", _box(Color("34466a"), 2, Color("5b6270")))
	theme.set_stylebox("pressed", "Button", _box(Color("22304a"), 2, ACCENT))
	theme.set_stylebox("focus", "Button", _box(Color("34466a"), 4, ACCENT))
	theme.set_color("font_color", "Button", TEXT)
	theme.set_color("font_focus_color", "Button", TEXT)

	theme.set_color("font_color", "Label", TEXT)
	theme.set_color("default_color", "RichTextLabel", TEXT)
	return theme


static func _box(fill: Color, border: int, border_color: Color) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = fill
	box.set_border_width_all(border)
	box.border_color = border_color
	box.set_corner_radius_all(8)
	box.set_content_margin_all(12)
	return box
