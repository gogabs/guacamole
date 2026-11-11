import { runChatInput } from "../core/commands.ts";
import type {
  ChatEntry,
  ChatEntryKind,
  ClientMessage,
  Player,
  RoomAccess,
  RoomSummary,
} from "../core/protocol.ts";
import { defaultRng, type Rng } from "../core/rng.ts";
import { safetyLabel } from "../core/safety.ts";

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

export type MessageOutcome = { entry: ChatEntry } | { error: string };

/** Aplica uma mensagem de um jogador à sala. A rolagem é resolvida aqui, nunca no cliente. */
export function handleClientMessage(
  room: RoomRecord,
  player: Player,
  message: ClientMessage,
  rng: Rng = defaultRng,
): MessageOutcome {
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
