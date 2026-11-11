import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { face, seq } from "../test_util.ts";
import {
  BUILT_IN_COMPENDIUMS,
  compendiumCatalog,
  findCompendiumItem,
  IRONSWORN_COMPENDIUM,
  OracleError,
  type OraclesItem,
  rollOracle,
} from "./mod.ts";

const oracles = findCompendiumItem("ironsworn", "oracles") as OraclesItem;

Deno.test("todo compêndio tem ids únicos e itens com conteúdo", () => {
  const ids = BUILT_IN_COMPENDIUMS.map((c) => c.id);
  assertEquals(new Set(ids).size, ids.length);
  for (const compendium of BUILT_IN_COMPENDIUMS) {
    assert(compendium.items.length > 0, compendium.id);
    const itemIds = compendium.items.map((i) => i.id);
    assertEquals(new Set(itemIds).size, itemIds.length, compendium.id);
  }
  for (const summary of compendiumCatalog()) {
    for (const item of summary.items) assert(item.count > 0, `${summary.id}/${item.id}`);
  }
});

Deno.test("Dungeon World 2: nove classes, cada uma com a carta do movimento inicial e as dos caminhos", () => {
  const playbooks = findCompendiumItem("dungeon-world-2", "playbooks");
  const classes = findCompendiumItem("dungeon-world-2", "classes");
  const equipment = findCompendiumItem("dungeon-world-2", "equipment");
  if (playbooks?.kind !== "assets" || classes?.kind !== "reference" || equipment?.kind !== "assets") {
    throw new Error("itens esperados");
  }
  const categories = [...new Set(playbooks.entries.map((e) => e.category))];
  assertEquals(categories.length, 9);
  assertEquals(classes.entries.filter((e) => e.group === "Classes").length, 9);
  for (const category of categories) {
    const entries = playbooks.entries.filter((e) => e.category === category);
    assertEquals(entries.length, 4, `${category}: movimento inicial e três caminhos`);
    assertEquals(entries[0].abilities.length, 1);
    assertEquals(entries[0].abilities[0].starts, true);
    for (const path of entries.slice(1)) {
      assert(path.abilities[0].starts && path.abilities.slice(1).every((a) => !a.starts), path.name);
      assert(path.abilities.length >= 4, `${path.name}: o movimento inicial e ao menos três avançados`);
    }
  }
  const ids = playbooks.entries.map((e) => e.id);
  assertEquals(new Set(ids).size, ids.length, "ids únicos");
  for (const entry of [...playbooks.entries, ...equipment.entries]) {
    for (const extra of entry.extras) {
      if (extra.meter) assert(extra.meter.start <= extra.meter.max, `${entry.name}: ${extra.label}`);
    }
  }
  assertEquals(equipment.entries.find((e) => e.name === "Armadura leve")?.extras[0].meter, { max: 3, start: 3 });
});

Deno.test("as tabelas de oráculo cobrem de 1 a 100 sem buracos nem sobreposição", () => {
  for (const table of oracles.tables) {
    let next = 1;
    for (const row of table.rows) {
      assertEquals(row.min, next, `${table.id}: linha ${row.min}`);
      next = row.max + 1;
    }
    assertEquals(next, 101, table.id);
  }
});

Deno.test("as combinações apontam para tabelas que existem", () => {
  const ids = new Set(oracles.tables.map((t) => t.id));
  for (const combo of oracles.combos) {
    for (const id of combo.tables) assert(ids.has(id), `${combo.id}: ${id}`);
  }
});

Deno.test("o guia de Ironsworn traz 35 movimentos, 78 ativos e os ativos têm habilidades", () => {
  const moves = findCompendiumItem("ironsworn", "moves");
  const assets = findCompendiumItem("ironsworn", "assets");
  if (moves?.kind !== "reference" || assets?.kind !== "assets") throw new Error("itens esperados");
  assertEquals(moves.entries.length, 35);
  assertEquals(assets.entries.length, 78);
  assert(assets.entries.every((a) => a.name && a.abilities.length > 0));
  assertEquals(IRONSWORN_COMPENDIUM.system, "ironsworn");
});

Deno.test("rolar uma tabela mostra o resultado e depois a origem", () => {
  const text = rollOracle(oracles, { type: "table", tableId: "moves.pay_the_price" }, seq(face(50, 100)));
  assert(text.includes(" · Pagar o Preço, d100 50"), text);
});

Deno.test("o 100 aparece como 00", () => {
  const text = rollOracle(oracles, { type: "table", tableId: "moves.pay_the_price" }, seq(face(100, 100)));
  assert(text.endsWith("d100 00"), text);
});

Deno.test("a pergunta de sim ou não usa a probabilidade e acusa coincidência", () => {
  const sim = rollOracle(oracles, { type: "odds", threshold: 51 }, seq(face(60, 100)));
  assert(sim.startsWith("Sim · "), sim);
  const nao = rollOracle(oracles, { type: "odds", threshold: 51 }, seq(face(30, 100)));
  assert(nao.startsWith("Não · "), nao);
  const coincidencia = rollOracle(oracles, { type: "odds", threshold: 51 }, seq(face(44, 100)));
  assert(coincidencia.startsWith("Não, coincidência · "), coincidencia);
});

Deno.test("a combinação rola cada tabela e junta os resultados", () => {
  const text = rollOracle(oracles, { type: "combo", comboId: "action_theme" }, seq(face(1, 100), face(1, 100)));
  const action = oracles.tables.find((t) => t.id === "action_and_theme.action")!.rows[0].text;
  const theme = oracles.tables.find((t) => t.id === "action_and_theme.theme")!.rows[0].text;
  assert(text.startsWith(`${action} + ${theme} · Ação e tema, d100 1 e 1`), text);
});

Deno.test("alvos desconhecidos viram erro", () => {
  assertThrows(() => rollOracle(oracles, { type: "table", tableId: "nao.existe" }, seq(0.5)), OracleError);
  assertThrows(() => rollOracle(oracles, { type: "combo", comboId: "nao" }, seq(0.5)), OracleError);
  assertThrows(() => rollOracle(oracles, { type: "odds", threshold: 7 }, seq(0.5)), OracleError);
});
