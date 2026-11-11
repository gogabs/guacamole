import { DW2_CLASSES, DW2_PLAYBOOKS } from "./dw2_classes.ts";
import { DW2_EQUIPMENT, DW2_TAGS } from "./dw2_gear.ts";
import { DW2_MOVES, DW2_RULES } from "./dw2_rules.ts";
import type { Compendium } from "./types.ts";

export const DUNGEON_WORLD_COMPENDIUM: Compendium = {
  id: "dungeon-world-2",
  name: "Dungeon World 2",
  system: "dungeon-world",
  description:
    "Regras, movimentos, as nove classes com seus caminhos, equipamento e etiquetas do Dungeon World 2 (Alfa Final). " +
    "Os movimentos de classe e caminhos e o equipamento podem ser escolhidos na ficha de Dungeon World 2.",
  attribution:
    "Dungeon World 2, Alfa Final (fevereiro de 2026), de Helena Real e Spencer Moore, aberto para uso da comunidade. " +
    "Tradução e resumo em português feitos para este app; material de fã, não oficial, de um jogo ainda em testes. " +
    "Confira o livro para o texto exato. Fora desta versão: conflitos, relacionamentos, vínculos, itens mágicos, artefatos e o guia do Mestre.",
  items: [DW2_RULES, DW2_MOVES, DW2_CLASSES, DW2_PLAYBOOKS, DW2_EQUIPMENT, DW2_TAGS],
};
