import { assertEquals } from "jsr:@std/assert@1";
import { runChatInput } from "./commands.ts";
import { face, fateFace, seq } from "./test_util.ts";

Deno.test("texto comum vira mensagem", () => {
  assertEquals(runChatInput("  olá, pessoal  "), { type: "text", content: "olá, pessoal" });
});

Deno.test("entrada vazia ou longa demais dá erro", () => {
  assertEquals(runChatInput("   ").type, "error");
  assertEquals(runChatInput("a".repeat(2001)).type, "error");
});

Deno.test("/roll e aliases", () => {
  for (const cmd of ["/roll", "/r", "/rolar", "/ROLL"]) {
    const result = runChatInput(`${cmd} 1d6+1`, seq(face(3, 6)));
    assertEquals(result.type, "roll", cmd);
    if (result.type === "roll") {
      assertEquals(result.roll.kind === "generic" && result.roll.total, 4);
    }
  }
  assertEquals(runChatInput("/roll banana").type, "error");
  assertEquals(runChatInput("/roll").type, "error");
});

Deno.test("/fate aceita modificador e rótulo em qualquer ordem", () => {
  const dice = () => seq(fateFace(0), fateFace(0), fateFace(0), fateFace(0));
  for (const line of ["/fate +3 Lutar", "/fate Lutar +3", "/f + 3 Lutar", "/fate 3 Lutar"]) {
    const result = runChatInput(line, dice());
    if (result.type !== "roll" || result.roll.kind !== "fate") throw new Error(line);
    assertEquals(result.roll.total, 3, line);
    assertEquals(result.roll.label, "Lutar", line);
  }
  const bare = runChatInput("/fate", dice());
  if (bare.type !== "roll" || bare.roll.kind !== "fate") throw new Error("bare");
  assertEquals(bare.roll.total, 0);
  assertEquals(runChatInput("/fate +99").type, "error");
});

Deno.test("/iron resolve dados e texto", () => {
  const result = runChatInput("/iron +2 Ferro", seq(face(5, 6), face(4, 10), face(9, 10)));
  if (result.type !== "roll" || result.roll.kind !== "ironsworn") throw new Error("esperava iron");
  assertEquals(result.roll.outcome, "weak");
  assertEquals(result.text.includes("Acerto parcial"), true);
});

Deno.test("/progress valida 0 a 10", () => {
  const ok = runChatInput("/progress 6 Vingança", seq(face(3, 10), face(8, 10)));
  if (ok.type !== "roll" || ok.roll.kind !== "progress") throw new Error("esperava progress");
  assertEquals(ok.roll.progress, 6);
  assertEquals(ok.roll.label, "Vingança");
  assertEquals(runChatInput("/progress 11").type, "error");
  assertEquals(runChatInput("/progress").type, "error");
});

Deno.test("comandos de segurança", () => {
  const expected = {
    "/x": "stop",
    "/stop": "stop",
    "/pause": "pause",
    "/pausar": "pause",
    "/rewind": "rewind",
    "/forward": "forward",
    "/avançar": "forward",
  } as const;
  for (const [line, action] of Object.entries(expected)) {
    const result = runChatInput(line);
    assertEquals(result.type === "safety" && result.action, action, line);
  }
});

Deno.test("comando desconhecido", () => {
  assertEquals(runChatInput("/xyz"), { type: "error", message: "Comando desconhecido: /xyz." });
});
