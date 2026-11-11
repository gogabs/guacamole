import type { OracleTarget } from "./compendium/oracle.ts";
import type { CompendiumItem, CompendiumSummary } from "./compendium/types.ts";
import type { Roll } from "./dice.ts";
import { SAFETY_ACTIONS, type SafetyAction } from "./safety.ts";
import { SCENE_OP_TYPES, type SceneOp, type SceneState } from "./scene.ts";
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
  /** Rolagem privada: enviada só a quem rolou, fora do histórico da mesa. */
  private?: boolean;
}

/** Ficha vinda de arquivo. `id` é reaproveitado se estiver livre na mesa. */
export interface SheetImport {
  id?: string;
  templateId: string;
  name: string;
  description: string;
  values: Record<string, unknown>;
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
  | { type: "sheet:describe"; characterId: string; description: string }
  /** Passa a ficha para outro participante da mesa. Só o dono ou o anfitrião. */
  | { type: "sheet:assign"; characterId: string; owner: string }
  /** Traz uma ficha de arquivo para a mesa. O servidor valida os valores contra o modelo. */
  | { type: "sheet:import"; sheet: SheetImport }
  | { type: "sheet:op"; characterId: string; op: SheetOp }
  /** Rola a partir de um campo; o resultado entra no histórico da mesa. */
  | {
    type: "sheet:roll";
    characterId: string;
    fieldId: string;
    trackId?: string;
    extra?: number;
    /** Dungeon World: vantagens (positivo) ou desvantagens (negativo) que quem rola declara. */
    edge?: number;
    private?: boolean;
  }
  /** Queima o momentum sobre a última rolagem de Ironsworn desta ficha. */
  | { type: "sheet:burn"; characterId: string }
  | { type: "scene:op"; op: SceneOp }
  /** Qualquer um adiciona um compêndio à mesa; só o anfitrião o tira. */
  | { type: "compendium:add"; compendiumId: string }
  | { type: "compendium:remove"; compendiumId: string }
  /** Pede o conteúdo de um item de um compêndio já adicionado; a resposta vem só para quem pediu. */
  | { type: "compendium:get"; compendiumId: string; itemId: string }
  /** Rola um oráculo; o resultado entra no histórico da mesa (ou só para quem rolou, se privado). */
  | {
    type: "compendium:roll";
    compendiumId: string;
    itemId: string;
    target: OracleTarget;
    private?: boolean;
  };

export type ServerMessage =
  | {
    type: "welcome";
    you: Player;
    room: RoomSummary;
    players: Player[];
    history: ChatEntry[];
    templates: SheetTemplate[];
    characters: RoomCharacter[];
    scene: SceneState;
    /** Compêndios disponíveis no servidor, sem conteúdo. */
    catalog: CompendiumSummary[];
    /** Ids dos compêndios adicionados a esta mesa, na ordem em que entraram. */
    compendiums: string[];
  }
  | { type: "compendium:sync"; compendiums: string[] }
  | { type: "compendium:item"; compendiumId: string; item: CompendiumItem }
  | { type: "chat:entry"; entry: ChatEntry }
  | { type: "sheet:sync"; character: RoomCharacter }
  | { type: "sheet:removed"; characterId: string }
  | { type: "scene:sync"; scene: SceneState }
  | { type: "presence:sync"; players: Player[] }
  | { type: "room:sync"; room: RoomSummary }
  | { type: "error"; message: string };

export class ProtocolError extends Error {}

export const MAX_MESSAGE_BYTES = 65536;

function parseOracleTarget(raw: unknown): OracleTarget | null {
  if (typeof raw !== "object" || raw === null) return null;
  const target = raw as Record<string, unknown>;
  if (target.type === "table" && typeof target.tableId === "string") {
    return { type: "table", tableId: target.tableId.slice(0, 200) };
  }
  if (target.type === "combo" && typeof target.comboId === "string") {
    return { type: "combo", comboId: target.comboId.slice(0, 200) };
  }
  if (target.type === "odds" && typeof target.threshold === "number" && Number.isFinite(target.threshold)) {
    return { type: "odds", threshold: target.threshold };
  }
  return null;
}

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
  if (message.type === "scene:op") {
    const op = message.op as Record<string, unknown> | undefined;
    if (typeof op === "object" && op !== null && SCENE_OP_TYPES.includes(String(op.type))) {
      return { type: "scene:op", op: op as unknown as SceneOp };
    }
    throw new ProtocolError("Operação de cena inválida.");
  }
  const compendiumId = str("compendiumId");
  switch (message.type) {
    case "compendium:add":
    case "compendium:remove":
      if (compendiumId !== null) return { type: message.type, compendiumId };
      break;
    case "compendium:get": {
      const itemId = str("itemId");
      if (compendiumId !== null && itemId !== null) return { type: "compendium:get", compendiumId, itemId };
      break;
    }
    case "compendium:roll": {
      const itemId = str("itemId");
      const target = parseOracleTarget(message.target);
      if (compendiumId !== null && itemId !== null && target !== null) {
        return { type: "compendium:roll", compendiumId, itemId, target, private: message.private === true };
      }
      break;
    }
  }
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
    case "sheet:assign": {
      const owner = str("owner");
      if (characterId !== null && owner !== null) return { type: "sheet:assign", characterId, owner };
      break;
    }
    case "sheet:describe": {
      const description = message.description;
      if (characterId !== null && typeof description === "string" && description.length <= 2000) {
        return { type: "sheet:describe", characterId, description };
      }
      break;
    }
    case "sheet:import": {
      const sheet = message.sheet as Record<string, unknown> | undefined;
      if (typeof sheet === "object" && sheet !== null && typeof sheet.templateId === "string") {
        return {
          type: "sheet:import",
          sheet: {
            id: typeof sheet.id === "string" ? sheet.id : undefined,
            templateId: sheet.templateId,
            name: typeof sheet.name === "string" ? sheet.name : "",
            description: typeof sheet.description === "string" ? sheet.description : "",
            values: typeof sheet.values === "object" && sheet.values !== null
              ? sheet.values as Record<string, unknown>
              : {},
          },
        };
      }
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
      const edge = typeof message.edge === "number" && Number.isFinite(message.edge) ? message.edge : undefined;
      return {
        type: "sheet:roll",
        characterId,
        fieldId,
        trackId,
        extra,
        edge,
        private: message.private === true,
      };
    }
  }
  throw new ProtocolError("Tipo de mensagem desconhecido.");
}
