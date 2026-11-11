import type { NumberField, SheetSection, SheetTemplate } from "../types.ts";

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
          labels: ["1", "2", "3", "4"],
        },
        {
          id: "fate.stress.mental",
          type: "checks",
          label: "Estresse mental",
          description: "Duas caixas básicas. Vontade +1 ou +2 libera a terceira; Vontade +3 ou mais, a quarta.",
          count: 4,
          labels: ["1", "2", "3", "4"],
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

const text = (id: string, label: string) => ({ id, type: "text", label }) as const;

const consequences = (mild2: boolean): SheetSection => ({
  id: "consequences",
  title: "Consequências",
  fields: [
    text("fate.consequence.mild", "Suave (-2)"),
    ...(mild2 ? [text("fate.consequence.mild2", "Suave extra (-2)")] : []),
    text("fate.consequence.moderate", "Moderada (-4)"),
    text("fate.consequence.severe", "Grave (-6)"),
  ],
});

const stunts = (max: number): SheetSection => ({
  id: "stunts",
  title: "Façanhas",
  fields: [
    { id: "fate.stunts", type: "list", label: "Façanhas", itemLabel: "Façanha", maxItems: max },
    { id: "fate.refresh", type: "number", label: "Recarga", min: 1, max: 10, default: 3 },
    { id: "fate.fatePoints", type: "number", label: "Pontos de destino", min: 0, max: 20, default: 3 },
  ],
});

const notes: SheetSection = {
  id: "notes",
  title: "Anotações",
  fields: [{ id: "fate.notes", type: "textarea", label: "Anotações" }],
};

/** No Acelerado e no Condensado cada caixa de estresse vale 1. */
const oneEach = (count: number) => Array.from({ length: count }, () => "1");

const APPROACHES: Array<[id: string, label: string]> = [
  ["careful", "Cuidadoso"],
  ["clever", "Inteligente"],
  ["flashy", "Estiloso"],
  ["forceful", "Poderoso"],
  ["quick", "Rápido"],
  ["sneaky", "Sorrateiro"],
];

export const FATE_ACCELERATED_TEMPLATE: SheetTemplate = {
  id: "template.fate-accelerated",
  name: "Fate Acelerado",
  system: "fate",
  sections: [
    {
      id: "aspects",
      title: "Aspectos",
      fields: [
        text("fate.aspect.concept", "Conceito"),
        text("fate.aspect.trouble", "Dificuldade"),
        { id: "fate.aspect.others", type: "list", label: "Outros aspectos", itemLabel: "Aspecto", maxItems: 3 },
      ],
    },
    {
      id: "approaches",
      title: "Abordagens",
      fields: APPROACHES.map(([id, label]): NumberField => ({
        id: `fate.approach.${id}`,
        type: "number",
        label,
        min: 0,
        max: 5,
        default: 0,
        roll: "fate",
      })),
    },
    stunts(5),
    {
      id: "stress",
      title: "Estresse",
      fields: [{
        id: "fate.stress",
        type: "checks",
        label: "Estresse",
        count: 3,
        labels: oneEach(3),
      }],
    },
    consequences(false),
    notes,
  ],
};

const CONDENSED_SKILLS = SKILLS.filter(([id]) => id !== "academics");

export const FATE_CONDENSED_TEMPLATE: SheetTemplate = {
  id: "template.fate-condensed",
  name: "Fate Condensado",
  system: "fate",
  sections: [
    {
      id: "aspects",
      title: "Aspectos",
      fields: [
        text("fate.aspect.concept", "Conceito"),
        text("fate.aspect.trouble", "Dificuldade"),
        { id: "fate.aspect.others", type: "list", label: "Outros aspectos", itemLabel: "Aspecto", maxItems: 3 },
      ],
    },
    { id: "skills", title: "Perícias", fields: CONDENSED_SKILLS.map(skillField) },
    stunts(10),
    {
      id: "stress",
      title: "Estresse",
      fields: [
        {
          id: "fate.stress.physical",
          type: "checks",
          label: "Estresse físico",
          description: "Três caixas. Vigor +1 ou mais libera a quarta; Vigor +3 ou mais, a quinta.",
          count: 5,
          labels: oneEach(5),
        },
        {
          id: "fate.stress.mental",
          type: "checks",
          label: "Estresse mental",
          description: "Três caixas. Vontade +1 ou mais libera a quarta; Vontade +3 ou mais, a quinta.",
          count: 5,
          labels: oneEach(5),
        },
      ],
    },
    consequences(true),
    notes,
  ],
};