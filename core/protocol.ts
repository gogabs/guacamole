import type { Roll } from "./dice.ts";
import { SAFETY_ACTIONS, type SafetyAction } from "./safety.ts";

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

export type ClientMessage =
  /** Linha digitada. O servidor interpreta comandos (`/roll`, `/x`...). */
  | { type: "chat:send"; input: string }
  | { type: "safety:signal"; action: SafetyAction };

export type ServerMessage =
  | {
    type: "welcome";
    you: Player;
    room: RoomSummary;
    players: Player[];
    history: ChatEntry[];
  }
  | { type: "chat:entry"; entry: ChatEntry }
  | { type: "presence:sync"; players: Player[] }
  | { type: "room:sync"; room: RoomSummary }
  | { type: "error"; message: string };

export class ProtocolError extends Error {}

export const MAX_MESSAGE_BYTES = 8192;

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
  throw new ProtocolError("Tipo de mensagem desconhecido.");
}
