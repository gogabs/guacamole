import type { NumberField, SheetTemplate } from "../types.ts";

/** Perícias do Fate Core. Os nomes são dados do modelo e podem ser trocados por mesa. */
const SKILLS: Array<[id: string, label: string]> = [
  ["academics", "Conhecimento"],
  ["athletics", "Atletismo"],
  ["burglary", "Roubo"],
  ["contacts", "Contatos"],
  ["crafts", "Ofícios"],
  ["deceive", "Enganar"],
  ["drive", "Condução"],
  ["empathy", "Empatia"],
  ["fight", "Lutar"],
  ["investigate", "Investigar"],
  ["lore", "Saber"],
  ["notice", "Percepção"],
  ["physique", "Vigor"],
  ["provoke", "Provocar"],
  ["rapport", "Relacionamento"],
  ["resources", "Recursos"],
  ["shoot", "Atirar"],
  ["stealth", "Furtividade"],
  ["will", "Vontade"],
];

const skillField = ([id, label]: [string, string]): NumberField => ({
  id: `fate.skill.${id}`,
  type: "number",
  label,
  min: 0,
  max: 8,
  default: 0,
  roll: "fate",
});

export const FATE_TEMPLATE: SheetTemplate = {
  id: "template.fate-core",
  name: "Fate Core",
  system: "fate",
  sections: [
    {
      id: "aspects",
      title: "Aspectos",
      fields: [
        { id: "fate.aspect.concept", type: "text", label: "Conceito" },
        { id: "fate.aspect.trouble", type: "text", label: "Dificuldade" },
        {
          id: "fate.aspect.others",
          type: "list",
          label: "Outros aspectos",
          itemLabel: "Aspecto",
          maxItems: 3,
        },
      ],
    },
    {
      id: "skills",
      title: "Perícias",
      fields: SKILLS.map(skillField),
    },
    {
      id: "stunts",
      title: "Façanhas",
      fields: [
        {
          id: "fate.stunts",
          type: "list",
          label: "Façanhas",
          itemLabel: "Façanha",
          maxItems: 10,
        },
        {
          id: "fate.refresh",
          type: "number",
          label: "Recarga",
          min: 1,
          max: 10,
          default: 3,
        },
        {
          id: "fate.fatePoints",
          type: "number",
          label: "Pontos de destino",
          min: 0,
          max: 20,
          default: 3,
        },
      ],
    },
    {
      id: "stress",
      title: "Estresse",
      fields: [
        {
          id: "fate.stress.physical",
          type: "checks",
          label: "Estresse físico",
          description: "Duas caixas básicas. Vigor +1 ou +2 libera a terceira; Vigor +3 ou mais, a quarta.",
          count: 4,
        },
        {
          id: "fate.stress.mental",
          type: "checks",
          label: "Estresse mental",
          description: "Duas caixas básicas. Vontade +1 ou +2 libera a terceira; Vontade +3 ou mais, a quarta.",
          count: 4,
        },
      ],
    },
    {
      id: "consequences",
      title: "Consequências",
      fields: [
        { id: "fate.consequence.mild", type: "text", label: "Suave (-2)" },
        { id: "fate.consequence.moderate", type: "text", label: "Moderada (-4)" },
        { id: "fate.consequence.severe", type: "text", label: "Grave (-6)" },
      ],
    },
    {
      id: "notes",
      title: "Anotações",
      fields: [{ id: "fate.notes", type: "textarea", label: "Anotações" }],
    },
  ],
};
