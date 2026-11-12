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

Deno.test("cena: zonas ocupam várias células e nenhuma célula é de duas zonas", () => {
  let state = createSceneState();
  const id = state.scenes[0].id;
  const cells = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 1 }];
  state = applySceneOp(state, { type: "zone:add", id: "z1", name: "Altar", description: "Pedra fria.", cells }, true).state;
  assertEquals(state.scenes[0].zones[0].cells, [{ x: 1, y: 1 }, { x: 2, y: 1 }]);
  assertThrows(() => applySceneOp(state, { type: "zone:add", id: "z2", name: "Outra", description: "", cells: [{ x: 2, y: 1 }] }, true), SceneError);
  assertThrows(() => applySceneOp(state, { type: "zone:add", id: "z2", name: "Fora", description: "", cells: [{ x: 99, y: 0 }] }, true), SceneError);
  assertThrows(() => applySceneOp(state, { type: "zone:add", id: "z2", name: "Jogador", description: "", cells: [{ x: 0, y: 0 }] }, false), SceneError);

  // Editar a própria zona pode reaproveitar suas células.
  state = applySceneOp(state, { type: "zone:edit", zoneId: "z1", name: "Altar", description: "", cells: [{ x: 2, y: 1 }, { x: 3, y: 1 }] }, true).state;
  assertEquals(state.scenes[0].zones[0].cells.length, 2);

  // Reduzir o grid corta as células e solta os tokens de zonas que somem.
  state = applySceneOp(state, { type: "card:add", id: "t", title: "Goblin", text: "", zoneId: "z1" }, false).state;
  assertEquals(state.scenes[0].cards[0].zoneId, "z1");
  state = applySceneOp(state, { type: "scene:grid", sceneId: id, cols: 3, rows: 6 }, true).state;
  assertEquals(state.scenes[0].zones[0].cells, [{ x: 2, y: 1 }]);
  state = applySceneOp(state, { type: "scene:grid", sceneId: id, cols: 1, rows: 1 }, true).state;
  assertEquals([state.scenes[0].zones.length, state.scenes[0].cards[0].zoneId], [0, null]);
});

Deno.test("cena: cards soltos viram tokens ao serem postos numa zona", () => {
  let state = createSceneState();
  state = applySceneOp(state, { type: "zone:add", id: "z1", name: "Porta", description: "", cells: [{ x: 0, y: 0 }] }, true).state;
  state = applySceneOp(state, { type: "card:add", id: "c", title: "Chave", text: "Enferrujada." }, false).state;
  assertEquals(state.scenes[0].cards[0].zoneId, null);
  const placed = applySceneOp(state, { type: "card:place", cardId: "c", zoneId: "z1" }, false);
  assertEquals(placed.state.scenes[0].cards[0].zoneId, "z1");
  assertEquals(placed.message("Ana"), "Ana pôs Chave na zona Porta.");
  assertThrows(() => applySceneOp(state, { type: "card:place", cardId: "c", zoneId: "nada" }, false), SceneError);
  const loose = applySceneOp(placed.state, { type: "card:place", cardId: "c", zoneId: null }, false);
  assertEquals(loose.state.scenes[0].cards[0].zoneId, null);
  // Remover a zona solta o token.
  const removed = applySceneOp(placed.state, { type: "zone:remove", zoneId: "z1" }, true).state;
  assertEquals(removed.scenes[0].cards[0].zoneId, null);
});

Deno.test("cena: relógios e imagens", () => {
  let state = createSceneState();
  const known = (id: string) => id === "abc";
  assertThrows(() => applySceneOp(state, { type: "card:add", id: "i", title: "Mapa", text: "", kind: "image", mediaId: "xyz" }, true, known), SceneError);
  assertThrows(() => applySceneOp(state, { type: "card:add", id: "i", title: "Mapa", text: "", kind: "image" }, true, known), SceneError);
  state = applySceneOp(state, { type: "card:add", id: "i", title: "Mapa", text: "Um mapa rasgado.", kind: "image", mediaId: "abc" }, true, known).state;
  assertEquals(state.scenes[0].cards[0].mediaId, "abc");

  state = applySceneOp(state, { type: "card:add", id: "r", title: "Ritual", text: "", kind: "clock", segments: 6 }, false).state;
  const turned = applySceneOp(state, { type: "card:clock", cardId: "r", filled: 4 }, false);
  assertEquals(turned.state.scenes[0].cards[1].clock, { segments: 6, filled: 4 });
  assertEquals(turned.message("Ana"), "Ana pôs o relógio Ritual em 4 de 6.");
  assertEquals(applySceneOp(turned.state, { type: "card:clock", cardId: "r", filled: 99 }, false).state.scenes[0].cards[1].clock?.filled, 6);
  assertThrows(() => applySceneOp(state, { type: "card:clock", cardId: "i", filled: 1 }, false), SceneError);
  // Menos segmentos corta o que estava preenchido.
  const shrunk = applySceneOp(turned.state, { type: "card:edit", cardId: "r", title: "Ritual", text: "", segments: 3 }, false).state;
  assertEquals(shrunk.scenes[0].cards[1].clock, { segments: 3, filled: 3 });
});

Deno.test("cena: fundo e descrição são do anfitrião; estado antigo é completado", () => {
  let state = createSceneState();
  const id = state.scenes[0].id;
  assertThrows(() => applySceneOp(state, { type: "scene:describe", sceneId: id, description: "x" }, false), SceneError);
  assertThrows(() => applySceneOp(state, { type: "scene:background", sceneId: id, mediaId: "abc" }, true, () => false), SceneError);
  state = applySceneOp(state, { type: "scene:background", sceneId: id, mediaId: "abc" }, true).state;
  state = applySceneOp(state, { type: "scene:describe", sceneId: id, description: "Uma floresta escura." }, true).state;
  assertEquals([state.scenes[0].background, state.scenes[0].description], ["abc", "Uma floresta escura."]);

  const old = normalizeSceneState({ scenes: [{ id: "s", name: "Velha", cards: [{ id: "c", title: "Oi", text: "" }] }], activeId: "s" });
  assertEquals(old.scenes[0].grid, { cols: 8, rows: 6 });
  assertEquals([old.scenes[0].zones, old.scenes[0].cards[0].kind, old.scenes[0].cards[0].zoneId], [[], "note", null]);
});
