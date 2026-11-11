import {
  burnMomentum as burnRoll,
  type IronswornRoll,
  type Roll,
  rollDungeonWorld,
  rollFate,
  rollIronsworn,
  rollProgress,
} from "../dice.ts";
import type { Rng } from "../rng.ts";
import {
  allFields,
  clamp,
  coerceTrack,
  coerceValue,
  findField,
  MAX_TICKS,
  progressScore,
  SheetError,
  TICKS_PER_MARK,
} from "./fields.ts";
import type {
  CharacterSheet,
  ProgressValue,
  Rank,
  SheetTemplate,
  TrackValue,
} from "./types.ts";

/** Operações atômicas sobre uma ficha. Ids de trilhas vêm do cliente, mantendo tudo determinístico. */
export type SheetOp =
  | { type: "field:set"; fieldId: string; value: unknown }
  | { type: "track:add"; fieldId: string; track: { id: string; name: string; rank: Rank } }
  | { type: "track:remove"; fieldId: string; trackId: string }
  /** `times` negativo desmarca. Em campos `tracks`, `trackId` é obrigatório. */
  | { type: "progress:mark"; fieldId: string; trackId?: string; times: number };

export function applySheetOp(
  template: SheetTemplate,
  sheet: CharacterSheet,
  op: SheetOp,
): CharacterSheet {
  const field = findField(template, op.fieldId);
  const set = (value: CharacterSheet["values"][string]): CharacterSheet => ({
    ...sheet,
    values: { ...sheet.values, [field.id]: value },
  });

  switch (op.type) {
    case "field:set":
      return set(coerceValue(field, op.value));

    case "track:add": {
      if (field.type !== "tracks") throw new SheetError(`${field.label} não tem trilhas.`);
      const tracks = sheet.values[field.id] as TrackValue[];
      if (tracks.length >= field.maxItems) {
        throw new SheetError(`Limite de ${field.maxItems} trilhas em ${field.label}.`);
      }
      if (tracks.some((track) => track.id === op.track.id)) {
        throw new SheetError("Já existe uma trilha com esse id.");
      }
      const track = coerceTrack(field, { ...op.track, ticks: 0 });
      return set([...tracks, track]);
    }

    case "track:remove": {
      if (field.type !== "tracks") throw new SheetError(`${field.label} não tem trilhas.`);
      const tracks = sheet.values[field.id] as TrackValue[];
      if (!tracks.some((track) => track.id === op.trackId)) {
        throw new SheetError("Trilha não encontrada.");
      }
      return set(tracks.filter((track) => track.id !== op.trackId));
    }

    case "progress:mark": {
      const times = clamp(Math.round(op.times), -10, 10);
      if (field.type === "progress") {
        return set(markProgress(sheet.values[field.id] as ProgressValue, times));
      }
      if (field.type === "tracks") {
        const tracks = sheet.values[field.id] as TrackValue[];
        if (!tracks.some((track) => track.id === op.trackId)) {
          throw new SheetError("Trilha não encontrada.");
        }
        return set(
          tracks.map((track) =>
            track.id === op.trackId ? { ...track, ...markProgress(track, times) } : track
          ),
        );
      }
      throw new SheetError(`${field.label} não é uma trilha de progresso.`);
    }
  }
}

function markProgress(progress: ProgressValue, times: number): ProgressValue {
  const ticks = clamp(progress.ticks + times * TICKS_PER_MARK[progress.rank], 0, MAX_TICKS);
  return { rank: progress.rank, ticks };
}

export interface FieldRollOptions {
  /** Bônus ou penalidade pontual somados ao valor do campo. */
  extra?: number;
  /** Vantagens (positivo) ou desvantagens (negativo) pedidas por quem rola, além das condições da ficha. */
  edge?: number;
  /** Obrigatório em campos `tracks`. */
  trackId?: string;
}

/** Os nomes das condições ativas entre os campos dados: caixa marcada, ou opção que não é a primeira. */
function penalties(template: SheetTemplate, sheet: CharacterSheet, ids: string[]): string[] {
  const names: string[] = [];
  for (const id of ids) {
    const field = findField(template, id);
    const value = sheet.values[id];
    const active = field.type === "checkbox" ? value === true : field.type === "select" && value !== field.options[0];
    if (active) names.push(field.label);
  }
  return names;
}

/** Rola a partir de um campo da ficha: perícia Fate, atributo Ironsworn/Dungeon World ou trilha de progresso. */
export function rollFromField(
  template: SheetTemplate,
  sheet: CharacterSheet,
  fieldId: string,
  rng: Rng,
  options: FieldRollOptions = {},
): Roll {
  const field = findField(template, fieldId);
  const extra = clamp(Math.round(options.extra ?? 0), -50, 50);

  if (field.type === "number" && field.roll) {
    const modifier = (sheet.values[field.id] as number) + extra;
    if (field.roll === "dungeon-world") {
      const reasons = penalties(template, sheet, field.disadvantageIf ?? []);
      const asked = clamp(Math.round(options.edge ?? 0), -3, 3);
      return rollDungeonWorld(modifier, rng, field.label, asked - reasons.length, reasons);
    }
    return field.roll === "fate"
      ? rollFate(modifier, rng, field.label)
      : rollIronsworn(modifier, rng, field.label);
  }

  if (field.type === "progress" && field.rollable) {
    const value = sheet.values[field.id] as ProgressValue;
    return rollProgress(progressScore(value.ticks), rng, field.label);
  }

  if (field.type === "tracks" && field.rollable) {
    const track = (sheet.values[field.id] as TrackValue[]).find((t) => t.id === options.trackId);
    if (!track) throw new SheetError("Trilha não encontrada.");
    return rollProgress(progressScore(track.ticks), rng, track.name);
  }

  throw new SheetError(`${field.label} não tem rolagem.`);
}

/** Queima o momentum da ficha: melhora a rolagem e volta o medidor ao valor de reinício. */
export function burnMomentum(
  template: SheetTemplate,
  sheet: CharacterSheet,
  roll: IronswornRoll,
): { sheet: CharacterSheet; roll: IronswornRoll } {
  const field = allFields(template).find((f) => f.type === "number" && f.role === "momentum");
  if (!field || field.type !== "number") throw new SheetError("Esta ficha não tem momentum.");

  const burned = burnRoll(roll, sheet.values[field.id] as number);
  if (!burned) throw new SheetError("Queimar o momentum não melhoraria este resultado.");

  const reset = clamp(field.resetTo ?? field.default, field.min, field.max);
  return { roll: burned, sheet: { ...sheet, values: { ...sheet.values, [field.id]: reset } } };
}
