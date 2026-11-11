export type Rank = "troublesome" | "dangerous" | "formidable" | "extreme" | "epic";

export const RANKS: readonly Rank[] = ["troublesome", "dangerous", "formidable", "extreme", "epic"];

export interface ProgressValue {
  rank: Rank;
  /** 0 a 40; cada caixa da trilha tem 4 marcas. */
  ticks: number;
}

export interface TrackValue extends ProgressValue {
  id: string;
  name: string;
}

export type FieldValue =
  | string
  | number
  | boolean
  | boolean[]
  | string[]
  | ProgressValue
  | TrackValue[];

interface FieldBase {
  /** Estável: usado em rolagens, ações de rede e dados salvos. */
  id: string;
  label: string;
  /** Dica lida por leitores de tela junto ao campo. */
  description?: string;
}

export interface TextField extends FieldBase {
  type: "text";
  default?: string;
}

export interface TextareaField extends FieldBase {
  type: "textarea";
  default?: string;
}

export interface NumberField extends FieldBase {
  type: "number";
  min: number;
  max: number;
  default: number;
  /** Quando presente, o campo tem um botão "rolar" que usa o valor como modificador. */
  roll?: "fate" | "ironsworn";
  /** `momentum` permite queimar momentum e voltar para `resetTo`. */
  role?: "momentum";
  resetTo?: number;
}

export interface CheckboxField extends FieldBase {
  type: "checkbox";
  default?: boolean;
}

/** Caixas independentes (ex.: estresse do Fate). */
export interface ChecksField extends FieldBase {
  type: "checks";
  count: number;
  labels?: string[];
}

/** Lista ordenada de textos curtos (aspectos, façanhas, ativos). */
export interface ListField extends FieldBase {
  type: "list";
  itemLabel: string;
  maxItems: number;
}

export interface SelectField extends FieldBase {
  type: "select";
  options: string[];
  default: string;
}

/** Uma trilha de progresso (ex.: vínculos). */
export interface ProgressField extends FieldBase {
  type: "progress";
  ranked: boolean;
  rollable?: boolean;
}

/** Várias trilhas nomeadas (ex.: votos, jornadas, combates). */
export interface TracksField extends FieldBase {
  type: "tracks";
  maxItems: number;
  rollable?: boolean;
}

export type SheetField =
  | TextField
  | TextareaField
  | NumberField
  | CheckboxField
  | ChecksField
  | ListField
  | SelectField
  | ProgressField
  | TracksField;

export interface SheetSection {
  id: string;
  title: string;
  fields: SheetField[];
}

export interface SheetTemplate {
  id: string;
  name: string;
  system: "fate" | "ironsworn" | "custom";
  sections: SheetSection[];
}

export interface CharacterSheet {
  id: string;
  name: string;
  templateId: string;
  values: Record<string, FieldValue>;
}
