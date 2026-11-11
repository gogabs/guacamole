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

Deno.test("compêndios: qualquer um adiciona, só o anfitrião tira, e o conteúdo só vem se estiver na mesa", () => {
  const room = createRoomRecord("ABC234", "Mesa", "Hugo", "open");
  const early = handleClientMessage(room, ana, { type: "compendium:get", compendiumId: "ironsworn", itemId: "moves" });
  assertEquals("error" in early, true);

  const added = handleClientMessage(room, ana, { type: "compendium:add", compendiumId: "ironsworn" });
  if ("error" in added) throw new Error(added.error);
  assertEquals(added.compendiums, ["ironsworn"]);
  assertEquals(added.entry?.text, "Ana adicionou o compêndio Ironsworn à mesa.");
  assertEquals("error" in handleClientMessage(room, ana, { type: "compendium:add", compendiumId: "ironsworn" }), true);
  assertEquals("error" in handleClientMessage(room, ana, { type: "compendium:add", compendiumId: "nada" }), true);

  const item = handleClientMessage(room, ana, { type: "compendium:get", compendiumId: "ironsworn", itemId: "assets" });
  if ("error" in item) throw new Error(item.error);
  assertEquals(item.reply?.type, "compendium:item");

  assertEquals("error" in handleClientMessage(room, ana, { type: "compendium:remove", compendiumId: "ironsworn" }), true);
  const removed = handleClientMessage(room, host, { type: "compendium:remove", compendiumId: "ironsworn" });
  if ("error" in removed) throw new Error(removed.error);
  assertEquals(removed.compendiums, []);
});

Deno.test("compêndios: o oráculo rola no servidor, em público ou em privado", () => {
  const room = createRoomRecord("ABC234", "Mesa", "Hugo", "open");
  handleClientMessage(room, ana, { type: "compendium:add", compendiumId: "ironsworn" });
  const target = { type: "table" as const, tableId: "moves.pay_the_price" };
  const open = handleClientMessage(
    room,
    ana,
    { type: "compendium:roll", compendiumId: "ironsworn", itemId: "oracles", target },
    seq(face(50, 100)),
  );
  if (!("entry" in open)) throw new Error("esperava entrada");
  assertEquals([open.entry!.kind, open.entry!.author], ["roll", "Ana"]);
  assertEquals(open.entry!.text.includes("Pagar o Preço, d100 50"), true);

  const historyBefore = room.history.length;
  const secret = handleClientMessage(
    room,
    ana,
    { type: "compendium:roll", compendiumId: "ironsworn", itemId: "oracles", target, private: true },
    seq(face(50, 100)),
  );
  if (!("privateEntry" in secret)) throw new Error("esperava entrada privada");
  assertEquals(secret.privateEntry?.private, true);
  assertEquals(room.history.length, historyBefore);

  const notOracle = handleClientMessage(
    room,
    ana,
    { type: "compendium:roll", compendiumId: "ironsworn", itemId: "moves", target },
    seq(0.5),
  );
  assertEquals("error" in notOracle, true);
});

Deno.test("texto vira entrada com autor e seq crescente", () => {
  const room = createRoomRecord("ABC234", "Mesa", "Ana", "open");
  const a = handleClientMessage(room, ana, { type: "chat:send", input: "oi" });
  const b = handleClientMessage(room, ana, { type: "chat:send", input: "tudo bem?" });
  if (!("entry" in a) || !("entry" in b)) throw new Error("esperava entradas");
  assertEquals([a.entry!.seq, b.entry!.seq], [1, 2]);
  assertEquals([a.entry!.author, a.entry!.kind, a.entry!.text], ["Ana", "text", "oi"]);
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
  assertEquals(out.entry!.kind, "roll");
  assertEquals(out.entry!.text, "Acerto parcial, 7 contra 4 e 9 · Ferro, d6+2 contra 2d10, dado de ação 5");
  assertEquals(out.entry!.roll?.kind, "ironsworn");
});

Deno.test("segurança por comando e por sinal geram o mesmo tipo de entrada", () => {
  const room = createRoomRecord("ABC234", "Mesa", "Ana", "open");
  const byCommand = handleClientMessage(room, ana, { type: "chat:send", input: "/x" });
  const bySignal = handleClientMessage(room, ana, { type: "safety:signal", action: "stop" });
  if (!("entry" in byCommand) || !("entry" in bySignal)) throw new Error("esperava entradas");
  assertEquals(byCommand.entry!.kind, "safety");
  assertEquals(byCommand.entry!.action, "stop");
  assertEquals(bySignal.entry!.text, byCommand.entry!.text);
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

const SHEET_ROOM = () => createRoomRecord("ABC234", "Mesa", "Ana", "open");
const bia: Player = { id: "p2", name: "Bia", role: "player", connectedAt: "2026-01-01T00:00:00Z" };
const host: Player = { id: "p0", name: "Mestre", role: "host", connectedAt: "2026-01-01T00:00:00Z" };

function createSheet(room: ReturnType<typeof SHEET_ROOM>, player: Player, templateId: string) {
  const out = handleClientMessage(room, player, { type: "sheet:create", templateId, name: "Kaja" });
  if (!("character" in out) || !out.character) throw new Error("esperava ficha");
  return out.character;
}

Deno.test("ficha: criar, editar e restringir a edição ao dono ou anfitrião", () => {
  const room = SHEET_ROOM();
  const sheet = createSheet(room, ana, "template.ironsworn");
  assertEquals([sheet.owner, sheet.name], ["Ana", "Kaja"]);

  const edit = handleClientMessage(room, ana, {
    type: "sheet:op",
    characterId: sheet.id,
    op: { type: "field:set", fieldId: "iron.stat.iron", value: 3 },
  });
  assertEquals("error" in edit, false);
  assertEquals(room.characters[0].values["iron.stat.iron"], 3);

  const intruder = handleClientMessage(room, bia, {
    type: "sheet:op",
    characterId: sheet.id,
    op: { type: "field:set", fieldId: "iron.stat.iron", value: 1 },
  });
  assertEquals("error" in intruder, true);
  assertEquals(room.characters[0].values["iron.stat.iron"], 3);

  const byHost = handleClientMessage(room, host, { type: "sheet:rename", characterId: sheet.id, name: "Nova" });
  assertEquals("error" in byHost, false);
  assertEquals(room.characters[0].name, "Nova");

  const bad = handleClientMessage(room, ana, {
    type: "sheet:op",
    characterId: sheet.id,
    op: { type: "field:set", fieldId: "iron.nao.existe", value: 1 },
  });
  assertEquals("error" in bad, true);
});

Deno.test("ficha: o dono ou o anfitrião passam a ficha para quem está na mesa", () => {
  const room = SHEET_ROOM();
  const sheet = createSheet(room, ana, "template.fate-core");
  const present = ["Ana", "Bia"];
  const assign = (player: Player, owner: string) =>
    handleClientMessage(room, player, { type: "sheet:assign", characterId: sheet.id, owner }, undefined, present);

  const passed = assign(ana, "Bia");
  assertEquals("error" in passed, false);
  assertEquals(room.characters[0].owner, "Bia");
  assertEquals(room.history.at(-1)?.text, "Ana passou a ficha Kaja, de Ana, para Bia.");

  assertEquals("error" in assign(ana, "Carlos"), true, "Ana já não é a dona, e Carlos não está na mesa");
  assertEquals("error" in assign(bia, "Carlos"), true, "Carlos não está na mesa");
  assertEquals("error" in assign(bia, "Bia"), true, "já é dela");
  assertEquals("error" in assign(host, "Ana"), false, "o anfitrião devolve a qualquer um");
  assertEquals(room.characters[0].owner, "Ana");

  const claimed = assign(bia, "Bia");
  assertEquals("error" in claimed, false, "qualquer um pega uma ficha para si");
  assertEquals(room.history.at(-1)?.text, "Bia pegou a ficha Kaja, de Ana.");
  assertEquals("error" in assign(ana, "Ana"), false, "Ana pega de volta");
  assertEquals(room.characters[0].owner, "Ana");
});

Deno.test("ficha: descrição e importação de arquivo", () => {
  const room = SHEET_ROOM();
  const sheet = createSheet(room, ana, "template.fate-accelerated");
  assertEquals(sheet.description, "");

  const described = handleClientMessage(room, ana, {
    type: "sheet:describe",
    characterId: sheet.id,
    description: "  Jovem clériga gnomo.  ",
  });
  assertEquals("error" in described, false);
  assertEquals(room.characters[0].description, "Jovem clériga gnomo.");
  assertEquals("error" in handleClientMessage(room, bia, {
    type: "sheet:describe",
    characterId: sheet.id,
    description: "x",
  }), true);

  const file = {
    id: "local-1",
    templateId: "template.fate-accelerated",
    name: "Kaju",
    description: "Clériga",
    // "quick" válido, "careful" fora do intervalo vira o máximo, "clever" inválido volta ao padrão.
    values: { "fate.approach.quick": 3, "fate.approach.careful": 99, "fate.approach.clever": "x", "campo.inexistente": 1 },
  };
  const imported = handleClientMessage(room, bia, { type: "sheet:import", sheet: file });
  if (!("character" in imported) || !imported.character) throw new Error("esperava ficha");
  assertEquals([imported.character.id, imported.character.owner, imported.character.name], ["local-1", "Bia", "Kaju"]);
  assertEquals(
    [
      imported.character.values["fate.approach.quick"],
      imported.character.values["fate.approach.careful"],
      imported.character.values["fate.approach.clever"],
      "campo.inexistente" in imported.character.values,
    ],
    [3, 5, 0, false],
  );

  // Importar o mesmo arquivo de novo não repete o id.
  const again = handleClientMessage(room, bia, { type: "sheet:import", sheet: file });
  if (!("character" in again) || !again.character) throw new Error("esperava ficha");
  assertEquals(again.character.id !== "local-1", true);

  const unknown = handleClientMessage(room, bia, { type: "sheet:import", sheet: { ...file, templateId: "outro" } });
  assertEquals("error" in unknown, true);
});

Deno.test("ficha: rolar de um campo vai para o histórico e queimar momentum reinicia o medidor", () => {
  const room = SHEET_ROOM();
  const sheet = createSheet(room, ana, "template.ironsworn");
  handleClientMessage(room, ana, {
    type: "sheet:op",
    characterId: sheet.id,
    op: { type: "field:set", fieldId: "iron.momentum", value: 8 },
  });
  handleClientMessage(room, ana, {
    type: "sheet:op",
    characterId: sheet.id,
    op: { type: "field:set", fieldId: "iron.stat.iron", value: 1 },
  });

  const rolled = handleClientMessage(
    room,
    ana,
    { type: "sheet:roll", characterId: sheet.id, fieldId: "iron.stat.iron" },
    seq(face(1, 6), face(5, 10), face(6, 10)),
  );
  if (!("entry" in rolled)) throw new Error("esperava entrada");
  assertEquals(rolled.entry!.roll?.kind, "ironsworn");
  assertEquals(rolled.entry!.author, "Kaja");
  assertEquals(rolled.entry!.text.includes("Kaja"), false);

  const burned = handleClientMessage(room, ana, { type: "sheet:burn", characterId: sheet.id });
  if (!("entry" in burned)) throw new Error("esperava entrada");
  assertEquals(room.characters[0].values["iron.momentum"], 2);
  assertEquals(burned.entry!.roll?.kind === "ironsworn" && burned.entry!.roll.outcome, "strong");

  const again = handleClientMessage(room, ana, { type: "sheet:burn", characterId: sheet.id });
  assertEquals("error" in again, true);
});

Deno.test("ficha: excluir remove e rolar em campo sem rolagem é erro", () => {
  const room = SHEET_ROOM();
  const sheet = createSheet(room, ana, "template.fate-core");
  const noRoll = handleClientMessage(room, ana, { type: "sheet:roll", characterId: sheet.id, fieldId: "fate.notes" });
  assertEquals("error" in noRoll, true);
  const removed = handleClientMessage(room, ana, { type: "sheet:delete", characterId: sheet.id });
  assertEquals("removed" in removed && removed.removed, sheet.id);
  assertEquals(room.characters.length, 0);
});


Deno.test("ficha: rolagem privada não entra no histórico e medidores rolam", () => {
  const room = SHEET_ROOM();
  const sheet = createSheet(room, ana, "template.ironsworn");
  const out = handleClientMessage(
    room,
    ana,
    { type: "sheet:roll", characterId: sheet.id, fieldId: "iron.meter.health", private: true },
    seq(face(3, 6), face(2, 10), face(8, 10)),
  );
  if (!("privateEntry" in out) || !out.privateEntry) throw new Error("esperava rolagem privada");
  assertEquals(out.entry, undefined);
  assertEquals([out.privateEntry.private, out.privateEntry.author], [true, "Kaja"]);
  assertEquals(room.history.length, 0);
});
Deno.test("cena: anfitrião cria cenas, todos editam cards e o histórico anuncia", () => {
  const room = createRoomRecord("ABC234", "Mesa", "Mestre", "open");
  const denied = handleClientMessage(room, ana, { type: "scene:op", op: { type: "scene:create", id: "s2", name: "Duelo" } });
  assertEquals("error" in denied, true);

  const created = handleClientMessage(room, host, { type: "scene:op", op: { type: "scene:create", id: "s2", name: "Duelo" } });
  if (!("scene" in created) || !created.scene) throw new Error("esperava cena");
  assertEquals(created.entry!.text, "Mestre criou a cena Duelo.");
  assertEquals(room.scene.activeId, "s2");

  const card = handleClientMessage(room, ana, { type: "scene:op", op: { type: "card:add", id: "c1", title: "Ponte", text: "Estreita." } });
  assertEquals("error" in card, false);
  assertEquals(room.scene.scenes[1].cards.length, 1);

  handleClientMessage(room, host, { type: "scene:op", op: { type: "scene:editors", editors: "host" } });
  const blocked = handleClientMessage(room, ana, { type: "scene:op", op: { type: "card:remove", cardId: "c1" } });
  assertEquals("error" in blocked, true);
});