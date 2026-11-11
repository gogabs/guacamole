import {
  type CardValue,
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
    case "cards":
      return [];
    case "select":
      return field.default;
    case "progress":
      return { rank: "formidable", ticks: 0 };
    case "tracks":
      return [];
  }
}

export const MAX_DESCRIPTION = 500;

export function cleanDescription(raw: unknown): string {
  return (typeof raw === "string" ? raw : "").trim().slice(0, MAX_DESCRIPTION);
}

export function createCharacter(template: SheetTemplate, id: string, name: string): CharacterSheet {
  const values: Record<string, FieldValue> = {};
  for (const field of allFields(template)) values[field.id] = defaultValue(field);
  return { id, name: name.trim().slice(0, 80) || "Sem nome", description: "", templateId: template.id, values };
}

/**
 * Monta uma ficha a partir de dados de arquivo. É leniente: um campo ausente ou inválido volta ao
 * padrão em vez de recusar a ficha inteira, porque o arquivo pode vir de outra versão do modelo.
 */
export function importCharacter(template: SheetTemplate, id: string, data: Record<string, unknown>): CharacterSheet {
  const sheet = createCharacter(template, id, typeof data.name === "string" ? data.name : "");
  sheet.description = cleanDescription(data.description);
  const raw = typeof data.values === "object" && data.values !== null
    ? data.values as Record<string, unknown>
    : {};
  for (const field of allFields(template)) {
    if (!(field.id in raw)) continue;
    try {
      sheet.values[field.id] = coerceValue(field, raw[field.id]);
    } catch (error) {
      if (!(error instanceof SheetError)) throw error;
    }
  }
  return sheet;
}

/** Ajusta fichas guardadas por versões anteriores do modelo (um campo que mudou de tipo). */
export function migrateCharacter(template: SheetTemplate, sheet: CharacterSheet): CharacterSheet {
  const values = { ...sheet.values };
  for (const field of allFields(template)) {
    const value = values[field.id];
    const wasText = typeof value === "string";
    const wasList = field.type === "cards" && Array.isArray(value) && value.some((item) => typeof item === "string");
    if (((field.type === "list" || field.type === "cards") && wasText) || wasList) {
      values[field.id] = coerceValue(field, value);
    }
  }
  return { ...sheet, values };
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
      // Um texto vira uma lista, uma linha por item: assim os "Ativos" antigos (texto) são aproveitados.
      const items = typeof raw === "string" ? raw.split("\n") : raw;
      if (!Array.isArray(items) || items.some((item) => typeof item !== "string")) throw invalid(field);
      return (items as string[])
        .map((item) => item.trim().slice(0, 500))
        .filter(Boolean)
        .slice(0, field.maxItems);
    }
    case "cards": {
      // Textos soltos (ativos antigos) viram cartas só com o título.
      const items = typeof raw === "string" ? raw.split("\n") : raw;
      if (!Array.isArray(items)) throw invalid(field);
      const used = new Set<string>();
      const cards: CardValue[] = [];
      for (const item of items) {
        if (cards.length >= field.maxItems) break;
        const card = coerceCard(field, item, cards.length);
        if (!card) continue;
        while (used.has(card.id)) card.id += "+";
        used.add(card.id);
        cards.push(card);
      }
      return cards;
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

/** Uma carta válida, ou `undefined` para um texto vazio. Tamanhos são limitados; o resto lança. */
function coerceCard(field: SheetField, raw: unknown, index: number): CardValue | undefined {
  if (typeof raw === "string") {
    const title = raw.trim().slice(0, 120);
    return title ? { id: `carta-${index}`, title, text: "", details: [], meters: [], abilities: [] } : undefined;
  }
  if (typeof raw !== "object" || raw === null) throw invalid(field);
  const card = raw as Record<string, unknown>;
  if (typeof card.id !== "string" || !card.id || typeof card.title !== "string") throw invalid(field);
  const list = (value: unknown): Record<string, unknown>[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "object" || item === null)) throw invalid(field);
    return (value as Record<string, unknown>[]).slice(0, 20);
  };
  const text = (value: unknown, limit: number): string => {
    if (typeof value !== "string") throw invalid(field);
    return value.trim().slice(0, limit);
  };
  return {
    id: card.id.slice(0, 60),
    title: text(card.title, 120) || "Sem nome",
    text: card.text === undefined ? "" : text(card.text, 3000),
    details: list(card.details).map((d) => ({ label: text(d.label, 80), value: text(d.value ?? "", 200) })),
    meters: list(card.meters).map((m) => {
      if (typeof m.max !== "number" || typeof m.value !== "number") throw invalid(field);
      const max = clamp(Math.round(m.max), 1, 99);
      return { label: text(m.label, 80), max, value: clamp(Math.round(m.value), 0, max) };
    }),
    abilities: list(card.abilities).map((a) => ({
      name: text(a.name ?? "", 120),
      text: text(a.text ?? "", 1500),
      marked: a.marked === true,
    })),
  };
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
