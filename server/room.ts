import { runChatInput } from "../core/commands.ts";
import { findCompendium, findCompendiumItem, OracleError, rollOracle } from "../core/compendium/mod.ts";
import { describeRoll, type IronswornRoll } from "../core/dice.ts";
import type {
  ChatEntry,
  ChatEntryKind,
  ClientMessage,
  Player,
  RoomAccess,
  RoomCharacter,
  RoomSummary,
  ServerMessage,
} from "../core/protocol.ts";
import { defaultRng, type Rng } from "../core/rng.ts";
import { safetyLabel } from "../core/safety.ts";
import { applySceneOp, createSceneState, SceneError, type SceneState } from "../core/scene.ts";
import { cleanDescription, createCharacter, importCharacter, SheetError } from "../core/sheet/fields.ts";
import { applySheetOp, burnMomentum, rollFromField } from "../core/sheet/ops.ts";
import { BUILT_IN_TEMPLATES } from "../core/sheet/templates/mod.ts";
import type { MediaInfo } from "./media.ts";

export const MAX_HISTORY = 500;
export const WELCOME_HISTORY = 200;
/** O diário guarda bem mais que o chat: é dele que sai o registro Lonelog da campanha. */
export const MAX_JOURNAL = 20000;

export interface RoomRecord {
  id: string;
  name: string;
  hostName: string;
  hostToken: string;
  access: RoomAccess;
  allowedNames: string[];
  createdAt: string;
  history: ChatEntry[];
  /** Tudo que entrou no histórico (menos rolagens privadas), sem o limite curto do chat. */
  journal: ChatEntry[];
  nextSeq: number;
  characters: RoomCharacter[];
  scene: SceneState;
  /** Arquivos de mídia enviados à mesa; os bytes ficam no MediaStore. */
  media: MediaInfo[];
  /** Ids dos compêndios adicionados à mesa, na ordem em que entraram. */
  compendiums: string[];
  /** Última rolagem de Ironsworn por ficha, para queimar momentum. Só em memória útil. */
  lastRolls: Record<string, { roll: IronswornRoll; private: boolean }>;
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
    journal: [],
    nextSeq: 1,
    characters: [],
    scene: createSceneState(),
    media: [],
    compendiums: [],
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
  room.journal.push(entry);
  if (room.journal.length > MAX_JOURNAL) {
    room.journal.splice(0, room.journal.length - MAX_JOURNAL);
  }
  return entry;
}

export function systemEntry(room: RoomRecord, text: string): ChatEntry {
  return pushEntry(room, { author: "", kind: "system", text });
}

export type MessageOutcome =
  | { error: string }
  | {
    entry?: ChatEntry;
    privateEntry?: ChatEntry;
    character?: RoomCharacter;
    removed?: string;
    scene?: SceneState;
    /** Id do card de áudio (efeito) que o anfitrião disparou. */
    fired?: string;
    /** Lista nova de compêndios da mesa, para todos. */
    compendiums?: string[];
    /** Resposta só para quem pediu. */
    reply?: ServerMessage;
  };

const MAX_CHARACTERS = 50;
const SHEET_ID = /^[A-Za-z0-9-]{1,64}$/;

/** Rolagem privada: só quem rolou a recebe; não entra no histórico nem é salva. */
function rollOutcome(room: RoomRecord, draft: EntryDraft, hidden: boolean): MessageOutcome {
  if (!hidden) return { entry: pushEntry(room, draft) };
  return {
    privateEntry: { id: crypto.randomUUID(), seq: 0, at: new Date().toISOString(), private: true, ...draft },
  };
}

function canEdit(character: RoomCharacter, player: Player): boolean {
  return player.role === "host" || character.owner === player.name;
}

function handleSheetMessage(
  room: RoomRecord,
  player: Player,
  message: Extract<ClientMessage, { type: `sheet:${string}` }>,
  rng: Rng,
  present: readonly string[],
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

    if (message.type === "sheet:import") {
      const data = message.sheet;
      const template = BUILT_IN_TEMPLATES.find((t) => t.id === data.templateId);
      if (!template) return { error: "Esta ficha usa um modelo que a mesa não conhece." };
      if (room.characters.length >= MAX_CHARACTERS) return { error: "Há fichas demais nesta mesa." };
      // O id do arquivo é mantido para que salvar de novo atualize a mesma ficha local.
      const reusable = typeof data.id === "string" && SHEET_ID.test(data.id) &&
        !room.characters.some((c) => c.id === data.id);
      const sheet = importCharacter(template, reusable ? data.id! : crypto.randomUUID(), { ...data });
      const character: RoomCharacter = { ...sheet, owner: player.name };
      room.characters.push(character);
      return { character };
    }

    const character = room.characters.find((c) => c.id === message.characterId);
    if (!character) return { error: "Ficha não encontrada." };

    // Qualquer um pega uma ficha para si (elementos de cenário passam de mão em mão); dar a outra pessoa
    // é do dono ou do anfitrião.
    if (message.type === "sheet:assign") {
      const claiming = message.owner === player.name;
      if (!claiming && !canEdit(character, player)) {
        return { error: `Só ${character.owner} ou o anfitrião passam esta ficha para outra pessoa.` };
      }
      if (!claiming && message.owner !== room.hostName && !present.includes(message.owner)) {
        return { error: `${message.owner} não está na mesa.` };
      }
      if (message.owner === character.owner) return { error: `${character.name} já é de ${message.owner}.` };
      const from = character.owner;
      character.owner = message.owner;
      const text = claiming
        ? `${player.name} pegou a ficha ${character.name}, de ${from}.`
        : `${player.name} passou a ficha ${character.name}, de ${from}, para ${message.owner}.`;
      return { character, entry: systemEntry(room, text) };
    }

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

      case "sheet:describe":
        character.description = cleanDescription(message.description);
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
          edge: message.edge,
        });
        const hidden = message.private === true;
        if (roll.kind === "ironsworn") room.lastRolls[character.id] = { roll, private: hidden };
        return rollOutcome(room, { author: character.name, kind: "roll", text: describeRoll(roll), roll }, hidden);
      }

      case "sheet:burn": {
        const last = room.lastRolls[character.id];
        if (!last) return { error: "Não há rolagem de Ironsworn para melhorar." };
        const burned = burnMomentum(template, character, last.roll);
        Object.assign(character, burned.sheet);
        delete room.lastRolls[character.id];
        const draft = { author: character.name, kind: "roll" as const, text: describeRoll(burned.roll), roll: burned.roll };
        return { character, ...rollOutcome(room, draft, last.private) };
      }
    }
  } catch (error) {
    if (error instanceof SheetError) return { error: error.message };
    throw error;
  }
}

function handleCompendiumMessage(
  room: RoomRecord,
  player: Player,
  message: Extract<ClientMessage, { type: `compendium:${string}` }>,
  rng: Rng,
): MessageOutcome {
  const compendium = findCompendium(message.compendiumId);
  if (!compendium) return { error: "Compêndio desconhecido." };
  const added = room.compendiums.includes(compendium.id);

  switch (message.type) {
    case "compendium:add":
      if (added) return { error: `${compendium.name} já está na mesa.` };
      room.compendiums.push(compendium.id);
      return {
        compendiums: room.compendiums,
        entry: systemEntry(room, `${player.name} adicionou o compêndio ${compendium.name} à mesa.`),
      };

    case "compendium:remove":
      if (player.role !== "host") return { error: "Só o anfitrião tira compêndios da mesa." };
      if (!added) return { error: `${compendium.name} não está na mesa.` };
      room.compendiums = room.compendiums.filter((id) => id !== compendium.id);
      return {
        compendiums: room.compendiums,
        entry: systemEntry(room, `${player.name} tirou o compêndio ${compendium.name} da mesa.`),
      };

    case "compendium:get": {
      if (!added) return { error: `Adicione ${compendium.name} à mesa primeiro.` };
      const item = findCompendiumItem(compendium.id, message.itemId);
      if (!item) return { error: "Item de compêndio desconhecido." };
      return { reply: { type: "compendium:item", compendiumId: compendium.id, item } };
    }

    case "compendium:roll": {
      if (!added) return { error: `Adicione ${compendium.name} à mesa primeiro.` };
      const item = findCompendiumItem(compendium.id, message.itemId);
      if (!item || item.kind !== "oracles") return { error: "Este item não tem oráculos." };
      try {
        const text = rollOracle(item, message.target, rng);
        return rollOutcome(room, { author: player.name, kind: "roll", text }, message.private === true);
      } catch (error) {
        if (error instanceof OracleError) return { error: error.message };
        throw error;
      }
    }
  }
}

/** Aplica uma mensagem de um jogador à sala. A rolagem é resolvida aqui, nunca no cliente. */
export function handleClientMessage(
  room: RoomRecord,
  player: Player,
  message: ClientMessage,
  rng: Rng = defaultRng,
  /** Nomes de quem está na mesa agora; as fichas só passam para eles ou para o anfitrião. */
  present: readonly string[] = [],
): MessageOutcome {
  if (message.type === "scene:op") {
    try {
      const previousScene = room.scene.activeId;
      const result = applySceneOp(
        room.scene,
        message.op,
        player.role === "host",
        (id, kind) => room.media.some((m) => m.id === id && m.kind === kind),
        Date.now(),
        rng,
        player.name,
      );
      room.scene = result.state;
      const text = result.message(player.name);
      const entry = text ? systemEntry(room, text) : undefined;
      const active = room.scene.scenes.find((s) => s.id === room.scene.activeId);
      if (entry && active && room.scene.activeId !== previousScene) {
        entry.scene = { name: active.name, description: active.description };
      }
      return {
        // Um efeito disparado não muda a cena: só avisa quem está ouvindo.
        scene: result.fired ? undefined : room.scene,
        fired: result.fired,
        entry,
      };
    } catch (error) {
      if (error instanceof SceneError) return { error: error.message };
      throw error;
    }
  }
  if (message.type.startsWith("compendium:")) {
    return handleCompendiumMessage(
      room,
      player,
      message as Extract<ClientMessage, { type: `compendium:${string}` }>,
      rng,
    );
  }
  if (message.type.startsWith("sheet:")) {
    return handleSheetMessage(
      room,
      player,
      message as Extract<ClientMessage, { type: `sheet:${string}` }>,
      rng,
      present,
    );
  }
  if (message.type === "safety:signal") {
    return {
      entry: pushEntry(room, {
        author: "",
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
          author: "",
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
