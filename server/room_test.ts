import { assertEquals } from "jsr:@std/assert@1";
import type { Player } from "../core/protocol.ts";
import { face, seq } from "../core/test_util.ts";
import {
  canEnter,
  createRoomRecord,
  handleClientMessage,
  MAX_HISTORY,
  pushEntry,
  uniqueName,
} from "./room.ts";

const ana: Player = { id: "p1", name: "Ana", role: "player", connectedAt: "2026-01-01T00:00:00Z" };

Deno.test("texto vira entrada com autor e seq crescente", () => {
  const room = createRoomRecord("ABC234", "Mesa", "Ana", "open");
  const a = handleClientMessage(room, ana, { type: "chat:send", input: "oi" });
  const b = handleClientMessage(room, ana, { type: "chat:send", input: "tudo bem?" });
  if (!("entry" in a) || !("entry" in b)) throw new Error("esperava entradas");
  assertEquals([a.entry.seq, b.entry.seq], [1, 2]);
  assertEquals([a.entry.author, a.entry.kind, a.entry.text], ["Ana", "text", "oi"]);
  assertEquals(room.history.length, 2);
});

Deno.test("rolagem é resolvida no servidor, com o texto acessível", () => {
  const room = createRoomRecord("ABC234", "Mesa", "Ana", "open");
  const out = handleClientMessage(
    room,
    ana,
    { type: "chat:send", input: "/iron +2 Ferro" },
    seq(face(5, 6), face(4, 10), face(9, 10)),
  );
  if (!("entry" in out)) throw new Error("esperava entrada");
  assertEquals(out.entry.kind, "roll");
  assertEquals(out.entry.text, "Ironsworn Ferro. Dado de ação 5 +2 = 7, contra 4 e 9. Acerto parcial.");
  assertEquals(out.entry.roll?.kind, "ironsworn");
});

Deno.test("segurança por comando e por sinal geram o mesmo tipo de entrada", () => {
  const room = createRoomRecord("ABC234", "Mesa", "Ana", "open");
  const byCommand = handleClientMessage(room, ana, { type: "chat:send", input: "/x" });
  const bySignal = handleClientMessage(room, ana, { type: "safety:signal", action: "stop" });
  if (!("entry" in byCommand) || !("entry" in bySignal)) throw new Error("esperava entradas");
  assertEquals(byCommand.entry.kind, "safety");
  assertEquals(byCommand.entry.action, "stop");
  assertEquals(bySignal.entry.text, byCommand.entry.text);
});

Deno.test("comando inválido devolve erro e não entra no histórico", () => {
  const room = createRoomRecord("ABC234", "Mesa", "Ana", "open");
  const out = handleClientMessage(room, ana, { type: "chat:send", input: "/roll banana" });
  assertEquals("error" in out, true);
  assertEquals(room.history.length, 0);
  assertEquals(room.nextSeq, 1);
});

Deno.test("histórico é limitado, mas seq continua crescendo", () => {
  const room = createRoomRecord("ABC234", "Mesa", "Ana", "open");
  for (let i = 0; i < MAX_HISTORY + 10; i++) {
    pushEntry(room, { author: "Ana", kind: "text", text: String(i) });
  }
  assertEquals(room.history.length, MAX_HISTORY);
  assertEquals(room.history[0].seq, 11);
  assertEquals(room.nextSeq, MAX_HISTORY + 11);
});

Deno.test("uniqueName acrescenta sufixo em nomes repetidos", () => {
  assertEquals(uniqueName("Ana", ["Bia"]), "Ana");
  assertEquals(uniqueName("Ana", ["ana"]), "Ana (2)");
  assertEquals(uniqueName("Ana", ["Ana", "Ana (2)"]), "Ana (3)");
});

Deno.test("canEnter: mesa restrita só aceita nomes liberados ou o token do anfitrião", () => {
  const room = createRoomRecord("ABC234", "Mesa", "Host", "restricted");
  room.allowedNames = ["Bia"];
  assertEquals(canEnter(room, "bia", null), true);
  assertEquals(canEnter(room, "Carlos", null), false);
  assertEquals(canEnter(room, "Carlos", "token-errado"), false);
  assertEquals(canEnter(room, "Host", room.hostToken), true);
  assertEquals(canEnter(room, "Host", null), false);
});
