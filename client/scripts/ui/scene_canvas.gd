extends Control
## Desenho da cena para quem enxerga: a imagem de fundo, o grid com as zonas e os cards postos
## em zonas como tokens. É só visual: não recebe foco nem mouse, e tudo o que ele mostra
## também está na lista da região Cena, que é o que o leitor de tela usa.

const ThemeFactory := preload("res://scripts/ui/theme_factory.gd")

const ZONE_COLORS := [
	Color("4f8bd6"), Color("d6824f"), Color("5fb37a"), Color("b36fd6"),
	Color("d6c14f"), Color("d65f7a"), Color("4fc4c4"), Color("8c8cd6"),
]

var _client: Node
var _scene: Dictionary = {}


func setup(client: Node) -> void:
	_client = client


func _ready() -> void:
	focus_mode = Control.FOCUS_NONE
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = Vector2(0, 200)
	_client.media_ready.connect(func(_id: String) -> void: queue_redraw())


func show_scene(scene: Dictionary) -> void:
	_scene = scene
	queue_redraw()


## O retângulo onde cabe o desenho, na proporção da imagem (ou do grid, sem imagem).
func _area(texture: Texture2D, grid: Dictionary) -> Rect2:
	var ratio := float(grid.get("cols", 8)) / maxf(1.0, float(grid.get("rows", 6)))
	if texture != null:
		ratio = float(texture.get_width()) / maxf(1.0, float(texture.get_height()))
	var width := size.x
	var height := width / ratio
	if height > size.y:
		height = size.y
		width = height * ratio
	return Rect2((size.x - width) / 2.0, (size.y - height) / 2.0, width, height)


func _draw() -> void:
	var grid: Dictionary = _scene.get("grid", {"cols": 8, "rows": 6})
	var texture: Texture2D = null
	if _scene.get("background") != null:
		texture = _client.media_texture(str(_scene["background"]))
	var area := _area(texture, grid)
	draw_rect(area, ThemeFactory.PANEL)
	if texture != null:
		draw_texture_rect(texture, area, false)
	var cols := int(grid.get("cols", 8))
	var rows := int(grid.get("rows", 6))
	var cell := Vector2(area.size.x / cols, area.size.y / rows)
	var line := Color(1, 1, 1, 0.12)
	for x in range(cols + 1):
		draw_line(area.position + Vector2(x * cell.x, 0), area.position + Vector2(x * cell.x, area.size.y), line)
	for y in range(rows + 1):
		draw_line(area.position + Vector2(0, y * cell.y), area.position + Vector2(area.size.x, y * cell.y), line)

	var font := ThemeDB.fallback_font
	var zones: Array = _scene.get("zones", [])
	var cards: Array = _scene.get("cards", [])
	for i in zones.size():
		var zone: Dictionary = zones[i]
		var color: Color = ZONE_COLORS[i % ZONE_COLORS.size()]
		var cells: Array = zone["cells"]
		for c in cells:
			var rect := Rect2(area.position + Vector2(c["x"] * cell.x, c["y"] * cell.y), cell)
			draw_rect(rect, Color(color, 0.28))
			draw_rect(rect, Color(color, 0.8), false, 1.5)
		if not cells.is_empty():
			var first: Dictionary = cells[0]
			var origin := area.position + Vector2(first["x"] * cell.x + 4, first["y"] * cell.y + 16)
			draw_string(font, origin, str(zone["name"]), HORIZONTAL_ALIGNMENT_LEFT, cell.x * 3.0, 14, Color.WHITE)
		# Os tokens ocupam as células da zona em ordem.
		var index := 0
		for card in cards:
			if card.get("zoneId") != zone["id"]:
				continue
			var spot: Dictionary = cells[index % cells.size()]
			var center := area.position + Vector2((spot["x"] + 0.5) * cell.x, (spot["y"] + 0.55) * cell.y)
			center.x += float(index / cells.size()) * 6.0
			_draw_token(card, center, minf(cell.x, cell.y) * 0.32, color, font)
			index += 1


func _draw_token(card: Dictionary, center: Vector2, radius: float, color: Color, font: Font) -> void:
	var alpha := 0.45 if card.get("hidden", false) else 1.0
	var texture: Texture2D = null
	if str(card.get("kind", "")) == "image" and card.get("mediaId") != null:
		texture = _client.media_texture(str(card["mediaId"]))
	if texture != null:
		draw_texture_rect(texture, Rect2(center - Vector2(radius, radius), Vector2(radius, radius) * 2.0), false, Color(1, 1, 1, alpha))
	else:
		draw_circle(center, radius, Color(0.1, 0.12, 0.16, alpha))
	draw_arc(center, radius, 0.0, TAU, 24, Color(color, alpha).lightened(0.3), 2.0)
	var clock: Variant = card.get("clock")
	if clock is Dictionary:
		var segments := maxi(1, int(clock["segments"]))
		var filled := int(clock["filled"])
		if filled > 0:
			draw_arc(center, radius * 0.6, -PI / 2.0, -PI / 2.0 + TAU * float(filled) / segments, 24, Color(1, 0.8, 0.3, alpha), radius * 0.5)
		return
	if texture == null:
		var letter := str(card.get("title", "?")).substr(0, 1).to_upper()
		var width := font.get_string_size(letter, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x
		draw_string(font, center + Vector2(-width / 2.0, 6), letter, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color(1, 1, 1, alpha))
