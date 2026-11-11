import type { NumberField, SelectField, SheetTemplate } from "../types.ts";

/** As condições têm três estados: livre, marcada (dá desvantagem no atributo ligado a ela) e trancada. */
const CONDITION_STATES = ["Livre", "Marcada", "Trancada"];

const condition = (id: string, label: string, stat: string): SelectField => ({
  id: `dw.cond.${id}`,
  type: "select",
  label,
  description: `Marcada ou trancada, dá desvantagem em todas as rolagens de ${stat}.`,
  options: CONDITION_STATES,
  default: "Livre",
});

const stat = (id: string, label: string, description: string, conditionId: string): NumberField => ({
  id: `dw.stat.${id}`,
  type: "number",
  label,
  description,
  min: -3,
  max: 3,
  default: 0,
  roll: "dungeon-world",
  disadvantageIf: [`dw.cond.${conditionId}`],
});

export const DUNGEON_WORLD_TEMPLATE: SheetTemplate = {
  id: "template.dungeon-world-2",
  name: "Dungeon World 2",
  system: "dungeon-world",
  sections: [
    {
      id: "identity",
      title: "Personagem",
      fields: [
        { id: "dw.class", type: "text", label: "Classe", description: "Bárbaro, Bardo, Clérigo, Druida, Guerreiro, Paladino, Patrulheiro, Ladino ou Mago." },
        { id: "dw.level", type: "number", label: "Nível", min: 1, max: 20, default: 1 },
        { id: "dw.xp", type: "number", label: "Experiência", description: "Com 5 de experiência, você sobe de nível e zera.", min: 0, max: 5, default: 0 },
        { id: "dw.origins", type: "textarea", label: "Origens", description: "Quem você é, de onde veio e por que aventura." },
        { id: "dw.appearance", type: "textarea", label: "Aparência" },
        { id: "dw.conflict", type: "textarea", label: "Conflito", description: "A luta central do personagem. Ninguém começa com um." },
      ],
    },
    {
      id: "stats",
      title: "Atributos",
      fields: [
        stat("str", "Força", "Poder e resistência física.", "exhausted"),
        stat("dex", "Destreza", "Rapidez, reflexos e agilidade.", "frightened"),
        stat("int", "Inteligência", "Percepção e cálculo.", "angry"),
        stat("wis", "Sabedoria", "Empatia, intuição e instinto.", "distracted"),
        stat("cha", "Carisma", "Presença, autoridade e simpatia.", "insecure"),
      ],
    },
    {
      id: "health",
      title: "Vida",
      fields: [
        {
          id: "dw.hp",
          type: "number",
          label: "Pontos de vida",
          description: "Abaixo da metade do máximo você está Ensanguentado, com desvantagem nos movimentos de batalha. Em zero, você encara a morte.",
          min: 0,
          max: 30,
          default: 8,
        },
        { id: "dw.hp.max", type: "number", label: "Máximo de pontos de vida", description: "Bárbaro e Guerreiro 10, Paladino 10, Bardo, Clérigo, Druida e Patrulheiro 8, Ladino e Mago 6.", min: 1, max: 30, default: 8 },
        { id: "dw.treasure", type: "number", label: "Tesouro", min: 0, max: 99, default: 0 },
      ],
    },
    {
      id: "conditions",
      title: "Condições",
      fields: [
        condition("angry", "Irritado", "Inteligência"),
        condition("distracted", "Distraído", "Sabedoria"),
        condition("exhausted", "Exausto", "Força"),
        condition("frightened", "Assustado", "Destreza"),
        condition("insecure", "Inseguro", "Carisma"),
      ],
    },
    {
      id: "moves",
      title: "Movimentos e caminhos",
      fields: [
        {
          id: "dw.moves",
          type: "cards",
          label: "Movimentos e caminhos",
          itemLabel: "Movimento",
          maxItems: 40,
          description: "O movimento inicial da classe e cada caminho, com os movimentos avançados que você já aprendeu marcados.",
          source: { compendium: "dungeon-world-2", item: "playbooks" },
        },
      ],
    },
    {
      id: "gear",
      title: "Equipamento",
      fields: [
        {
          id: "dw.gear",
          type: "cards",
          label: "Equipamento",
          itemLabel: "Equipamento",
          maxItems: 40,
          description: "Armas, armadura e itens, com os usos que ainda restam.",
          source: { compendium: "dungeon-world-2", item: "equipment" },
        },
      ],
    },
    {
      id: "bonds",
      title: "Relacionamentos e vínculos",
      fields: [
        { id: "dw.relationships", type: "list", label: "Relacionamentos", itemLabel: "Relacionamento", maxItems: 12, description: "Um por companheiro: nome, detalhes e profundidade." },
        { id: "dw.bonds", type: "list", label: "Vínculos", itemLabel: "Vínculo", maxItems: 12 },
        { id: "dw.advancements", type: "list", label: "Avanços", itemLabel: "Avanço", maxItems: 40, description: "O que você escolheu a cada nível." },
      ],
    },
    {
      id: "notes",
      title: "Anotações",
      fields: [{ id: "dw.notes", type: "textarea", label: "Anotações" }],
    },
  ],
};
