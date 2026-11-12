import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import type { ClientMessage, ServerMessage } from "../core/protocol.ts";
import { startServer } from "./main.ts";

type Of<T extends ServerMessage["type"]> = Extract<ServerMessage, { type: T }>;

class TestClient {
  private queue: ServerMessage[] = [];
  private wake: (() => void) | null = null;

  /** Quadros binários (voz) recebidos. */
  frames: Uint8Array[] = [];

  private constructor(private socket: WebSocket) {
    socket.binaryType = "arraybuffer";
    socket.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) this.frames.push(new Uint8Array(event.data));
      else this.queue.push(JSON.parse(event.data));
      this.wake?.();
    };
  }

  sendBytes(bytes: Uint8Array) {
    this.socket.send(bytes as BufferSource);
  }

  static connect(url: string): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const client = new TestClient(socket);
      socket.onopen = () => resolve(client);
      socket.onerror = () => reject(new Error("conexão recusada"));
    });
  }

  send(message: ClientMessage) {
    this.socket.send(JSON.stringify(message));
  }

  /** Espera a próxima mensagem do tipo dado (e que satisfaça o filtro), consumindo-a. */
  async next<T extends ServerMessage["type"]>(
    type: T,
    filter: (m: Of<T>) => boolean = () => true,
  ): Promise<Of<T>> {
    const deadline = Date.now() + 3000;
    for (;;) {
      const index = this.queue.findIndex((m) => m.type === type && filter(m as Of<T>));
      if (index >= 0) return this.queue.splice(index, 1)[0] as Of<T>;
      if (Date.now() > deadline) throw new Error(`timeout esperando ${type}`);
      await new Promise<void>((resolve) => {
        this.wake = resolve;
        setTimeout(resolve, 50);
      });
    }
  }

  pending(): ServerMessage[] {
    return [...this.queue];
  }

  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    const closed = new Promise<void>((resolve) => (this.socket.onclose = () => resolve()));
    this.socket.close();
    await closed;
  }
}

async function createRoom(base: string, body: Record<string, unknown> = {}) {
  const response = await fetch(`${base}/api/rooms`, {
    method: "POST",
    body: JSON.stringify({ name: "Mesa de teste", hostName: "Ana", ...body }),
  });
  assertEquals(response.status, 201);
  return await response.json() as { room: { id: string }; hostToken: string; role: string };
}

const wsUrl = (port: number, room: string, name: string, token?: string) =>
  `ws://127.0.0.1:${port}/ws?room=${room}&name=${encodeURIComponent(name)}` +
  (token ? `&token=${token}` : "");

Deno.test("dois clientes: chat, rolagem, segurança e erro privado", async () => {
  const server = await startServer({ port: 0, hostname: "127.0.0.1", rng: () => 0.5 });
  const base = `http://127.0.0.1:${server.port}`;
  const created = await createRoom(base);
  const roomId = created.room.id;
  const clients: TestClient[] = [];

  try {
    const ana = await TestClient.connect(wsUrl(server.port, roomId, "Ana", created.hostToken));
    clients.push(ana);
    const anaWelcome = await ana.next("welcome");
    assertEquals([anaWelcome.you.name, anaWelcome.you.role], ["Ana", "host"]);

    const bia = await TestClient.connect(wsUrl(server.port, roomId, "Bia"));
    clients.push(bia);
    const biaWelcome = await bia.next("welcome");
    assertEquals(biaWelcome.you.role, "player");
    assertEquals(biaWelcome.players.length, 2);
    assert(biaWelcome.history.some((e) => e.text === "Ana entrou na mesa."));

    // Ana é avisada da chegada de Bia.
    const presence = await ana.next("presence:sync", (m) => m.players.length === 2);
    assertEquals(presence.players.map((p) => p.name).sort(), ["Ana", "Bia"]);
    await ana.next("chat:entry", (m) => m.entry.text === "Bia entrou na mesa.");

    // Chat: os dois recebem a mesma entrada.
    bia.send({ type: "chat:send", input: "olá, pessoal" });
    const forAna = await ana.next("chat:entry", (m) => m.entry.kind === "text");
    const forBia = await bia.next("chat:entry", (m) => m.entry.kind === "text");
    assertEquals(forAna.entry, forBia.entry);
    assertEquals([forAna.entry.author, forAna.entry.text], ["Bia", "olá, pessoal"]);

    // Rolagem: resolvida no servidor (rng fixo 0.5 => d6 = 4).
    ana.send({ type: "chat:send", input: "/roll 1d6+1" });
    const rollAna = await ana.next("chat:entry", (m) => m.entry.kind === "roll");
    const rollBia = await bia.next("chat:entry", (m) => m.entry.kind === "roll");
    assertEquals(rollAna.entry, rollBia.entry);
    assertEquals(rollBia.entry.roll?.kind === "generic" && rollBia.entry.roll.total, 5);
    assert(rollBia.entry.text.includes("Total 5"));

    // Segurança: por comando e por sinal.
    bia.send({ type: "chat:send", input: "/x" });
    const stop = await ana.next("chat:entry", (m) => m.entry.kind === "safety");
    assertEquals([stop.entry.author, stop.entry.action], ["", "stop"]);
    ana.send({ type: "safety:signal", action: "pause" });
    const pause = await bia.next("chat:entry", (m) => m.entry.action === "pause");
    assertEquals(pause.entry.author, "");

    // Erro é privado: só quem errou recebe.
    bia.send({ type: "chat:send", input: "/roll banana" });
    const error = await bia.next("error");
    assert(error.message.includes("Uso"));
    bia.send({ type: "chat:send", input: "depois do erro" });
    await ana.next("chat:entry", (m) => m.entry.text === "depois do erro");
    assertEquals(ana.pending().filter((m) => m.type === "error").length, 0);

    // Mensagem malformada não derruba a conexão.
    (bia as unknown as { socket: WebSocket }).socket.send("{isso nao e json");
    assert((await bia.next("error")).message.length > 0);

    // Nome repetido ganha sufixo.
    const bia2 = await TestClient.connect(wsUrl(server.port, roomId, "Bia"));
    clients.push(bia2);
    assertEquals((await bia2.next("welcome")).you.name, "Bia (2)");

    // Saída é anunciada.
    await bia2.close();
    await ana.next("chat:entry", (m) => m.entry.text === "Bia (2) saiu da mesa.");
  } finally {
    for (const client of clients) await client.close();
    await server.shutdown();
  }
});

Deno.test("mesa restrita e mesa inexistente recusam a conexão", async () => {
  const server = await startServer({ port: 0, hostname: "127.0.0.1" });
  const base = `http://127.0.0.1:${server.port}`;
  try {
    const created = await createRoom(base, { access: "restricted" });
    const id = created.room.id;

    const denied = await fetch(`${base}/api/rooms/${id}`, {
      method: "POST",
      body: JSON.stringify({ name: "Carlos" }),
    });
    assertEquals(denied.status, 403);
    await denied.body?.cancel();

    const allow = await fetch(`${base}/api/rooms/${id}`, {
      method: "PATCH",
      headers: { "x-host-token": created.hostToken },
      body: JSON.stringify({ allowedNames: ["Carlos"] }),
    });
    assertEquals(allow.status, 200);
    await allow.body?.cancel();

    const forged = await fetch(`${base}/api/rooms/${id}`, {
      method: "PATCH",
      headers: { "x-host-token": "falso" },
      body: JSON.stringify({ access: "open" }),
    });
    assertEquals(forged.status, 403);
    await forged.body?.cancel();

    const carlos = await TestClient.connect(wsUrl(server.port, id, "Carlos"));
    await carlos.next("welcome");
    await carlos.close();

    await assertRejects(() => TestClient.connect(wsUrl(server.port, id, "Intruso")));
    await assertRejects(() => TestClient.connect(wsUrl(server.port, "ZZZZZZ", "Ana")));
  } finally {
    await server.shutdown();
  }
});

Deno.test("histórico sobrevive a reinício do servidor", async () => {
  const dir = await Deno.makeTempDir();
  const dataFile = `${dir}/rooms.json`;
  try {
    const first = await startServer({ port: 0, hostname: "127.0.0.1", dataFile });
    const created = await createRoom(`http://127.0.0.1:${first.port}`);
    const ana = await TestClient.connect(wsUrl(first.port, created.room.id, "Ana", created.hostToken));
    await ana.next("welcome");
    ana.send({ type: "chat:send", input: "guarde isto" });
    await ana.next("chat:entry", (m) => m.entry.text === "guarde isto");
    await ana.close();
    await first.shutdown();

    const second = await startServer({ port: 0, hostname: "127.0.0.1", dataFile });
    const again = await TestClient.connect(
      wsUrl(second.port, created.room.id, "Ana", created.hostToken),
    );
    const welcome = await again.next("welcome");
    assert(welcome.history.some((e) => e.text === "guarde isto"));
    assertEquals(welcome.you.role, "host");
    await again.close();
    await second.shutdown();
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

// PNG mínimo válido (1x1), o bastante para o servidor reconhecer o formato.
const PNG_1X1 = Uint8Array.from(atob(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
), (c) => c.charCodeAt(0));

Deno.test("mídia: envio, download, limites e uso em cards", async () => {
  const server = await startServer({ port: 0, hostname: "127.0.0.1" });
  const base = `http://127.0.0.1:${server.port}`;
  try {
    const created = await createRoom(base, { access: "restricted" });
    const id = created.room.id;
    const upload = (bytes: Uint8Array, name = "Ana", token = created.hostToken) =>
      fetch(`${base}/api/rooms/${id}/media?name=${name}&token=${token}&filename=mapa.png`, { method: "POST", body: bytes as BufferSource });

    const denied = await upload(PNG_1X1, "Intruso", "errado");
    assertEquals(denied.status, 403);
    await denied.body?.cancel();

    const text = await upload(new TextEncoder().encode("não é imagem"));
    assertEquals(text.status, 422);
    await text.body?.cancel();

    const ok = await upload(PNG_1X1);
    assertEquals(ok.status, 201);
    const info = await ok.json() as { id: string; kind: string; mime: string };
    assertEquals([info.kind, info.mime, info.id.length], ["image", "image/png", 64]);

    const again = await upload(PNG_1X1);
    assertEquals((await again.json() as { id: string }).id, info.id);

    const download = await fetch(`${base}/api/rooms/${id}/media/${info.id}`);
    assertEquals(download.headers.get("content-type"), "image/png");
    assertEquals(new Uint8Array(await download.arrayBuffer()), PNG_1X1);
    const missing = await fetch(`${base}/api/rooms/${id}/media/${"0".repeat(64)}`);
    assertEquals(missing.status, 404);
    await missing.body?.cancel();

    const ana = await TestClient.connect(wsUrl(server.port, id, "Ana", created.hostToken));
    await ana.next("welcome");
    ana.send({ type: "scene:op", op: { type: "card:add", id: "i", title: "Mapa", text: "Um mapa.", kind: "image", mediaId: "0".repeat(64) } });
    assertEquals((await ana.next("error")).message, "Imagem não encontrada na mesa.");
    ana.send({ type: "scene:op", op: { type: "card:add", id: "i", title: "Mapa", text: "Um mapa.", kind: "image", mediaId: info.id } });
    const sync = await ana.next("scene:sync");
    assertEquals(sync.scene.scenes[0].cards[0].mediaId, info.id);
    await ana.close();
  } finally {
    await server.shutdown();
  }
});

Deno.test("áudio: envio, tocar com relógio do servidor e disparo de efeito", async () => {
  const server = await startServer({ port: 0, hostname: "127.0.0.1" });
  const base = `http://127.0.0.1:${server.port}`;
  try {
    const created = await createRoom(base);
    const id = created.room.id;
    const wav = new Uint8Array(64);
    wav.set(new TextEncoder().encode("RIFF"), 0);
    wav.set(new TextEncoder().encode("WAVE"), 8);
    const sent = await fetch(`${base}/api/rooms/${id}/media?name=Ana&token=${created.hostToken}&filename=trovao.wav`, {
      method: "POST",
      body: wav as BufferSource,
    });
    const info = await sent.json() as { id: string; kind: string };
    assertEquals(info.kind, "audio");

    const ana = await TestClient.connect(wsUrl(server.port, id, "Ana", created.hostToken));
    const welcome = await ana.next("welcome");
    assert(Math.abs(welcome.serverTime - Date.now()) < 5000);
    const bia = await TestClient.connect(wsUrl(server.port, id, "Bia"));
    await bia.next("welcome");

    const add = (cardId: string, mode: string) =>
      ana.send({ type: "scene:op", op: { type: "card:add", id: cardId, title: cardId, text: "", kind: "audio", mediaId: info.id, mode } as never });
    add("fogo", "ambient");
    add("trovao", "effect");
    await bia.next("scene:sync", (m) => m.scene.scenes[0].cards.length === 2);

    bia.send({ type: "scene:op", op: { type: "audio:play", cardId: "fogo" } });
    assertEquals((await bia.next("error")).message, "Só o anfitrião faz isso.");

    ana.send({ type: "scene:op", op: { type: "audio:play", cardId: "fogo" } });
    const playing = await bia.next("scene:sync", (m) => m.scene.scenes[0].cards[0].audio?.playing === true);
    assert(typeof playing.scene.scenes[0].cards[0].audio?.startedAt === "number");

    ana.send({ type: "scene:op", op: { type: "audio:play", cardId: "trovao" } });
    assertEquals((await bia.next("audio:fire")).cardId, "trovao");
    await ana.close();
    await bia.close();
  } finally {
    await server.shutdown();
  }
});

Deno.test("voz: lugares na cena e repasse dos pacotes só aos outros", async () => {
  const server = await startServer({ port: 0, hostname: "127.0.0.1" });
  const base = `http://127.0.0.1:${server.port}`;
  try {
    const created = await createRoom(base);
    const id = created.room.id;
    const ana = await TestClient.connect(wsUrl(server.port, id, "Ana", created.hostToken));
    const welcome = await ana.next("welcome");
    const bia = await TestClient.connect(wsUrl(server.port, id, "Bia"));
    await bia.next("welcome");
    await bia.next("voice:seats", (m) => Object.keys(m.seats).length === 0);

    ana.send({ type: "scene:op", op: { type: "zone:add", id: "mesa", name: "Mesa", description: "", cells: [{ x: 0, y: 0 }] } });
    await bia.next("scene:sync", (m) => m.scene.scenes[0].zones.length === 1);

    bia.send({ type: "voice:seat", zoneId: "nao-existe" });
    assertEquals((await bia.next("error")).message, "Essa zona não existe na cena.");

    bia.send({ type: "voice:seat", zoneId: "mesa" });
    assertEquals((await ana.next("voice:seats", (m) => m.seats.Bia === "mesa")).seats, { Bia: "mesa" });

    const packet = new Uint8Array([1, 2, 3, 4]);
    bia.sendBytes(packet);
    const deadline = Date.now() + 3000;
    while (ana.frames.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    assertEquals(ana.frames.length, 1);
    const frame = ana.frames[0];
    assertEquals(new TextDecoder().decode(frame.slice(1, 1 + frame[0])), "Bia");
    assertEquals([...frame.slice(1 + frame[0])], [1, 2, 3, 4]);
    assertEquals(bia.frames.length, 0);

    bia.sendBytes(new Uint8Array(1000));
    await new Promise((r) => setTimeout(r, 200));
    assertEquals(ana.frames.length, 1);

    await bia.close();
    assertEquals((await ana.next("voice:seats", (m) => m.seats.Bia === undefined)).seats, {});
    await ana.close();
  } finally {
    await server.shutdown();
  }
});

Deno.test("mesa: exportar e importar leva cenas, fichas e compêndios para uma mesa nova", async () => {
  const server = await startServer({ port: 0, hostname: "127.0.0.1" });
  const base = `http://127.0.0.1:${server.port}`;
  try {
    const created = await createRoom(base);
    const id = created.room.id;
    const ana = await TestClient.connect(wsUrl(server.port, id, "Ana", created.hostToken));
    const welcome = await ana.next("welcome");
    ana.send({ type: "sheet:create", templateId: welcome.templates[0].id, name: "Rex" });
    await ana.next("sheet:sync");
    ana.send({ type: "scene:op", op: { type: "zone:add", id: "altar", name: "Altar", description: "", cells: [{ x: 1, y: 1 }] } });
    await ana.next("scene:sync", (m) => m.scene.scenes[0].zones.length === 1);
    ana.send({ type: "chat:send", input: "oi" });
    await ana.next("chat:entry", (m) => m.entry.text === "oi");

    const denied = await fetch(`${base}/api/rooms/${id}/export?token=errado`);
    assertEquals(denied.status, 403);
    await denied.body?.cancel();
    const exported = await (await fetch(`${base}/api/rooms/${id}/export?token=${created.hostToken}`)).json();
    assertEquals(exported.formato, "guacamole-mesa");
    assertEquals(exported.mesa.history, []);
    assert(!JSON.stringify(exported).includes(created.hostToken));
    const withHistory = await (await fetch(`${base}/api/rooms/${id}/export?token=${created.hostToken}&history=1`)).json();
    assert(withHistory.mesa.history.length > 0);

    const bad = await fetch(`${base}/api/rooms/import?name=Bia`, { method: "POST", body: JSON.stringify({ x: 1 }) });
    assertEquals(bad.status, 422);
    await bad.body?.cancel();
    const imported = await (await fetch(`${base}/api/rooms/import?name=Bia`, {
      method: "POST",
      body: JSON.stringify(exported),
    })).json() as { room: { id: string }; hostToken: string; role: string };
    assertEquals(imported.role, "host");
    assert(imported.room.id !== id && imported.hostToken !== created.hostToken);

    const bia = await TestClient.connect(wsUrl(server.port, imported.room.id, "Bia", imported.hostToken));
    const copy = await bia.next("welcome");
    assertEquals(copy.you.role, "host");
    assertEquals(copy.scene.scenes[0].zones.map((z) => z.name), ["Altar"]);
    assertEquals(copy.characters.map((c) => [c.name, c.owner]), [["Rex", "Bia"]]);
    await bia.close();
    await ana.close();

    const info = await (await fetch(`${base}/api/address`)).json() as { addresses: unknown[] };
    assert(Array.isArray(info.addresses));
  } finally {
    await server.shutdown();
  }
});

Deno.test("voz: o ritmo normal de fala passa inteiro pelo relay, sem perder pacotes", async () => {
  const server = await startServer({ port: 0, hostname: "127.0.0.1" });
  const base = `http://127.0.0.1:${server.port}`;
  try {
    const created = await createRoom(base);
    const ana = await TestClient.connect(wsUrl(server.port, created.room.id, "Ana", created.hostToken));
    await ana.next("welcome");
    const bia = await TestClient.connect(wsUrl(server.port, created.room.id, "Bia"));
    await bia.next("welcome");
    // 3 segundos de fala a 50 pacotes por segundo, como o cliente envia.
    const total = 150;
    for (let i = 0; i < total; i++) {
      bia.sendBytes(new Uint8Array([i & 255, 1, 2, 3]));
      await new Promise((r) => setTimeout(r, 20));
    }
    const deadline = Date.now() + 3000;
    while (ana.frames.length < total && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    assertEquals(ana.frames.length, total);
    await bia.close();
    await ana.close();
  } finally {
    await server.shutdown();
  }
});
