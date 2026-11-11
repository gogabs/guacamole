import { runChatInput } from "../core/commands.ts";
import { describeRoll, type IronswornRoll } from "../core/dice.ts";
import type {
  ChatEntry,
  ChatEntryKind,
  ClientMessage,
  Player,
  RoomAccess,
  RoomCharacter,
  RoomSummary,
} from "../core/protocol.ts";
import { defaultRng, type Rng } from "../core/rng.ts";
import { safetyLabel } from "../core/safety.ts";
import { createCharacter, SheetError } from "../core/sheet/fields.ts";
import { applySheetOp, burnMomentum, rollFromField } from "../core/sheet/ops.ts";
import { BUILT_IN_TEMPLATES } from "../core/sheet/templates/mod.ts";

export const MAX_HISTORY = 500;
export const WELCOME_HISTORY = 200;

export interface RoomRecord {
  id: string;
  name: string;
  hostName: string;
  hostToken: string;
  access: RoomAccess;
  allowedNames: string[];
  createdAt: string;
  history: ChatEntry[];
  nextSeq: number;
  characters: RoomCharacter[];
  /** Última rolagem de Ironsworn por ficha, para queimar momentum. Só em memória útil. */
  lastRolls: Record<string, IronswornRoll>;
}

export function createRoomRecord(
  id: string,
  name: string,
  hostName: string,
  access: RoomAccess,
): RoomRecord {
  return {
    id,
    name,
    hostName,
    hostToken: crypto.randomUUID(),
    access,
    allowedNames: [],
    createdAt: new Date().toISOString(),
    history: [],
    nextSeq: 1,
    characters: [],
    lastRolls: {},
  };
}

export function roomSummary(room: RoomRecord, playerCount: number): RoomSummary {
  return {
    id: room.id,
    name: room.name,
    hostName: room.hostName,
    access: room.access,
    allowedNames: room.allowedNames,
    createdAt: room.createdAt,
    playerCount,
  };
}

export interface EntryDraft {
  author: string;
  kind: ChatEntryKind;
  text: string;
  roll?: ChatEntry["roll"];
  action?: ChatEntry["action"];
}

export function pushEntry(room: RoomRecord, draft: EntryDraft): ChatEntry {
  const entry: ChatEntry = {
    id: crypto.randomUUID(),
    seq: room.nextSeq++,
    at: new Date().toISOString(),
    ...draft,
  };
  room.history.push(entry);
  if (room.history.length > MAX_HISTORY) {
    room.history.splice(0, room.history.length - MAX_HISTORY);
  }
  return entry;
}

export function systemEntry(room: RoomRecord, text: string): ChatEntry {
  return pushEntry(room, { author: "", kind: "system", text });
}

export type MessageOutcome =
  | { error: string }
  | { entry?: ChatEntry; character?: RoomCharacter; removed?: string };

const MAX_CHARACTERS = 50;

function canEdit(character: RoomCharacter, player: Player): boolean {
  return player.role === "host" || character.owner === player.name;
}

function handleSheetMessage(
  room: RoomRecord,
  player: Player,
  message: Extract<ClientMessage, { type: `sheet:${string}` }>,
  rng: Rng,
): MessageOutcome {
  try {
    if (message.type === "sheet:create") {
      const template = BUILT_IN_TEMPLATES.find((t) => t.id === message.templateId);
      if (!template) return { error: "Modelo de ficha desconhecido." };
      if (room.characters.length >= MAX_CHARACTERS) return { error: "Há fichas demais nesta mesa." };
      const sheet = createCharacter(template, crypto.randomUUID(), message.name || player.name);
      const character: RoomCharacter = { ...sheet, owner: player.name };
      room.characters.push(character);
      return { character };
    }

    const character = room.characters.find((c) => c.id === message.characterId);
    if (!character) return { error: "Ficha não encontrada." };
    if (!canEdit(character, player)) {
      return { error: `Só ${character.owner} ou o anfitrião mexem nesta ficha.` };
    }
    const template = BUILT_IN_TEMPLATES.find((t) => t.id === character.templateId);
    if (!template) return { error: "Modelo de ficha desconhecido." };

    switch (message.type) {
      case "sheet:delete":
        room.characters = room.characters.filter((c) => c !== character);
        delete room.lastRolls[character.id];
        return { removed: character.id };

      case "sheet:rename":
        character.name = message.name.trim().slice(0, 80) || character.name;
        return { character };

      case "sheet:op": {
        const next = applySheetOp(template, character, message.op);
        Object.assign(character, next);
        return { character };
      }

      case "sheet:roll": {
        const roll = rollFromField(template, character, message.fieldId, rng, {
          trackId: message.trackId,
          extra: message.extra,
        });
        if (roll.kind === "ironsworn") room.lastRolls[character.id] = roll;
        return {
          entry: pushEntry(room, {
            author: player.name,
            kind: "roll",
            text: `${character.name}: ${describeRoll(roll)}`,
            roll,
          }),
        };
      }

      case "sheet:burn": {
        const last = room.lastRolls[character.id];
        if (!last) return { error: "Não há rolagem de Ironsworn para melhorar." };
        const burned = burnMomentum(template, character, last);
        Object.assign(character, burned.sheet);
        delete room.lastRolls[character.id];
        return {
          character,
          entry: pushEntry(room, {
            author: player.name,
            kind: "roll",
            text: `${character.name} queimou o momentum. ${describeRoll(burned.roll)}`,
            roll: burned.roll,
          }),
        };
      }
    }
  } catch (error) {
    if (error instanceof SheetError) return { error: error.message };
    throw error;
  }
}

/** Aplica uma mensagem de um jogador à sala. A rolagem é resolvida aqui, nunca no cliente. */
export function handleClientMessage(
  room: RoomRecord,
  player: Player,
  message: ClientMessage,
  rng: Rng = defaultRng,
): MessageOutcome {
  if (message.type.startsWith("sheet:")) {
    return handleSheetMessage(
      room,
      player,
      message as Extract<ClientMessage, { type: `sheet:${string}` }>,
      rng,
    );
  }
  if (message.type === "safety:signal") {
    return {
      entry: pushEntry(room, {
        author: player.name,
        kind: "safety",
        text: safetyLabel(message.action),
        action: message.action,
      }),
    };
  }

  if (message.type !== "chat:send") return { error: "Tipo de mensagem desconhecido." };
  const result = runChatInput(message.input, rng);
  switch (result.type) {
    case "error":
      return { error: result.message };
    case "text":
      return { entry: pushEntry(room, { author: player.name, kind: "text", text: result.content }) };
    case "roll":
      return {
        entry: pushEntry(room, {
          author: player.name,
          kind: "roll",
          text: result.text,
          roll: result.roll,
        }),
      };
    case "safety":
      return {
        entry: pushEntry(room, {
          author: player.name,
          kind: "safety",
          text: result.text,
          action: result.action,
        }),
      };
  }
}

export function normalizedPlayerName(value: unknown): string {
  return (typeof value === "string" ? value : "").trim().slice(0, 40) || "Convidado";
}

export function normalizedRoomName(value: unknown): string {
  return (typeof value === "string" ? value : "").trim().slice(0, 80) || "Mesa sem nome";
}

/** Evita dois jogadores com o mesmo nome, o que confundiria os anúncios por voz. */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const lower = new Set([...taken].map((n) => n.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  for (let n = 2;; n++) {
    const suffix = ` (${n})`;
    const candidate = name.slice(0, 40 - suffix.length) + suffix;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}

export function canEnter(room: RoomRecord, name: string, token: string | null): boolean {
  if (token !== null && token === room.hostToken) return true;
  if (room.access === "open") return true;
  return room.allowedNames.some((allowed) => allowed.toLowerCase() === name.toLowerCase());
}
