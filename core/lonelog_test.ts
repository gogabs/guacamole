import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { runChatInput } from "./commands.ts";
import { rollFate, rollGeneric, rollIronsworn, rollProgress } from "./dice.ts";
import { parseDiceExpression } from "./dice.ts";
import { buildLonelog, rollNotation, SESSION_GAP_MS } from "./lonelog.ts";
import type { ChatEntry } from "./protocol.ts";
import { face, fateFace, seq } from "./test_util.ts";

const T0 = Date.parse("2026-03-10T20:00:00");

let counter = 0;
function entry(offsetMs: number, draft: Partial<ChatEntry> & Pick<ChatEntry, "kind" | "text">): ChatEntry {
  counter++;
  return { id: `e${counter}`, seq: counter, author: "Ana", at: new Date(T0 + offsetMs).toISOString(), ...draft };
}

Deno.test("rolagens viram linhas d: com o resultado depois de ->", () => {
  const generic = rollGeneric(parseDiceExpression("2d6+3")!, seq(face(4, 6), face(1, 6)));
  assertEquals(rollNotation(generic), "d: 2d6+3=8 (4,1)");

  const fate = rollFate(2, seq(fateFace(1), fateFace(-1), fateFace(0), fateFace(1)), "Lutar");
  assertEquals(rollNotation(fate), "d: Lutar 4dF+2=+3 (+ - 0 +) -> Bom");

  const iron = rollIronsworn(2, seq(face(4, 6), face(3, 10), face(8, 10)), "Ferro");
  assertEquals(rollNotation(iron), "d: Ferro d6=4+2=6 vs 3,8 -> Acerto parcial");

  const progress = rollProgress(6, seq(face(2, 10), face(5, 10)), "Vingança");
  assertEquals(rollNotation(progress), "d: Vingança progresso 6 vs 2,5 -> Acerto forte");
});

Deno.test("o diário tem cabeçalho YAML, sessão, cena e blocos de notação", () => {
  const roll = rollGeneric(parseDiceExpression("1d20")!, seq(face(17, 20)));
  const text = buildLonelog({
    title: "Clearview",
    hostName: "Ana",
    entries: [
      entry(0, { kind: "system", author: "", text: "A cena agora é Biblioteca.", scene: { name: "Biblioteca", description: "Escura e quieta" } }),
      entry(1000, { kind: "text", text: "@ Entro de fininho" }),
      entry(2000, { kind: "roll", text: "x", roll }),
      entry(3000, { kind: "text", text: "=> Passo sem ser visto" }),
      entry(4000, { kind: "text", text: "A página está amarelada." }),
      entry(5000, { kind: "text", text: "N (Zelador): \"Quem está aí?\"" }),
    ],
  });
  assert(text.startsWith("---\ntitle: Clearview\nplayer: Ana\nstart_date: 2026-03-10"));
  assertStringIncludes(text, "# Clearview");
  assertStringIncludes(text, "## Sessão 1\n*Data: 2026-03-10 | Duração: 0min | Cenas: S1*");
  assertStringIncludes(text, "### S1 *Biblioteca*");
  assertStringIncludes(
    text,
    "```\n(descrição: Escura e quieta)\n@ Entro de fininho\nd: 1d20=17 (17)\n=> Passo sem ser visto\n```",
  );
  assertStringIncludes(text, "\nA página está amarelada.\n");
  assertStringIncludes(text, "```\nN (Zelador): \"Quem está aí?\"\n```");
});

Deno.test("oráculo de compêndio, segurança e relógio entram; o resto do sistema não", () => {
  const text = buildLonelog({
    title: "Mesa",
    hostName: "Ana",
    entries: [
      entry(0, { kind: "text", text: "? A porta está trancada?" }),
      entry(1, { kind: "roll", text: "Sim, coincidência · Probabilidade, 50%, d100 66" }),
      entry(2, { kind: "roll", text: "Uma espada quebrada · Tesouro, d100 42" }),
      entry(3, { kind: "safety", author: "", text: "Pausa pedida" }),
      entry(4, { kind: "system", author: "", text: "Ana pôs o relógio Alarme em 3 de 6." }),
      entry(5, { kind: "system", author: "", text: "Ana editou o card Mapa." }),
    ],
  });
  assertStringIncludes(text, "### S1 *Início*");
  assertStringIncludes(text, "d: Probabilidade, 50%, d100 66 -> Sim, coincidência");
  assertStringIncludes(text, "tbl: Tesouro, d100 42 -> Uma espada quebrada");
  assertStringIncludes(text, "(segurança: Pausa pedida)");
  assertStringIncludes(text, "[Clock:Alarme 3/6]");
  assert(!text.includes("Mapa"));
});

Deno.test("uma pausa longa abre outra sessão e as cenas seguem numeradas", () => {
  const text = buildLonelog({
    title: "Mesa",
    hostName: "Ana",
    entries: [
      entry(0, { kind: "system", author: "", text: "", scene: { name: "Taverna", description: "" } }),
      entry(1000, { kind: "text", text: "@ Pergunto" }),
      entry(SESSION_GAP_MS + 5000, { kind: "system", author: "", text: "", scene: { name: "Floresta", description: "" } }),
      entry(SESSION_GAP_MS + 9000, { kind: "text", text: "@ Sigo" }),
    ],
  });
  assertStringIncludes(text, "## Sessão 1");
  assertStringIncludes(text, "## Sessão 2");
  assertStringIncludes(text, "### S1 *Taverna*");
  assertStringIncludes(text, "### S2 *Floresta*");
  assertStringIncludes(text, "Cenas: S2*");
});

Deno.test("com vários jogadores, as ações levam o nome e a narração também", () => {
  const text = buildLonelog({
    title: "Mesa",
    hostName: "Ana",
    entries: [
      entry(0, { kind: "text", author: "Ana", text: "@ Abro a porta" }),
      entry(1, { kind: "text", author: "Bia", text: "Eu vigio o corredor." }),
    ],
  });
  assertStringIncludes(text, "player: Ana, Bia");
  assertStringIncludes(text, "@(Ana) Abro a porta");
  assertStringIncludes(text, "**Bia:** Eu vigio o corredor.");
});

Deno.test("rolagens privadas ficam de fora e crases não quebram o bloco", () => {
  const text = buildLonelog({
    title: "Mesa",
    hostName: "Ana",
    entries: [
      entry(0, { kind: "roll", text: "segredo", private: true, roll: rollGeneric(parseDiceExpression("1d6")!, seq(face(1, 6))) }),
      entry(1, { kind: "text", text: "@ teste ``` quebra" }),
    ],
  });
  assert(!text.includes("1d6"));
  assertStringIncludes(text, "@ teste ''' quebra");
});

Deno.test("mesa sem nada ainda gera o cabeçalho", () => {
  const text = buildLonelog({ title: "Vazia: a mesa", hostName: "Ana", entries: [] });
  assertEquals(text, "---\ntitle: \"Vazia: a mesa\"\nplayer: Ana\ntools: Guacamole\n---\n\n# Vazia: a mesa\n");
});

Deno.test("atalhos de chat anotam em Lonelog", () => {
  assertEquals(runChatInput("/a Procuro nos arquivos"), { type: "text", content: "@ Procuro nos arquivos" });
  assertEquals(runChatInput("/pergunta Tem alguém?"), { type: "text", content: "? Tem alguém?" });
  assertEquals(runChatInput("/res Sim, mas..."), { type: "text", content: "-> Sim, mas..." });
  assertEquals(runChatInput("/consequencia A porta abre"), { type: "text", content: "=> A porta abre" });
  assertEquals(runChatInput("/nota testar regra"), { type: "text", content: "(nota: testar regra)" });
  assertEquals(runChatInput("/a").type, "error");
});
