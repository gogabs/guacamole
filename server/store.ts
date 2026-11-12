import { findCompendium } from "../core/compendium/mod.ts";
import type { RoomAccess } from "../core/protocol.ts";
import { normalizeSceneState } from "../core/scene.ts";
import { migrateCharacter } from "../core/sheet/fields.ts";
import { BUILT_IN_TEMPLATES } from "../core/sheet/templates/mod.ts";
import type { MediaInfo } from "./media.ts";
import { normalizedPlayerName, normalizedRoomName, type RoomRecord } from "./room.ts";

const ROOM_ID = /^[A-Z0-9]{6}$/;

export async function loadRooms(file: string): Promise<RoomRecord[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await Deno.readTextFile(file));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return [];
    console.warn("Não foi possível ler as mesas, começando do zero:", error);
    return [];
  }
  const raw = (parsed as { rooms?: unknown })?.rooms;
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeRoom).filter((room): room is RoomRecord => room !== null);
}

/** Grava em arquivo temporário e renomeia, para nunca deixar o JSON pela metade. */
export async function saveRooms(file: string, rooms: Iterable<RoomRecord>): Promise<void> {
  const temp = `${file}.tmp`;
  await Deno.writeTextFile(temp, JSON.stringify({ version: 2, rooms: [...rooms] }));
  await Deno.rename(temp, file);
}

function normalizeCharacter(character: RoomRecord["characters"][number]): RoomRecord["characters"][number] {
  const template = BUILT_IN_TEMPLATES.find((t) => t.id === character.templateId);
  const described = {
    ...character,
    description: typeof character.description === "string" ? character.description : "",
  };
  return template ? { ...migrateCharacter(template, described), owner: character.owner } : described;
}

const TABLE_FORMAT = "guacamole-mesa";

/** A mesa sem segredos (código e token) para virar arquivo; a mídia vai à parte, em bytes. */
export function exportRoom(room: RoomRecord, includeHistory: boolean): Record<string, unknown> {
  return {
    formato: TABLE_FORMAT,
    versao: 1,
    mesa: {
      name: room.name,
      hostName: room.hostName,
      access: room.access,
      allowedNames: room.allowedNames,
      characters: room.characters,
      scene: room.scene,
      compendiums: room.compendiums,
      media: room.media,
      history: includeHistory ? room.history : [],
      nextSeq: includeHistory ? room.nextSeq : 1,
    },
  };
}

/**
 * Uma mesa nova a partir de um arquivo exportado: outro código, outro token e `hostName` como
 * anfitrião. As fichas do anfitrião de antes passam a ser dele; nenhum som volta tocando; a mídia
 * começa vazia, porque os bytes são enviados depois, um a um.
 */
export function importRoom(file: unknown, id: string, hostName: string): RoomRecord | null {
  const raw = (file as { formato?: unknown; mesa?: unknown } | null);
  if (!raw || raw.formato !== TABLE_FORMAT || typeof raw.mesa !== "object" || raw.mesa === null) return null;
  const table = raw.mesa as Record<string, unknown>;
  const room = normalizeRoom({
    ...table,
    id,
    hostName,
    hostToken: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    media: [],
  });
  if (!room) return null;
  const formerHost = typeof table.hostName === "string" ? table.hostName : "";
  room.characters = room.characters.map((c) => c.owner === formerHost ? { ...c, owner: hostName } : c);
  room.scene = {
    ...room.scene,
    scenes: room.scene.scenes.map((s) => ({
      ...s,
      cards: s.cards.map((c) =>
        c.audio?.playing ? { ...c, audio: { ...c.audio, playing: false, startedAt: null } } : c
      ),
    })),
  };
  return room;
}

function normalizeRoom(value: unknown): RoomRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim().toUpperCase() : "";
  if (!ROOM_ID.test(id) || typeof raw.hostToken !== "string") return null;
  const history = Array.isArray(raw.history) ? raw.history : [];
  const access: RoomAccess = raw.access === "restricted" ? "restricted" : "open";
  return {
    id,
    name: normalizedRoomName(raw.name),
    hostName: normalizedPlayerName(raw.hostName),
    hostToken: raw.hostToken,
    access,
    allowedNames: Array.isArray(raw.allowedNames)
      ? raw.allowedNames.filter((n): n is string => typeof n === "string").slice(0, 100)
      : [],
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    history: history as RoomRecord["history"],
    nextSeq: typeof raw.nextSeq === "number" ? raw.nextSeq : history.length + 1,
    characters: Array.isArray(raw.characters)
      ? (raw.characters as RoomRecord["characters"]).map(normalizeCharacter)
      : [],
    scene: normalizeSceneState(raw.scene),
    media: Array.isArray(raw.media)
      ? (raw.media as Array<Record<string, unknown>>).filter((m): m is Record<string, unknown> & MediaInfo =>
        typeof m?.id === "string" && (m.kind === "image" || m.kind === "audio") &&
        typeof m.mime === "string" && typeof m.size === "number" && typeof m.name === "string"
      ).map(({ id, kind, mime, size, name }) => ({ id, kind, mime, size, name }))
      : [],
    compendiums: Array.isArray(raw.compendiums)
      ? raw.compendiums.filter((id): id is string => typeof id === "string" && findCompendium(id) !== undefined)
      : [],
    lastRolls: {},
  };
}
