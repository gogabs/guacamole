import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  describeRoll,
  fateLadder,
  ironswornOutcome,
  parseDiceExpression,
  rollDungeonWorld,
  rollFate,
  rollGeneric,
  rollIronsworn,
  rollProgress,
} from "./dice.ts";
import { face, fateFace, seq } from "./test_util.ts";

Deno.test("rollDungeonWorld: 2d6 mais atributo, vantagem e desvantagem", () => {
  const six = (...dice: number[]) => seq(...dice.map((d) => face(d, 6)));

  const plain = rollDungeonWorld(1, six(4, 5), "Força");
  assertEquals([plain.kept, plain.total, plain.outcome], [[4, 5], 10, "strong"]);
  assertEquals(describeRoll(plain), "Acerto forte, 10 · Força, 2d6+1, dados 4 e 5");

  const adv = rollDungeonWorld(0, six(2, 4, 6), "Destreza", 1);
  assertEquals([adv.dice, adv.kept, adv.total, adv.outcome], [[2, 4, 6], [4, 6], 10, "strong"]);

  const dis = rollDungeonWorld(0, six(2, 4, 6), "Destreza", -1, ["Assustado"]);
  assertEquals([dis.kept, dis.total, dis.outcome], [[2, 4], 6, "miss"]);
  assertEquals(
    describeRoll(dis),
    "Erro, 6 · Destreza, 2d6, com desvantagem, dados 2, 4, 6, valem 2 e 4, desvantagem por Assustado",
  );

  // Duas vantagens: um 7 a 9 sobe para forte; duas desvantagens: desce para erro.
  assertEquals(rollDungeonWorld(0, six(2, 3, 4), "x", 2).outcome, "strong");
  assertEquals(rollDungeonWorld(0, six(4, 4, 5), "x", -2).outcome, "miss");
  assertEquals(rollDungeonWorld(0, six(3, 4), "x").outcome, "weak");
});

Deno.test("parseDiceExpression: expressões válidas", () => {
  assertEquals(parseDiceExpression("2d6+3"), { terms: [{ sign: 1, count: 2, sides: 6 }], modifier: 3 });
  assertEquals(parseDiceExpression("d20"), { terms: [{ sign: 1, count: 1, sides: 20 }], modifier: 0 });
  assertEquals(parseDiceExpression("2d6 + 1d4 - 1"), {
    terms: [{ sign: 1, count: 2, sides: 6 }, { sign: 1, count: 1, sides: 4 }],
    modifier: -1,
  });
  assertEquals(parseDiceExpression("-1d4+5")?.terms[0].sign, -1);
});

Deno.test("parseDiceExpression: expressões inválidas", () => {
  for (const bad of ["", "abc", "2d", "0d6", "101d6", "1d1", "1d1001", "2d6 3", "2d6++3", "3"]) {
    assertStrictEquals(parseDiceExpression(bad), null, bad);
  }
});

Deno.test("rollGeneric: soma dados e modificador", () => {
  const roll = rollGeneric(parseDiceExpression("2d6+3")!, seq(face(4, 6), face(5, 6)));
  assertEquals(roll.terms[0].rolls, [4, 5]);
  assertEquals(roll.total, 12);
  assertEquals(roll.expression, "2d6+3");
});

Deno.test("rollGeneric: termo negativo subtrai", () => {
  const roll = rollGeneric(parseDiceExpression("1d6-1d4")!, seq(face(6, 6), face(3, 4)));
  assertEquals(roll.total, 3);
  assertEquals(roll.expression, "1d6-1d4");
});

Deno.test("rollFate: soma 4dF + modificador e mapeia a escada", () => {
  const roll = rollFate(3, seq(fateFace(1), fateFace(-1), fateFace(0), fateFace(1)), "Lutar");
  assertEquals(roll.dice, [1, -1, 0, 1]);
  assertEquals(roll.total, 4);
  assertEquals(roll.ladder, "Ótimo");
  assertEquals(roll.label, "Lutar");
});

Deno.test("fateLadder: limites", () => {
  assertEquals(fateLadder(8), "Lendário");
  assertEquals(fateLadder(9), "Além de Lendário");
  assertEquals(fateLadder(0), "Medíocre");
  assertEquals(fateLadder(-2), "Terrível");
  assertEquals(fateLadder(-5), "Pior que Terrível");
});

Deno.test("ironswornOutcome: acerto forte, parcial e erro", () => {
  assertEquals(ironswornOutcome(7, [4, 6]), "strong");
  assertEquals(ironswornOutcome(7, [4, 9]), "weak");
  assertEquals(ironswornOutcome(3, [4, 9]), "miss");
  assertEquals(ironswornOutcome(4, [4, 4]), "miss"); // empate não vence
});

Deno.test("rollIronsworn: soma modificador e limita a 10", () => {
  const roll = rollIronsworn(2, seq(face(5, 6), face(4, 10), face(9, 10)), "Ferro");
  assertEquals([roll.actionDie, roll.actionScore, roll.challenge], [5, 7, [4, 9]]);
  assertEquals(roll.outcome, "weak");
  assertEquals(roll.match, false);

  const capped = rollIronsworn(8, seq(face(6, 6), face(1, 10), face(1, 10)));
  assertEquals(capped.actionScore, 10);
  assertEquals(capped.match, true);
});

Deno.test("rollProgress: compara progresso com os dados de desafio", () => {
  const roll = rollProgress(6, seq(face(3, 10), face(8, 10)), "Vingança");
  assertEquals(roll.outcome, "weak");
  assertEquals(roll.challenge, [3, 8]);
});

Deno.test("describeRoll: texto legível por leitor de tela", () => {
  const iron = rollIronsworn(2, seq(face(5, 6), face(4, 10), face(9, 10)), "Ferro");
  assertEquals(
    describeRoll(iron),
    "Acerto parcial, 7 contra 4 e 9 · Ferro, d6+2 contra 2d10, dado de ação 5",
  );
  const fate = rollFate(3, seq(fateFace(1), fateFace(-1), fateFace(0), fateFace(1)));
  assertEquals(
    describeRoll(fate),
    "+4, Ótimo · 4dF+3, mais menos vazio mais",
  );
});
