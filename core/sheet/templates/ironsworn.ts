import type { CheckboxField, NumberField, SheetTemplate } from "../types.ts";

const stat = (id: string, label: string, description: string): NumberField => ({
  id: `iron.stat.${id}`,
  type: "number",
  label,
  description,
  min: 0,
  max: 5,
  default: 1,
  roll: "ironsworn",
});

const meter = (id: string, label: string): NumberField => ({
  id: `iron.meter.${id}`,
  type: "number",
  label,
  min: 0,
  max: 5,
  default: 5,
});

const condition = (id: string, label: string): CheckboxField => ({
  id: `iron.debility.${id}`,
  type: "checkbox",
  label,
});

export const IRONSWORN_TEMPLATE: SheetTemplate = {
  id: "template.ironsworn",
  name: "Ironsworn",
  system: "ironsworn",
  sections: [
    {
      id: "stats",
      title: "Atributos",
      fields: [
        stat("edge", "Agilidade", "Edge: velocidade, mira e esquiva."),
        stat("heart", "Coração", "Heart: coragem, empatia e vontade."),
        stat("iron", "Ferro", "Iron: força e agressividade."),
        stat("shadow", "Sombra", "Shadow: furtividade e engano."),
        stat("wits", "Astúcia", "Wits: conhecimento e atenção."),
      ],
    },
    {
      id: "meters",
      title: "Medidores",
      fields: [
        meter("health", "Saúde"),
        meter("spirit", "Espírito"),
        meter("supply", "Suprimentos"),
        {
          id: "iron.momentum",
          type: "number",
          label: "Momentum",
          description: "De -6 a +10. Ao queimar, volta para +2.",
          min: -6,
          max: 10,
          default: 2,
          role: "momentum",
          resetTo: 2,
        },
      ],
    },
    {
      id: "debilities",
      title: "Condições",
      fields: [
        condition("wounded", "Ferido"),
        condition("shaken", "Abalado"),
        condition("unprepared", "Despreparado"),
        condition("encumbered", "Sobrecarregado"),
        condition("maimed", "Mutilado"),
        condition("corrupted", "Corrompido"),
        condition("cursed", "Amaldiçoado"),
        condition("tormented", "Atormentado"),
      ],
    },
    {
      id: "progress",
      title: "Votos e vínculos",
      fields: [
        {
          id: "iron.vows",
          type: "tracks",
          label: "Votos",
          maxItems: 20,
          rollable: true,
        },
        {
          id: "iron.bonds",
          type: "progress",
          label: "Vínculos",
          ranked: false,
          rollable: true,
        },
        {
          id: "iron.journeys",
          type: "tracks",
          label: "Jornadas e combates",
          maxItems: 20,
          rollable: true,
        },
      ],
    },
    {
      id: "assets",
      title: "Ativos",
      fields: [
        {
          id: "iron.assets",
          type: "list",
          label: "Ativos",
          itemLabel: "Ativo",
          maxItems: 20,
        },
      ],
    },
    {
      id: "experience",
      title: "Experiência",
      fields: [
        { id: "iron.xp.earned", type: "number", label: "Experiência ganha", min: 0, max: 100, default: 0 },
        { id: "iron.xp.spent", type: "number", label: "Experiência gasta", min: 0, max: 100, default: 0 },
      ],
    },
    {
      id: "notes",
      title: "Anotações",
      fields: [{ id: "iron.notes", type: "textarea", label: "Anotações" }],
    },
  ],
};
