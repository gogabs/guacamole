import {
  type CharacterSheet,
  type FieldValue,
  type ProgressValue,
  type Rank,
  RANKS,
  type SheetField,
  type SheetTemplate,
  type TrackValue,
} from "./types.ts";

export class SheetError extends Error {}

export const MAX_TICKS = 40;
export const TICKS_PER_BOX = 4;

/** Marcas ganhas a cada "marcar progresso", por graduação (Ironsworn). */
export const TICKS_PER_MARK: Record<Rank, number> = {
  troublesome: 12,
  dangerous: 8,
  formidable: 4,
  extreme: 2,
  epic: 1,
};

export function progressScore(ticks: number): number {
  return Math.floor(ticks / TICKS_PER_BOX);
}

export function allFields(template: SheetTemplate): SheetField[] {
  return template.sections.flatMap((section) => section.fields);
}

export function findField(template: SheetTemplate, fieldId: string): SheetField {
  const field = allFields(template).find((candidate) => candidate.id === fieldId);
  if (!field) throw new SheetError(`Campo desconhecido: ${fieldId}.`);
  return field;
}

export function defaultValue(field: SheetField): FieldValue {
  switch (field.type) {
    case "text":
    case "textarea":
      return field.default ?? "";
    case "number":
      return field.default;
    case "checkbox":
      return field.default ?? false;
    case "checks":
      return Array.from({ length: field.count }, () => false);
    case "list":
      return [];
    case "select":
      return field.default;
    case "progress":
      return { rank: "formidable", ticks: 0 };
    case "tracks":
      return [];
  }
}

export function createCharacter(template: SheetTemplate, id: string, name: string): CharacterSheet {
  const values: Record<string, FieldValue> = {};
  for (const field of allFields(template)) values[field.id] = defaultValue(field);
  return { id, name: name.trim().slice(0, 80) || "Sem nome", templateId: template.id, values };
}

/** Valida e normaliza um valor vindo da rede. Números são ajustados; tipos errados lançam. */
export function coerceValue(field: SheetField, raw: unknown): FieldValue {
  switch (field.type) {
    case "text":
      return expectString(field, raw).slice(0, 200);
    case "textarea":
      return expectString(field, raw).slice(0, 5000);
    case "number":
      return clamp(Math.round(expectNumber(field, raw)), field.min, field.max);
    case "checkbox":
      if (typeof raw !== "boolean") throw invalid(field);
      return raw;
    case "checks": {
      if (!Array.isArray(raw) || raw.some((item) => typeof item !== "boolean")) throw invalid(field);
      return Array.from({ length: field.count }, (_, i) => raw[i] === true);
    }
    case "list": {
      if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string")) throw invalid(field);
      return (raw as string[])
        .map((item) => item.trim().slice(0, 500))
        .filter(Boolean)
        .slice(0, field.maxItems);
    }
    case "select": {
      if (typeof raw !== "string" || !field.options.includes(raw)) throw invalid(field);
      return raw;
    }
    case "progress":
      return coerceProgress(field, raw);
    case "tracks": {
      if (!Array.isArray(raw)) throw invalid(field);
      const seen = new Set<string>();
      const tracks: TrackValue[] = [];
      for (const item of raw.slice(0, field.maxItems)) {
        const track = coerceTrack(field, item);
        if (seen.has(track.id)) throw new SheetError(`Trilha repetida em ${field.label}.`);
        seen.add(track.id);
        tracks.push(track);
      }
      return tracks;
    }
  }
}

export function coerceProgress(field: SheetField, raw: unknown): ProgressValue {
  if (typeof raw !== "object" || raw === null) throw invalid(field);
  const { rank, ticks } = raw as Record<string, unknown>;
  if (typeof rank !== "string" || !RANKS.includes(rank as Rank)) throw invalid(field);
  if (typeof ticks !== "number" || !Number.isFinite(ticks)) throw invalid(field);
  return { rank: rank as Rank, ticks: clamp(Math.round(ticks), 0, MAX_TICKS) };
}

export function coerceTrack(field: SheetField, raw: unknown): TrackValue {
  const progress = coerceProgress(field, raw);
  const { id, name } = raw as Record<string, unknown>;
  if (typeof id !== "string" || !id || typeof name !== "string") throw invalid(field);
  return { id, name: name.trim().slice(0, 120) || "Sem nome", ...progress };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function expectString(field: SheetField, raw: unknown): string {
  if (typeof raw !== "string") throw invalid(field);
  return raw;
}

function expectNumber(field: SheetField, raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) throw invalid(field);
  return raw;
}

function invalid(field: SheetField): SheetError {
  return new SheetError(`Valor inválido para ${field.label}.`);
}
