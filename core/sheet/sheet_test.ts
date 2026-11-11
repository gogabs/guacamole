import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { describeRoll } from "../dice.ts";
import { face, fateFace, seq } from "../test_util.ts";
import { allFields, coerceValue, createCharacter, defaultValue, findField, SheetError } from "./fields.ts";
import { applySheetOp, burnMomentum, rollFromField } from "./ops.ts";
import { BUILT_IN_TEMPLATES, FATE_TEMPLATE, IRONSWORN_TEMPLATE } from "./templates/mod.ts";
import type { ProgressValue, TrackValue } from "./types.ts";

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
