import {
  type ChatEntry,
  type ClientMessage,
  type Player,
  parseClientMessage,
  ProtocolError,
  type RoomAccess,
  type ServerMessage,
} from "../core/protocol.ts";
import { defaultRng, type Rng } from "../core/rng.ts";
import { BUILT_IN_TEMPLATES } from "../core/sheet/templates/mod.ts";
import {
  canEnter,
  createRoomRecord,
  handleClientMessage,
  normalizedPlayerName,
  normalizedRoomName,
  type RoomRecord,
  roomSummary,
  systemEntry,
  uniqueName,
  WELCOME_HISTORY,
} from "./room.ts";
import { loadRooms, saveRooms } from "./store.ts";

export interface ServerOptions {
  port?: number;
  hostname?: string;
  /** Arquivo JSON das mesas. `null` mantém tudo só em memória (testes). */
  dataFile?: string | null;
  rng?: Rng;
}

export interface RunningServer {
  port: number;
  shutdown(): Promise<void>;
}

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const rng = options.rng ?? defaultRng;
  const dataFile = options.dataFile ?? null;
  const rooms = new Map<string, RoomRecord>();
  const connections = new Map<string, Map<WebSocket, Player>>();

  if (dataFile) for (const room of await loadRooms(dataFile)) rooms.set(room.id, room);

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let saving: Promise<void> = Promise.resolve();
  const scheduleSave = () => {
    if (!dataFile || saveTimer !== undefined) return;
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      saving = saving.then(() => saveRooms(dataFile, rooms.values())).catch((error) =>
        console.warn("Falha ao salvar as mesas:", error)
      );
    }, 500);
  };

  const playersOf = (roomId: string): Player[] =>
    [...(connections.get(roomId)?.values() ?? [])].sort((a, b) =>
      a.connectedAt.localeCompare(b.connectedAt)
    );

  const summaryOf = (room: RoomRecord) => roomSummary(room, playersOf(room.id).length);

  const send = (socket: WebSocket, message: ServerMessage) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  const broadcast = (roomId: string, message: ServerMessage) => {
    for (const socket of connections.get(roomId)?.keys() ?? []) send(socket, message);
  };

  const broadcastEntry = (room: RoomRecord, entry: ChatEntry) => {
    broadcast(room.id, { type: "chat:entry", entry });
    scheduleSave();
  };

  const roomFor = (id: string | null): RoomRecord | undefined =>
    id ? rooms.get(id.trim().toUpperCase()) : undefined;

  function createRoom(body: Record<string, unknown>): Response {
    let id = "";
    do {
      id = [...crypto.getRandomValues(new Uint8Array(6))]
        .map((byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length])
        .join("");
    } while (rooms.has(id));
    const access: RoomAccess = body.access === "restricted" ? "restricted" : "open";
    const room = createRoomRecord(
      id,
      normalizedRoomName(body.name),
      normalizedPlayerName(body.hostName),
      access,
    );
    rooms.set(id, room);
    scheduleSave();
    return json({ room: summaryOf(room), hostToken: room.hostToken, role: "host" }, 201);
  }

  function updateRoom(room: RoomRecord, request: Request, body: Record<string, unknown>): Response {
    if (request.headers.get("x-host-token") !== room.hostToken) {
      return json({ message: "Apenas o anfitrião pode alterar a mesa." }, 403);
    }
    if (typeof body.name === "string") room.name = normalizedRoomName(body.name);
    if (body.access === "open" || body.access === "restricted") room.access = body.access;
    if (Array.isArray(body.allowedNames)) {
      room.allowedNames = [
        ...new Set(
          body.allowedNames.filter((n: unknown): n is string => typeof n === "string")
            .map(normalizedPlayerName),
        ),
      ].slice(0, 100);
    }
    scheduleSave();
    broadcast(room.id, { type: "room:sync", room: summaryOf(room) });
    return json(summaryOf(room));
  }

  function upgrade(request: Request, url: URL): Response {
    const room = roomFor(url.searchParams.get("room"));
    if (!room) return json({ message: "Mesa não encontrada." }, 404);
    const token = url.searchParams.get("token");
    const requested = normalizedPlayerName(url.searchParams.get("name"));
    if (!canEnter(room, requested, token)) return json({ message: "Entrada não autorizada." }, 403);
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ message: "Upgrade websocket esperado." }, 426);
    }

    const { socket, response } = Deno.upgradeWebSocket(request);
    const roomConnections = connections.get(room.id) ?? new Map<WebSocket, Player>();
    connections.set(room.id, roomConnections);
    const player: Player = {
      id: crypto.randomUUID(),
      name: uniqueName(requested, [...roomConnections.values()].map((p) => p.name)),
      role: token !== null && token === room.hostToken ? "host" : "player",
      connectedAt: new Date().toISOString(),
    };
    roomConnections.set(socket, player);

    socket.onopen = () => {
      send(socket, {
        type: "welcome",
        you: player,
        room: summaryOf(room),
        players: playersOf(room.id),
        history: room.history.slice(-WELCOME_HISTORY),
        templates: [...BUILT_IN_TEMPLATES],
        characters: room.characters,
      });
      broadcast(room.id, { type: "presence:sync", players: playersOf(room.id) });
      broadcastEntry(room, systemEntry(room, `${player.name} entrou na mesa.`));
    };

    socket.onmessage = (event) => {
      let message: ClientMessage;
      try {
        message = parseClientMessage(String(event.data));
      } catch (error) {
        const text = error instanceof ProtocolError ? error.message : "Mensagem inválida.";
        send(socket, { type: "error", message: text });
        return;
      }
      const outcome = handleClientMessage(room, player, message, rng);
      if ("error" in outcome) {
        send(socket, { type: "error", message: outcome.error });
        return;
      }
      if (outcome.character) {
        broadcast(room.id, { type: "sheet:sync", character: outcome.character });
        scheduleSave();
      }
      if (outcome.removed) {
        broadcast(room.id, { type: "sheet:removed", characterId: outcome.removed });
        scheduleSave();
      }
      if (outcome.entry) broadcastEntry(room, outcome.entry);
    };

    let closed = false;
    const onClose = () => {
      if (closed) return;
      closed = true;
      roomConnections.delete(socket);
      broadcast(room.id, { type: "presence:sync", players: playersOf(room.id) });
      broadcastEntry(room, systemEntry(room, `${player.name} saiu da mesa.`));
    };
    socket.onclose = onClose;
    socket.onerror = onClose;
    return response;
  }

  const server = Deno.serve(
    { hostname: options.hostname ?? "0.0.0.0", port: options.port ?? 8000, onListen: () => {} },
    async (request) => {
      const url = new URL(request.url);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
      if (url.pathname === "/ws") return upgrade(request, url);

      if (url.pathname === "/api/rooms" && request.method === "POST") {
        return createRoom(await readBody(request));
      }

      const match = url.pathname.match(/^\/api\/rooms\/([^/]+)$/);
      if (match) {
        const room = roomFor(decodeURIComponent(match[1]));
        if (!room) return json({ message: "Mesa não encontrada." }, 404);
        if (request.method === "GET") return json(summaryOf(room));
        if (request.method === "PATCH") return updateRoom(room, request, await readBody(request));
        if (request.method === "POST") {
          const body = await readBody(request);
          const name = normalizedPlayerName(body.name);
          const token = typeof body.token === "string" ? body.token : null;
          if (!canEnter(room, name, token)) return json({ message: "Mesa fechada para esse nome." }, 403);
          return json({ room: summaryOf(room), role: token === room.hostToken ? "host" : "player" });
        }
      }
      return json({ message: "Não encontrado." }, 404);
    },
  );

  return {
    port: server.addr.port,
    async shutdown() {
      if (saveTimer !== undefined) clearTimeout(saveTimer);
      for (const sockets of connections.values()) for (const s of sockets.keys()) s.close();
      await server.shutdown();
      await saving;
      if (dataFile) await saveRooms(dataFile, rooms.values());
    },
  };
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null ? body : {};
  } catch {
    return {};
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: cors({ "content-type": "application/json; charset=utf-8" }),
  });
}

function cors(extra: Record<string, string> = {}): Headers {
  return new Headers({
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type,x-host-token",
    ...extra,
  });
}

if (import.meta.main) {
  const port = Number(Deno.env.get("PORT") ?? "8000");
  const server = await startServer({
    port,
    hostname: Deno.env.get("HOST") ?? "0.0.0.0",
    dataFile: new URL("../data/rooms.v2.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  });
  console.log(`Guacamole server em http://localhost:${server.port}`);
}
