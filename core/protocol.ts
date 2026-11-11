import type { Roll } from "./dice.ts";
import { SAFETY_ACTIONS, type SafetyAction } from "./safety.ts";
import type { SheetOp } from "./sheet/ops.ts";
import type { CharacterSheet, SheetTemplate } from "./sheet/types.ts";

const SHEET_OP_TYPES = ["field:set", "track:add", "track:remove", "progress:mark"];

export type RoomAccess = "open" | "restricted";
export type Role = "host" | "player";

export interface RoomSummary {
  id: string;
  name: string;
  hostName: string;
  access: RoomAccess;
  allowedNames: string[];
  createdAt: string;
  playerCount: number;
}

export interface Player {
  id: string;
  name: string;
  role: Role;
  connectedAt: string;
}

export type ChatEntryKind = "text" | "roll" | "safety" | "system";

/**
 * Tudo que o app anuncia vira uma entrada. `text` é o conteúdo legível; clientes
 * anunciam `${author}: ${text}` (ou só `text` para mensagens do sistema).
 */
export interface ChatEntry {
  id: string;
  /** Cresce de 1 em 1 por sala; permite detectar mensagens perdidas. */
  seq: number;
  /** Vazio em mensagens do sistema. */
  author: string;
  at: string;
  kind: ChatEntryKind;
  text: string;
  roll?: Roll;
  action?: SafetyAction;
}

/** Ficha numa mesa. Só quem criou (ou o anfitrião) a edita; todos a veem. */
export interface RoomCharacter extends CharacterSheet {
  owner: string;
}

export type ClientMessage =
  /** Linha digitada. O servidor interpreta comandos (`/roll`, `/x`...). */
  | { type: "chat:send"; input: string }
  | { type: "safety:signal"; action: SafetyAction }
  | { type: "sheet:create"; templateId: string; name: string }
  | { type: "sheet:delete"; characterId: string }
  | { type: "sheet:rename"; characterId: string; name: string }
  | { type: "sheet:op"; characterId: string; op: SheetOp }
  /** Rola a partir de um campo; o resultado entra no histórico da mesa. */
  | { type: "sheet:roll"; characterId: string; fieldId: string; trackId?: string; extra?: number }
  /** Queima o momentum sobre a última rolagem de Ironsworn desta ficha. */
  | { type: "sheet:burn"; characterId: string };

export type ServerMessage =
  | {
    type: "welcome";
    you: Player;
    room: RoomSummary;
    players: Player[];
    history: ChatEntry[];
    templates: SheetTemplate[];
    characters: RoomCharacter[];
  }
  | { type: "chat:entry"; entry: ChatEntry }
  | { type: "sheet:sync"; character: RoomCharacter }
  | { type: "sheet:removed"; characterId: string }
  | { type: "presence:sync"; players: Player[] }
  | { type: "room:sync"; room: RoomSummary }
  | { type: "error"; message: string };

export class ProtocolError extends Error {}

export const MAX_MESSAGE_BYTES = 16384;

export function parseClientMessage(data: string): ClientMessage {
  if (data.length > MAX_MESSAGE_BYTES) throw new ProtocolError("Mensagem grande demais.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new ProtocolError("Mensagem não é JSON válido.");
  }
  if (typeof parsed !== "object" || parsed === null) throw new ProtocolError("Mensagem inválida.");
  const message = parsed as Record<string, unknown>;

  if (message.type === "chat:send" && typeof message.input === "string") {
    return { type: "chat:send", input: message.input };
  }
  if (
    message.type === "safety:signal" &&
    typeof message.action === "string" &&
    (SAFETY_ACTIONS as readonly string[]).includes(message.action)
  ) {
    return { type: "safety:signal", action: message.action as SafetyAction };
  }

  const str = (key: string): string | null => {
    const value = message[key];
    return typeof value === "string" && value.length <= 200 ? value : null;
  };
  const characterId = str("characterId");
  switch (message.type) {
    case "sheet:create": {
      const templateId = str("templateId");
      const name = str("name");
      if (templateId !== null && name !== null) return { type: "sheet:create", templateId, name };
      break;
    }
    case "sheet:delete":
      if (characterId !== null) return { type: "sheet:delete", characterId };
      break;
    case "sheet:rename": {
      const name = str("name");
      if (characterId !== null && name !== null) return { type: "sheet:rename", characterId, name };
      break;
    }
    case "sheet:burn":
      if (characterId !== null) return { type: "sheet:burn", characterId };
      break;
    case "sheet:op": {
      const op = message.op as Record<string, unknown> | undefined;
      if (characterId !== null && typeof op === "object" && op !== null && SHEET_OP_TYPES.includes(String(op.type))) {
        return { type: "sheet:op", characterId, op: op as unknown as SheetOp };
      }
      break;
    }
    case "sheet:roll": {
      const fieldId = str("fieldId");
      if (characterId === null || fieldId === null) break;
      const trackId = typeof message.trackId === "string" ? message.trackId : undefined;
      const extra = typeof message.extra === "number" && Number.isFinite(message.extra)
        ? message.extra
        : undefined;
      return { type: "sheet:roll", characterId, fieldId, trackId, extra };
    }
  }
  throw new ProtocolError("Tipo de mensagem desconhecido.");
}
