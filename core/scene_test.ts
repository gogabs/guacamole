import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { applySceneOp, createSceneState, normalizeSceneState, SceneError, sceneFor } from "./scene.ts";

Deno.test("cena: cards podem ser criados, editados, movidos e removidos", () => {
  let state = createSceneState();
  state = applySceneOp(state, { type: "card:add", id: "a", title: "Taverna", text: "Fumaça e canecas." }, false).state;
  state = applySceneOp(state, { type: "card:add", id: "b", title: "Bardo", text: "" }, false).state;
  assertEquals(state.scenes[0].cards.map((c) => c.id), ["a", "b"]);

  state = applySceneOp(state, { type: "card:move", cardId: "b", direction: -1 }, false).state;
  assertEquals(state.scenes[0].cards.map((c) => c.id), ["b", "a"]);
  assertThrows(() => applySceneOp(state, { type: "card:move", cardId: "b", direction: -1 }, false), SceneError);

  const edited = applySceneOp(state, { type: "card:edit", cardId: "a", title: "Taverna", text: "Vazia." }, true);
  assertEquals(edited.state.scenes[0].cards[1].text, "Vazia.");
  assertEquals(edited.message("Ana"), "Ana editou o card Taverna.");

  state = applySceneOp(edited.state, { type: "card:remove", cardId: "a" }, false).state;
  assertEquals(state.scenes[0].cards.length, 1);
  assertThrows(() => applySceneOp(state, { type: "card:add", id: "c", title: " ", text: " " }, true), SceneError);
});

Deno.test("cena: só o anfitrião gerencia cenas e, se configurado, os cards", () => {
  let state = createSceneState();
  assertThrows(() => applySceneOp(state, { type: "scene:create", id: "s2", name: "Duelo" }, false), SceneError);

  state = applySceneOp(state, { type: "scene:create", id: "s2", name: "Duelo" }, true).state;
  assertEquals([state.scenes.length, state.activeId], [2, "s2"]);

  const first = state.scenes[0].id;
  state = applySceneOp(state, { type: "scene:activate", sceneId: first }, true).state;
  assertEquals(state.activeId, first);

  state = applySceneOp(state, { type: "scene:editors", editors: "host" }, true).state;
  assertThrows(() => applySceneOp(state, { type: "card:add", id: "x", title: "Oi", text: "" }, false), SceneError);
  state = applySceneOp(state, { type: "card:add", id: "x", title: "Oi", text: "" }, true).state;
  assertEquals(state.scenes[0].cards.length, 1);
});

Deno.test("cena: excluir a ativa passa para outra e a última não pode ser excluída", () => {
  let state = createSceneState();
  state = applySceneOp(state, { type: "scene:create", id: "s2", name: "Duelo" }, true).state;
  state = applySceneOp(state, { type: "scene:delete", sceneId: "s2" }, true).state;
  assertEquals([state.scenes.length, state.activeId === state.scenes[0].id], [1, true]);
  assertThrows(() => applySceneOp(state, { type: "scene:delete", sceneId: state.activeId }, true), SceneError);
});

Deno.test("cena: cards ocultos só aparecem para o anfitrião até serem revelados", () => {
  let state = createSceneState();
  for (const id of ["a", "b", "c"]) {
    state = applySceneOp(state, { type: "card:add", id, title: id.toUpperCase(), text: "" }, true).state;
  }
  assertThrows(() => applySceneOp(state, { type: "card:visibility", cardId: "b", hidden: true }, false), SceneError);
  const hide = applySceneOp(state, { type: "card:visibility", cardId: "b", hidden: true }, true);
  state = hide.state;
  assertEquals(hide.message("Ana"), "");

  assertEquals(sceneFor(state, false).scenes[0].cards.map((c) => c.id), ["a", "c"]);
  assertEquals(sceneFor(state, true).scenes[0].cards.map((c) => c.id), ["a", "b", "c"]);

  // Jogador não consegue editar, remover nem mover o card oculto.
  assertThrows(() => applySceneOp(state, { type: "card:remove", cardId: "b" }, false), SceneError);
  assertThrows(() => applySceneOp(state, { type: "card:edit", cardId: "b", title: "x", text: "" }, false), SceneError);
  // Mover "a" para baixo pula o oculto, então muda de posição para quem vê.
  const moved = applySceneOp(state, { type: "card:move", cardId: "a", direction: 1 }, false).state;
  assertEquals(sceneFor(moved, false).scenes[0].cards.map((c) => c.id), ["c", "a"]);
  // Editar um card oculto não é anunciado.
  assertEquals(
    applySceneOp(state, { type: "card:edit", cardId: "b", title: "Segredo", text: "!" }, true).message("Ana"),
    "",
  );

  const reveal = applySceneOp(state, { type: "card:visibility", cardId: "b", hidden: false }, true);
  assertEquals(reveal.message("Ana"), "Ana revelou o card B.");
  assertEquals(sceneFor(reveal.state, false).scenes[0].cards.length, 3);
});

Deno.test("cena: estado corrompido volta ao inicial", () => {
  assertEquals(normalizeSceneState({ scenes: "x" }).scenes.length, 1);
  const kept = normalizeSceneState({
    scenes: [{ id: "s", name: "N", cards: [{ id: "c", title: "T", text: "X" }, { nope: 1 }] }],
    activeId: "inexistente",
    editors: "host",
  });
  assertEquals([kept.activeId, kept.scenes[0].cards.length, kept.editors], ["s", 1, "host"]);
});
