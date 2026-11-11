extends RefCounted
## Utilitários de fala. Controles nativos focáveis são anunciados pelo AccessKit; aqui não há
## nada que os anuncie de novo.


## "ABC234" -> "A B C 2 3 4", para a fala soletrar o código da mesa.
static func spell(text: String) -> String:
	var letters := PackedStringArray()
	for i in text.length():
		letters.append(text[i])
	return " ".join(letters)
