import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { describeRoll } from "../dice.ts";
import { face, fateFace, seq } from "../test_util.ts";
import {
  allFields,
  coerceValue,
  createCharacter,
  defaultValue,
  findField,
  migrateCharacter,
  SheetError,
} from "./fields.ts";
import { applySheetOp, burnMomentum, rollFromField } from "./ops.ts";
import {
  BUILT_IN_TEMPLATES,
  DUNGEON_WORLD_TEMPLATE,
  FATE_TEMPLATE,
  IRONSWORN_TEMPLATE,
} from "./templates/mod.ts";
import type { CardValue, ProgressValue, TrackValue } from "./types.ts";

Deno.test("templates: ids de campo únicos e valores padrão válidos", () => {
  for (const template of BUILT_IN_TEMPLATES) {
    const fields = allFields(template);
    const ids = fields.map((field) => field.id);
    assertEquals(new Set(ids).size, ids.length, `${template.name}: ids repetidos`);
    for (const field of fields) {
      assertEquals(coerceValue(field, defaultValue(field)), defaultValue(field), field.id);
    }
  }
});

Deno.test("Ironsworn: os ativos são cartas com origem no compêndio, e as listas antigas são aproveitadas", () => {
  const field = findField(IRONSWORN_TEMPLATE, "iron.assets");
  assertEquals(field.type === "cards" && field.source, { compendium: "ironsworn", item: "assets" });
  const titles = (sheet: ReturnType<typeof createCharacter>) =>
    (sheet.values["iron.assets"] as CardValue[]).map((card) => card.title);
  const old = createCharacter(IRONSWORN_TEMPLATE, "x", "Caio");
  old.values["iron.assets"] = "Cão\n\n  Aranha Gigante \n" as unknown as string[];
  assertEquals(titles(migrateCharacter(IRONSWORN_TEMPLATE, old)), ["Cão", "Aranha Gigante"]);
  old.values["iron.assets"] = ["Cão", "Cão"];
  const migrated = migrateCharacter(IRONSWORN_TEMPLATE, old);
  assertEquals(titles(migrated), ["Cão", "Cão"]);
  assertEquals(new Set((migrated.values["iron.assets"] as CardValue[]).map((card) => card.id)).size, 2);
});

Deno.test("cartas: medidores e habilidades são validados e limitados", () => {
  const field = findField(IRONSWORN_TEMPLATE, "iron.assets");
  const card = {
    id: "a",
    title: "Cão",
    text: "Seu cão é seu companheiro fiel.",
    details: [{ label: "Nome", value: "Rex" }],
    meters: [{ label: "Saúde", value: 9, max: 4 }],
    abilities: [{ name: "Leal", text: "Some +1.", marked: true }, { name: "Feroz", text: "", marked: "sim" }],
  };
  const [clean] = coerceValue(field, [card]) as CardValue[];
  assertEquals(clean.meters, [{ label: "Saúde", value: 4, max: 4 }]);
  assertEquals(clean.abilities.map((a) => a.marked), [true, false]);
  assertThrows(() => coerceValue(field, [{ ...card, id: "" }]), SheetError);
  assertThrows(() => coerceValue(field, [{ ...card, meters: [{ label: "x", value: "1", max: 2 }] }]), SheetError);
});

Deno.test("Dungeon World: condições marcadas dão desvantagem no atributo ligado a elas", () => {
  const sheet = createCharacter(DUNGEON_WORLD_TEMPLATE, "x", "Brenna");
  const six = (...dice: number[]) => seq(...dice.map((d) => face(d, 6)));
  const roll = (id: string, edge?: number) => rollFromField(DUNGEON_WORLD_TEMPLATE, sheet, id, six(3, 4, 6), { edge });

  sheet.values["dw.stat.int"] = 2;
  const clear = roll("dw.stat.dex");
  assertEquals(clear.kind === "dungeon-world" && [clear.edge, clear.total], [0, 7]);

  sheet.values["dw.cond.angry"] = "Marcada";
  const angry = roll("dw.stat.int");
  assertEquals(angry.kind === "dungeon-world" && [angry.edge, angry.kept, angry.reasons], [-1, [3, 4], ["Irritado"]]);
  assertEquals(describeRoll(angry).includes("desvantagem por Irritado"), true);

  const other = roll("dw.stat.dex");
  assertEquals(other.kind === "dungeon-world" && other.edge, 0, "só a condição ligada ao atributo conta");

  sheet.values["dw.cond.angry"] = "Trancada";
  const cancelled = roll("dw.stat.int", 1);
  assertEquals(cancelled.kind === "dungeon-world" && cancelled.edge, 0, "vantagem pedida cancela a desvantagem");
});

Deno.test("Fate: 19 perícias, todas rolam 4dF", () => {
  const skills = allFields(FATE_TEMPLATE).filter((f) => f.id.startsWith("fate.skill."));
  assertEquals(skills.length, 19);
  assertEquals(skills.every((f) => f.type === "number" && f.roll === "fate"), true);
});

Deno.test("Ironsworn: 5 atributos rolam d6 contra 2d10", () => {
  const stats = allFields(IRONSWORN_TEMPLATE).filter((f) => f.id.startsWith("iron.stat."));
  assertEquals(stats.length, 5);
  assertEquals(stats.every((f) => f.type === "number" && f.roll === "ironsworn"), true);
});

Deno.test("createCharacter preenche todos os campos", () => {
  const sheet = createCharacter(FATE_TEMPLATE, "c1", "  Ana  ");
  assertEquals(sheet.name, "Ana");
  assertEquals(Object.keys(sheet.values).length, allFields(FATE_TEMPLATE).length);
});

Deno.test("coerceValue: ajusta números e rejeita tipos errados", () => {
  const skill = findField(FATE_TEMPLATE, "fate.skill.fight");
  assertEquals(coerceValue(skill, 99), 8);
  assertEquals(coerceValue(skill, -3), 0);
  assertEquals(coerceValue(skill, 2.6), 3);
  assertThrows(() => coerceValue(skill, "3"), SheetError);
  assertThrows(() => coerceValue(skill, NaN), SheetError);

  const aspects = findField(FATE_TEMPLATE, "fate.aspect.others");
  assertEquals(coerceValue(aspects, [" a ", "", "b", "c", "d"]), ["a", "b", "c"]);

  const stress = findField(FATE_TEMPLATE, "fate.stress.physical");
  assertEquals(coerceValue(stress, [true, false]), [true, false, false, false]);
  assertThrows(() => coerceValue(stress, [1, 0]), SheetError);
});

Deno.test("applySheetOp: field:set não altera a ficha original", () => {
  const sheet = createCharacter(FATE_TEMPLATE, "c1", "Ana");
  const next = applySheetOp(FATE_TEMPLATE, sheet, { type: "field:set", fieldId: "fate.skill.fight", value: 4 });
  assertEquals(next.values["fate.skill.fight"], 4);
  assertEquals(sheet.values["fate.skill.fight"], 0);
  assertThrows(
    () => applySheetOp(FATE_TEMPLATE, sheet, { type: "field:set", fieldId: "nope", value: 1 }),
    SheetError,
  );
});

Deno.test("trilhas: adicionar, marcar por graduação, desmarcar e remover", () => {
  let sheet = createCharacter(IRONSWORN_TEMPLATE, "c1", "Ana");
  sheet = applySheetOp(IRONSWORN_TEMPLATE, sheet, {
    type: "track:add",
    fieldId: "iron.vows",
    track: { id: "v1", name: "Vingar meu irmão", rank: "dangerous" },
  });
  for (let i = 0; i < 2; i++) {
    sheet = applySheetOp(IRONSWORN_TEMPLATE, sheet, {
      type: "progress:mark",
      fieldId: "iron.vows",
      trackId: "v1",
      times: 1,
    });
  }
  let [vow] = sheet.values["iron.vows"] as TrackValue[];
  assertEquals(vow.ticks, 16); // perigoso: 2 caixas por marca
  sheet = applySheetOp(IRONSWORN_TEMPLATE, sheet, {
    type: "progress:mark",
    fieldId: "iron.vows",
    trackId: "v1",
    times: -5,
  });
  [vow] = sheet.values["iron.vows"] as TrackValue[];
  assertEquals(vow.ticks, 0); // não fica negativo

  assertThrows(
    () =>
      applySheetOp(IRONSWORN_TEMPLATE, sheet, {
        type: "track:add",
        fieldId: "iron.vows",
        track: { id: "v1", name: "outra", rank: "epic" },
      }),
    SheetError,
  );
  sheet = applySheetOp(IRONSWORN_TEMPLATE, sheet, { type: "track:remove", fieldId: "iron.vows", trackId: "v1" });
  assertEquals(sheet.values["iron.vows"], []);
});

Deno.test("progresso nunca passa de 40 marcas", () => {
  let sheet = createCharacter(IRONSWORN_TEMPLATE, "c1", "Ana");
  for (let i = 0; i < 5; i++) {
    sheet = applySheetOp(IRONSWORN_TEMPLATE, sheet, { type: "progress:mark", fieldId: "iron.bonds", times: 10 });
  }
  assertEquals((sheet.values["iron.bonds"] as ProgressValue).ticks, 40);
});

Deno.test("rollFromField: perícia Fate com bônus extra", () => {
  let sheet = createCharacter(FATE_TEMPLATE, "c1", "Ana");
  sheet = applySheetOp(FATE_TEMPLATE, sheet, { type: "field:set", fieldId: "fate.skill.fight", value: 3 });
  const roll = rollFromField(
    FATE_TEMPLATE,
    sheet,
    "fate.skill.fight",
    seq(fateFace(0), fateFace(0), fateFace(0), fateFace(0)),
    { extra: 1 },
  );
  if (roll.kind !== "fate") throw new Error("esperava fate");
  assertEquals([roll.total, roll.label, roll.ladder], [4, "Lutar", "Ótimo"]);
});

Deno.test("rollFromField: atributo Ironsworn e trilha de progresso", () => {
  let sheet = createCharacter(IRONSWORN_TEMPLATE, "c1", "Ana");
  sheet = applySheetOp(IRONSWORN_TEMPLATE, sheet, { type: "field:set", fieldId: "iron.stat.iron", value: 3 });
  const iron = rollFromField(IRONSWORN_TEMPLATE, sheet, "iron.stat.iron", seq(face(4, 6), face(5, 10), face(2, 10)));
  if (iron.kind !== "ironsworn") throw new Error("esperava ironsworn");
  assertEquals([iron.actionScore, iron.outcome, iron.label], [7, "strong", "Ferro"]);

  sheet = applySheetOp(IRONSWORN_TEMPLATE, sheet, {
    type: "track:add",
    fieldId: "iron.vows",
    track: { id: "v1", name: "Salvar a vila", rank: "formidable" },
  });
  for (let i = 0; i < 6; i++) {
    sheet = applySheetOp(IRONSWORN_TEMPLATE, sheet, {
      type: "progress:mark",
      fieldId: "iron.vows",
      trackId: "v1",
      times: 1,
    });
  }
  const progress = rollFromField(IRONSWORN_TEMPLATE, sheet, "iron.vows", seq(face(3, 10), face(8, 10)), {
    trackId: "v1",
  });
  if (progress.kind !== "progress") throw new Error("esperava progress");
  assertEquals([progress.progress, progress.outcome, progress.label], [6, "weak", "Salvar a vila"]);
});

Deno.test("rollFromField: campo sem rolagem ou trilha ausente lança", () => {
  const sheet = createCharacter(IRONSWORN_TEMPLATE, "c1", "Ana");
  assertThrows(() => rollFromField(IRONSWORN_TEMPLATE, sheet, "iron.notes", seq()), SheetError);
  assertThrows(() => rollFromField(IRONSWORN_TEMPLATE, sheet, "iron.vows", seq(), { trackId: "x" }), SheetError);
});

Deno.test("burnMomentum: melhora o resultado e reinicia o medidor", () => {
  let sheet = createCharacter(IRONSWORN_TEMPLATE, "c1", "Ana");
  sheet = applySheetOp(IRONSWORN_TEMPLATE, sheet, { type: "field:set", fieldId: "iron.momentum", value: 8 });
  sheet = applySheetOp(IRONSWORN_TEMPLATE, sheet, { type: "field:set", fieldId: "iron.stat.iron", value: 1 });
  const roll = rollFromField(IRONSWORN_TEMPLATE, sheet, "iron.stat.iron", seq(face(2, 6), face(5, 10), face(7, 10)));
  if (roll.kind !== "ironsworn") throw new Error("esperava ironsworn");
  assertEquals(roll.outcome, "miss"); // 3 contra 5 e 7

  const burned = burnMomentum(IRONSWORN_TEMPLATE, sheet, roll);
  assertEquals(burned.roll.outcome, "strong");
  assertEquals(burned.sheet.values["iron.momentum"], 2);
  assertEquals(sheet.values["iron.momentum"], 8);
  assertEquals(
    describeRoll(burned.roll),
    "Acerto forte, momentum queimado 8 contra 5 e 7 · Ferro, momentum no lugar do dado de ação",
  );

  // Com momentum baixo, queimar não ajuda.
  const low = applySheetOp(IRONSWORN_TEMPLATE, sheet, { type: "field:set", fieldId: "iron.momentum", value: 2 });
  assertThrows(() => burnMomentum(IRONSWORN_TEMPLATE, low, roll), SheetError);
  // Fate não tem momentum.
  assertThrows(() => burnMomentum(FATE_TEMPLATE, createCharacter(FATE_TEMPLATE, "c2", "B"), roll), SheetError);
});
