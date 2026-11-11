import { rollDiceCommand } from "./dice.ts";
import type {
  CharacterFieldValue,
  CharacterSheet,
  CharacterTemplate,
  ChatMessage,
  ClockField,
  ComboField,
  CounterField,
  FieldType,
  GuacamoleState,
  SafetyAction,
  Scene,
  SheetField,
  SheetSection,
  SliderField,
  TextCard
} from "./types.ts";

export function nowIso(): string {
  return new Date().toISOString();
}

export function createId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}_${random}`;
}

export function createInitialState(): GuacamoleState {
  const createdAt = nowIso();
  const sceneId = createId("scene");
  const template = createStarterTemplate(createdAt);
  const character = createCharacterSheet(template, "Nova personagem", createdAt);

  return {
    version: 1,
    updatedAt: createdAt,
    activeSceneId: sceneId,
    activeCharacterId: character.id,
    activeTemplateId: template.id,
    scenes: [
      {
        id: sceneId,
        title: "Primeira cena",
        createdAt,
        updatedAt: createdAt,
        cards: [
          createTextCard("Premissa", "O que esta em jogo agora?", "green"),
          createTextCard("Lugar", "Onde a cena acontece? O que chama atencao?", "blue"),
          createTextCard("Tensao", "Qual escolha dificil esta prestes a aparecer?", "amber")
        ]
      }
    ],
    templates: [template],
    characters: [character],
    chat: [],
    safety: {
      lines: [],
      veils: [],
      highlights: []
    }
  };
}

export function createTextCard(
  title = "Novo card",
  body = "",
  color: TextCard["color"] = "white"
): TextCard {
  const createdAt = nowIso();
  return {
    id: createId("card"),
    title,
    body,
    color,
    createdAt,
    updatedAt: createdAt
  };
}

export function createCharacterTemplate(name = "Novo modelo"): CharacterTemplate {
  const createdAt = nowIso();
  return {
    id: createId("template"),
    name,
    createdAt,
    updatedAt: createdAt,
    sections: [createSection("Identidade")]
  };
}

export function createSection(title = "Nova secao"): SheetSection {
  return {
    id: createId("section"),
    title,
    collapsed: false,
    advancedCharacterEditing: false,
    fields: []
  };
}

export function createField(type: FieldType): SheetField {
  const id = createId("field");
  switch (type) {
    case "textarea":
      return { id, type, label: "Texto longo", value: "", characterEditable: true };
    case "counter":
      return { id, type, label: "Contador", value: 0, min: 0, max: 10, characterEditable: true };
    case "slider":
      return { id, type, label: "Slider", value: 0, min: 0, max: 6, step: 1, characterEditable: true };
    case "checkbox":
      return { id, type, label: "Caixa", checked: false, characterEditable: true };
    case "checkboxTrack":
      return { id, type, label: "Faixa", value: 0, boxes: 5, characterEditable: true };
    case "combo":
      return {
        id,
        type,
        label: "Combo",
        value: "Opcao 1",
        options: ["Opcao 1", "Opcao 2"],
        characterEditable: true
      };
    case "clock":
      return { id, type, label: "Relogio", value: 0, segments: 6, characterEditable: true };
    case "text":
    default:
      return { id, type: "text", label: "Texto", value: "", characterEditable: true };
  }
}

export function createCharacterSheet(
  template: CharacterTemplate,
  name = "Nova personagem",
  createdAt = nowIso()
): CharacterSheet {
  return {
    id: createId("character"),
    name,
    templateId: template.id,
    values: createCharacterValues(template),
    sectionOverrides: {},
    createdAt,
    updatedAt: createdAt
  };
}

export function createScene(title = "Nova cena"): Scene {
  const createdAt = nowIso();
  return {
    id: createId("scene"),
    title,
    createdAt,
    updatedAt: createdAt,
    cards: [createTextCard()]
  };
}

export function createChatMessage(
  author: string,
  content: string,
  safetyAction?: SafetyAction
): ChatMessage {
  const roll = safetyAction ? null : rollDiceCommand(content);
  return {
    id: createId("chat"),
    author: author.trim() || "Pessoa sem nome",
    content,
    createdAt: nowIso(),
    kind: safetyAction ? "safety" : roll ? "roll" : "text",
    ...(roll ? { roll } : {}),
    ...(safetyAction ? { safetyAction } : {})
  };
}

export function withChatMessage(state: GuacamoleState, message: ChatMessage): GuacamoleState {
  return {
    ...state,
    updatedAt: nowIso(),
    chat: [...state.chat, message].slice(-250)
  };
}

export function createCharacterValues(
  template: CharacterTemplate
): Record<string, CharacterFieldValue> {
  const values: Record<string, CharacterFieldValue> = {};
  for (const field of template.sections.flatMap((section) => section.fields)) {
    values[field.id] = fieldDefaultValue(field);
  }
  return values;
}

export function fieldDefaultValue(field: SheetField): CharacterFieldValue {
  switch (field.type) {
    case "checkbox":
      return field.checked;
    case "counter":
    case "slider":
    case "checkboxTrack":
    case "clock":
      return field.value;
    case "text":
    case "textarea":
    case "combo":
      return field.value;
  }
}

export function coerceFieldValue(field: SheetField, value: unknown): CharacterFieldValue {
  switch (field.type) {
    case "checkbox":
      return typeof value === "boolean" ? value : field.checked;
    case "counter":
      return clampNumber(numberOr(value, field.value), field.min, field.max);
    case "slider":
      return clampNumber(numberOr(value, field.value), field.min, field.max);
    case "checkboxTrack":
      return Math.round(clampNumber(numberOr(value, field.value), 0, field.boxes));
    case "clock":
      return Math.round(clampNumber(numberOr(value, field.value), 0, field.segments));
    case "combo": {
      const stringValue = typeof value === "string" ? value : field.value;
      return field.options.includes(stringValue) ? stringValue : field.value;
    }
    case "text":
    case "textarea":
      return typeof value === "string" ? value : field.value;
  }
}

export function normalizeState(value: unknown): GuacamoleState {
  const fallback = createInitialState();
  if (!isRecord(value)) return fallback;

  const scenes = normalizeArray(value.scenes, normalizeScene);
  let templates = normalizeArray(value.templates, normalizeTemplate);
  let characters: CharacterSheet[] = [];

  if (templates.length) {
    characters = normalizeArray(value.characters, (item) => normalizeCharacter(item, templates));
  } else {
    const legacy = normalizeLegacyCharacters(value.characters);
    templates = legacy.templates;
    characters = legacy.characters;
  }

  const chat = normalizeArray(value.chat, normalizeChatMessage).slice(-250);
  const safety = isRecord(value.safety)
    ? {
      lines: normalizeStringArray(value.safety.lines),
      veils: normalizeStringArray(value.safety.veils),
      highlights: normalizeStringArray(value.safety.highlights)
    }
    : fallback.safety;

  const normalizedScenes = scenes.length ? scenes : fallback.scenes;
  const normalizedTemplates = templates.length ? templates : fallback.templates;
  const normalizedCharacters = characters.length
    ? characters
    : [createCharacterSheet(normalizedTemplates[0])];
  const activeSceneId = typeof value.activeSceneId === "string" &&
      normalizedScenes.some((scene) => scene.id === value.activeSceneId)
    ? value.activeSceneId
    : normalizedScenes[0].id;
  const activeCharacterId = typeof value.activeCharacterId === "string" &&
      normalizedCharacters.some((character) => character.id === value.activeCharacterId)
    ? value.activeCharacterId
    : normalizedCharacters[0].id;
  const activeCharacter = normalizedCharacters.find((character) => character.id === activeCharacterId);
  const activeTemplateId = typeof value.activeTemplateId === "string" &&
      normalizedTemplates.some((template) => template.id === value.activeTemplateId)
    ? value.activeTemplateId
    : activeCharacter?.templateId ?? normalizedTemplates[0].id;

  return {
    version: 1,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : nowIso(),
    activeSceneId,
    activeCharacterId,
    activeTemplateId,
    scenes: normalizedScenes,
    templates: normalizedTemplates,
    characters: normalizedCharacters,
    chat,
    safety
  };
}

function createStarterTemplate(createdAt: string): CharacterTemplate {
  return {
    id: createId("template"),
    name: "Modelo basico",
    createdAt,
    updatedAt: createdAt,
    sections: [
      {
        id: createId("section"),
        title: "Identidade",
        collapsed: false,
        advancedCharacterEditing: false,
        fields: [
          { id: createId("field"), type: "text", label: "Conceito", value: "", characterEditable: true },
          { id: createId("field"), type: "textarea", label: "Impulso", value: "", characterEditable: true },
          {
            id: createId("field"),
            type: "combo",
            label: "Tom",
            value: "Esperancoso",
            options: ["Esperancoso", "Sombrio", "Estranho", "Intimo"],
            characterEditable: true
          }
        ]
      },
      {
        id: createId("section"),
        title: "Recursos",
        collapsed: false,
        advancedCharacterEditing: false,
        fields: [
          {
            id: createId("field"),
            type: "counter",
            label: "Folego",
            value: 3,
            min: 0,
            max: 6,
            characterEditable: true
          },
          {
            id: createId("field"),
            type: "slider",
            label: "Risco",
            value: 1,
            min: 0,
            max: 5,
            step: 1,
            characterEditable: true
          },
          {
            id: createId("field"),
            type: "checkboxTrack",
            label: "Marcas",
            value: 0,
            boxes: 4,
            characterEditable: true
          },
          {
            id: createId("field"),
            type: "clock",
            label: "Projeto",
            value: 1,
            segments: 6,
            characterEditable: true
          }
        ]
      }
    ]
  };
}

function normalizeScene(value: unknown): Scene | null {
  if (!isRecord(value)) return null;
  const createdAt = stringOr(value.createdAt, nowIso());
  return {
    id: stringOr(value.id, createId("scene")),
    title: stringOr(value.title, "Cena sem titulo"),
    createdAt,
    updatedAt: stringOr(value.updatedAt, createdAt),
    cards: normalizeArray(value.cards, normalizeTextCard)
  };
}

function normalizeTextCard(value: unknown): TextCard | null {
  if (!isRecord(value)) return null;
  const createdAt = stringOr(value.createdAt, nowIso());
  const color = ["white", "green", "blue", "amber", "rose"].includes(String(value.color))
    ? value.color as TextCard["color"]
    : "white";
  return {
    id: stringOr(value.id, createId("card")),
    title: stringOr(value.title, "Card sem titulo"),
    body: stringOr(value.body, ""),
    color,
    createdAt,
    updatedAt: stringOr(value.updatedAt, createdAt)
  };
}

function normalizeTemplate(value: unknown): CharacterTemplate | null {
  if (!isRecord(value)) return null;
  const createdAt = stringOr(value.createdAt, nowIso());
  return {
    id: stringOr(value.id, createId("template")),
    name: stringOr(value.name, "Modelo sem nome"),
    createdAt,
    updatedAt: stringOr(value.updatedAt, createdAt),
    sections: normalizeArray(value.sections, normalizeSection)
  };
}

function normalizeCharacter(value: unknown, templates: CharacterTemplate[]): CharacterSheet | null {
  if (!isRecord(value) || !templates.length) return null;
  const createdAt = stringOr(value.createdAt, nowIso());
  const fallbackTemplate = templates[0];
  const templateId = typeof value.templateId === "string" &&
      templates.some((template) => template.id === value.templateId)
    ? value.templateId
    : fallbackTemplate.id;
  const template = templates.find((item) => item.id === templateId) ?? fallbackTemplate;
  const sectionOverrides = normalizeSectionOverrides(value.sectionOverrides, template);

  return {
    id: stringOr(value.id, createId("character")),
    name: stringOr(value.name, "Personagem sem nome"),
    templateId,
    values: normalizeCharacterValues(value.values, template, sectionOverrides),
    sectionOverrides,
    createdAt,
    updatedAt: stringOr(value.updatedAt, createdAt)
  };
}

function normalizeLegacyCharacters(value: unknown): {
  templates: CharacterTemplate[];
  characters: CharacterSheet[];
} {
  if (!Array.isArray(value)) return { templates: [], characters: [] };

  const templates: CharacterTemplate[] = [];
  const characters: CharacterSheet[] = [];

  for (const item of value) {
    if (!isRecord(item)) continue;
    const createdAt = stringOr(item.createdAt, nowIso());
    const updatedAt = stringOr(item.updatedAt, createdAt);
    const name = stringOr(item.name, "Personagem sem nome");
    const template: CharacterTemplate = {
      id: createId("template"),
      name: `${name} modelo`,
      createdAt,
      updatedAt,
      sections: normalizeArray(item.sections, normalizeSection)
    };
    templates.push(template);
    characters.push({
      id: stringOr(item.id, createId("character")),
      name,
      templateId: template.id,
      values: createCharacterValues(template),
      sectionOverrides: {},
      createdAt,
      updatedAt
    });
  }

  return { templates, characters };
}

function normalizeCharacterValues(
  value: unknown,
  template: CharacterTemplate,
  sectionOverrides: Record<string, SheetSection> = {}
): Record<string, CharacterFieldValue> {
  const raw = isRecord(value) ? value : {};
  const normalized: Record<string, CharacterFieldValue> = {};
  for (const field of effectiveSections(template, sectionOverrides).flatMap((section) => section.fields)) {
    normalized[field.id] = coerceFieldValue(field, raw[field.id]);
  }
  return normalized;
}

function normalizeSectionOverrides(
  value: unknown,
  template: CharacterTemplate
): Record<string, SheetSection> {
  if (!isRecord(value)) return {};

  const overrides: Record<string, SheetSection> = {};
  for (const templateSection of template.sections) {
    const override = normalizeSection(value[templateSection.id]);
    if (override) {
      overrides[templateSection.id] = { ...override, id: templateSection.id };
    }
  }
  return overrides;
}

function effectiveSections(
  template: CharacterTemplate,
  sectionOverrides: Record<string, SheetSection>
): SheetSection[] {
  return template.sections.map((section) =>
    section.advancedCharacterEditing && sectionOverrides[section.id]
      ? sectionOverrides[section.id]
      : section
  );
}

function normalizeSection(value: unknown): SheetSection | null {
  if (!isRecord(value)) return null;
  return {
    id: stringOr(value.id, createId("section")),
    title: stringOr(value.title, "Secao sem titulo"),
    collapsed: Boolean(value.collapsed),
    advancedCharacterEditing: Boolean(value.advancedCharacterEditing),
    fields: normalizeArray(value.fields, normalizeField)
  };
}

function normalizeField(value: unknown): SheetField | null {
  if (!isRecord(value)) return null;
  const id = stringOr(value.id, createId("field"));
  const label = stringOr(value.label, "Campo");
  const characterEditable = value.characterEditable !== false;

  switch (value.type) {
    case "textarea":
      return { id, label, type: "textarea", value: stringOr(value.value, ""), characterEditable };
    case "counter": {
      const min = numberOr(value.min, 0);
      const max = Math.max(min, numberOr(value.max, 10));
      return {
        id,
        label,
        type: "counter",
        value: clampNumber(numberOr(value.value, min), min, max),
        min,
        max,
        characterEditable
      } satisfies CounterField;
    }
    case "slider": {
      const min = numberOr(value.min, 0);
      const max = Math.max(min, numberOr(value.max, 10));
      return {
        id,
        label,
        type: "slider",
        value: clampNumber(numberOr(value.value, min), min, max),
        min,
        max,
        step: Math.max(0.01, numberOr(value.step, 1)),
        characterEditable
      } satisfies SliderField;
    }
    case "checkbox":
      return { id, label, type: "checkbox", checked: Boolean(value.checked), characterEditable };
    case "checkboxTrack": {
      const boxes = Math.max(1, Math.round(numberOr(value.boxes, 5)));
      return {
        id,
        label,
        type: "checkboxTrack",
        value: Math.round(clampNumber(numberOr(value.value, 0), 0, boxes)),
        boxes,
        characterEditable
      };
    }
    case "combo": {
      const options = normalizeStringArray(value.options);
      const normalizedOptions = options.length ? options : ["Opcao 1"];
      const candidate = stringOr(value.value, normalizedOptions[0]);
      return {
        id,
        label,
        type: "combo",
        value: normalizedOptions.includes(candidate) ? candidate : normalizedOptions[0],
        options: normalizedOptions,
        characterEditable
      } satisfies ComboField;
    }
    case "clock": {
      const segments = Math.max(2, Math.round(numberOr(value.segments, 6)));
      return {
        id,
        label,
        type: "clock",
        value: Math.round(clampNumber(numberOr(value.value, 0), 0, segments)),
        segments,
        characterEditable
      } satisfies ClockField;
    }
    case "text":
    default:
      return { id, label, type: "text", value: stringOr(value.value, ""), characterEditable };
  }
}

function normalizeChatMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) return null;
  const kind = value.kind === "roll" || value.kind === "safety" ? value.kind : "text";
  const safetyAction =
    value.safetyAction === "stop" ||
      value.safetyAction === "pause" ||
      value.safetyAction === "rewind" ||
      value.safetyAction === "forward"
      ? value.safetyAction
      : undefined;
  const roll = isRecord(value.roll)
    ? {
      expression: stringOr(value.roll.expression, ""),
      total: numberOr(value.roll.total, 0),
      rolls: Array.isArray(value.roll.rolls)
        ? value.roll.rolls.filter((roll): roll is number => typeof roll === "number")
        : [],
      sides: numberOr(value.roll.sides, 0),
      modifier: numberOr(value.roll.modifier, 0)
    }
    : undefined;
  return {
    id: stringOr(value.id, createId("chat")),
    author: stringOr(value.author, "Pessoa sem nome"),
    kind,
    content: stringOr(value.content, ""),
    createdAt: stringOr(value.createdAt, nowIso()),
    ...(roll && kind === "roll" ? { roll } : {}),
    ...(safetyAction ? { safetyAction } : {})
  };
}

function normalizeArray<T>(value: unknown, normalizer: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizer).filter((item): item is T => item !== null);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
