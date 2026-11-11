extends RefCounted
## Preferências locais: último servidor/nome/mesa e os tokens de anfitrião de cada mesa.

const PATH := "user://settings.cfg"


static func _load() -> ConfigFile:
	var config := ConfigFile.new()
	config.load(PATH)
	return config


static func get_value(key: String, fallback: String = "") -> String:
	return str(_load().get_value("last", key, fallback))


static func set_value(key: String, value: String) -> void:
	var config := _load()
	config.set_value("last", key, value)
	config.save(PATH)


static func token_for(room_id: String) -> String:
	return str(_load().get_value("tokens", room_id.to_upper(), ""))


static func save_token(room_id: String, token: String) -> void:
	var config := _load()
	config.set_value("tokens", room_id.to_upper(), token)
	config.save(PATH)
