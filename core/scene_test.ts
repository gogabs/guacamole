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

Deno.test("cena: áudio toca, para, dispara efeitos e só uma música por vez", () => {
  const known = (id: string, kind: string) => id === "wav" ? kind === "audio" : id === "png" && kind === "image";
  let state = createSceneState();
  const add = (id: string, mode: "ambient" | "music" | "effect") =>
    applySceneOp(state, { type: "card:add", id, title: id, text: "", kind: "audio", mediaId: "wav", mode }, true, known).state;
  assertThrows(() => applySceneOp(state, { type: "card:add", id: "x", title: "x", text: "", kind: "audio", mediaId: "wav" }, false, known), SceneError);
  assertThrows(() => applySceneOp(state, { type: "card:add", id: "x", title: "x", text: "", kind: "audio", mediaId: "png" }, true, known), SceneError);
  state = add("fogo", "ambient");
  state = add("tema", "music");
  state = add("outro", "music");
  state = add("trovao", "effect");
  const cards = () => state.scenes[0].cards;
  assertEquals(cards()[0].audio, { mode: "ambient", volume: 80, loop: true, playing: false, startedAt: null, slot: null });
  assertEquals(cards()[3].audio?.loop, false);

  assertThrows(() => applySceneOp(state, { type: "audio:play", cardId: "fogo" }, false, known, 1000), SceneError);
  state = applySceneOp(state, { type: "audio:play", cardId: "tema" }, true, known, 1000).state;
  assertEquals([cards()[1].audio?.playing, cards()[1].audio?.startedAt], [true, 1000]);
  state = applySceneOp(state, { type: "audio:play", cardId: "fogo" }, true, known, 2000).state;
  state = applySceneOp(state, { type: "audio:play", cardId: "outro" }, true, known, 3000).state;
  assertEquals(cards().map((c) => c.audio?.playing), [true, false, true, false]);

  const fired = applySceneOp(state, { type: "audio:play", cardId: "trovao" }, true, known, 4000);
  assertEquals([fired.fired, fired.state === state, fired.message("Ana")], ["trovao", true, ""]);

  state = applySceneOp(state, { type: "audio:set", cardId: "trovao", slot: 2, volume: 150 }, true).state;
  assertEquals([cards()[3].audio?.slot, cards()[3].audio?.volume], [2, 100]);
  state = applySceneOp(state, { type: "audio:set", cardId: "fogo", slot: 2 }, true).state;
  assertEquals([cards()[0].audio?.slot, cards()[3].audio?.slot], [2, null]);
  assertThrows(() => applySceneOp(state, { type: "audio:set", cardId: "fogo", slot: 10 }, true), SceneError);

  // Mudar o modo para efeito para o som; a edição de título mantém o tipo e o áudio.
  state = applySceneOp(state, { type: "audio:set", cardId: "fogo", mode: "effect" }, true).state;
  assertEquals([cards()[0].audio?.playing, cards()[0].audio?.loop], [false, false]);
  state = applySceneOp(state, { type: "card:edit", cardId: "fogo", title: "Fogueira", text: "" }, true).state;
  assertEquals([cards()[0].kind, cards()[0].audio?.mode, cards()[0].mediaId], ["audio", "effect", "wav"]);

  // Trocar de cena e parar tudo silenciam; o estado lido de disco nunca volta tocando.
  state = applySceneOp(state, { type: "scene:create", id: "s2", name: "Outra" }, true).state;
  assertEquals(cards().some((c) => c.audio?.playing), false);
  state = applySceneOp(state, { type: "scene:activate", sceneId: state.scenes[0].id }, true).state;
  state = applySceneOp(state, { type: "audio:play", cardId: "tema" }, true, known, 5000).state;
  state = applySceneOp(state, { type: "audio:stopall" }, true).state;
  assertEquals(cards().some((c) => c.audio?.playing), false);
  state = applySceneOp(state, { type: "audio:play", cardId: "tema" }, true, known, 5000).state;
  assertEquals(normalizeSceneState(JSON.parse(JSON.stringify(state))).scenes[0].cards[1].audio?.playing, false);
});

Deno.test("cena: contador, temporizador, cronômetro e tabela", () => {
  let state = createSceneState();
  const add = (op: Record<string, unknown>) => {
    state = applySceneOp(state, { type: "card:add", text: "", ...op } as never, false).state;
  };
  const card = (id: string) => state.scenes[0].cards.find((c) => c.id === id)!;

  add({ id: "v", title: "Vidas", kind: "counter", value: 3, min: 0, max: 5 });
  assertEquals(card("v").counter, { value: 3, min: 0, max: 5 });
  state = applySceneOp(state, { type: "card:counter", cardId: "v", value: 9 }, false).state;
  assertEquals(card("v").counter?.value, 5);
  const low = applySceneOp(state, { type: "card:counter", cardId: "v", value: -4 }, false);
  assertEquals([low.state.scenes[0].cards[0].counter?.value, low.message("Ana")], [0, "Ana pôs Vidas em 0."]);
  state = applySceneOp(state, { type: "card:edit", cardId: "v", title: "Vidas", text: "", max: 3 }, false).state;
  assertEquals(card("v").counter, { value: 3, min: 0, max: 3 });

  add({ id: "t", title: "Ritual", kind: "timer", duration: 120 });
  assertEquals(card("t").timer, { mode: "down", duration: 120, running: false, startedAt: null, base: 0 });
  state = applySceneOp(state, { type: "card:timer", cardId: "t", action: "start" }, false, undefined, 1000).state;
  assertEquals([card("t").timer?.running, card("t").timer?.startedAt], [true, 1000]);
  assertThrows(() => applySceneOp(state, { type: "card:timer", cardId: "t", action: "start" }, false), SceneError);
  const paused = applySceneOp(state, { type: "card:timer", cardId: "t", action: "pause" }, false, undefined, 31000);
  assertEquals([paused.state.scenes[0].cards[1].timer?.base, paused.message("Ana")], [30, "Ana pausou o temporizador Ritual."]);
  assertThrows(() => applySceneOp(paused.state, { type: "card:timer", cardId: "t", action: "pause" }, false), SceneError);
  const zero = applySceneOp(paused.state, { type: "card:timer", cardId: "t", action: "reset" }, false);
  assertEquals(zero.state.scenes[0].cards[1].timer?.base, 0);
  // Um temporizador que acabou recomeça do zero ao iniciar.
  const done = { ...paused.state, scenes: [{ ...paused.state.scenes[0], cards: paused.state.scenes[0].cards.map((c) => c.id === "t" ? { ...c, timer: { ...c.timer!, base: 200 } } : c) }] };
  assertEquals(applySceneOp(done, { type: "card:timer", cardId: "t", action: "start" }, false, undefined, 5).state.scenes[0].cards[1].timer?.base, 0);

  add({ id: "c", title: "Tempo de cena", kind: "stopwatch" });
  assertEquals(card("c").timer?.mode, "up");
  // A duração só vale para o temporizador; no cronômetro é ignorada.
  state = applySceneOp(state, { type: "card:edit", cardId: "c", title: "Tempo", text: "", duration: 10 }, false).state;
  assertEquals(card("c").timer?.duration, 0);

  assertThrows(() => applySceneOp(state, { type: "card:add", id: "x", title: "Vazia", text: "", kind: "table", entries: ["só uma"] }, false), SceneError);
  add({ id: "tb", title: "Encontro", kind: "table", entries: ["Lobo", " ", "Bandido", "Nada"] });
  assertEquals(card("tb").table, { entries: ["Lobo", "Bandido", "Nada"], last: null });
  const rolled = applySceneOp(state, { type: "card:roll", cardId: "tb" }, false, undefined, 0, () => 0.5);
  assertEquals([rolled.state.scenes[0].cards[3].table?.last, rolled.message("Ana")], [1, "Ana sorteou em Encontro: Bandido."]);
  assertEquals(applySceneOp(state, { type: "card:roll", cardId: "tb" }, false, undefined, 0, () => 0.9999).state.scenes[0].cards[3].table?.last, 2);
  assertThrows(() => applySceneOp(state, { type: "card:roll", cardId: "v" }, false), SceneError);

  // Estado lido de disco: nada continua rodando.
  const running = applySceneOp(state, { type: "card:timer", cardId: "c", action: "start" }, false, undefined, Date.now() - 5000).state;
  const loaded = normalizeSceneState(JSON.parse(JSON.stringify(running))).scenes[0].cards[2].timer!;
  assertEquals([loaded.running, loaded.startedAt, loaded.base >= 5], [false, null, true]);
});

Deno.test("turnos: manual, iniciativa e pipoca", () => {
  let state = createSceneState();
  const op = (o: Record<string, unknown>, isHost = true, actor = "Ana", rng = () => 0.5) => {
    const result = applySceneOp(state, { cardId: "t", ...o } as never, isHost, undefined, 0, rng, actor);
    state = result.state;
    return result.message(actor);
  };
  const turns = () => state.scenes[0].cards[0].turns!;
  state = applySceneOp(state, { type: "scene:editors", editors: "host" }, true).state;
  state = applySceneOp(state, { type: "card:add", id: "t", title: "Combate", text: "", kind: "turns" }, true).state;
  const add = (id: string, name: string, owner: string | null) => op({ type: "turns:add", entryId: id, name, owner });
  add("a", "Ana", "Ana");
  add("b", "Bia", "Bia");
  add("g", "Goblin", null);
  assertEquals(turns().entries.map((e) => e.id), ["a", "b", "g"]);

  // Manual: reordena na mão e passa em sequência; a rodada vira quando volta ao primeiro.
  op({ type: "turns:move", entryId: "g", direction: -1 });
  assertEquals(turns().entries.map((e) => e.id), ["a", "g", "b"]);
  assertThrows(() => op({ type: "turns:move", entryId: "a", direction: -1 }), SceneError);
  assertEquals(op({ type: "turns:next" }), "Turno de Ana.");
  assertEquals(op({ type: "turns:next" }), "Turno de Goblin.");
  assertThrows(() => op({ type: "turns:next" }, false, "Bia"), SceneError); // Bia não está na vez
  assertEquals(op({ type: "turns:next" }, true), "Turno de Bia.");
  assertEquals(op({ type: "turns:next" }, false, "Bia"), "Rodada 2. Turno de Ana.");
  assertThrows(() => op({ type: "turns:pick", entryId: "b" }), SceneError); // só no pipoca

  // Iniciativa: ordena do maior ao menor, rola quem está sem valor.
  op({ type: "turns:system", system: "initiative", count: 2, sides: 6 });
  assertEquals([turns().current, turns().round], [null, 1]);
  op({ type: "turns:value", entryId: "b", value: 15 });
  op({ type: "turns:value", entryId: "a", value: 9 });
  assertEquals(turns().entries.map((e) => e.id), ["b", "a", "g"]);
  assertEquals(op({ type: "turns:roll" }, true, "Ana", () => 0.5), "Ana rolou a iniciativa: Goblin, 8.");
  assertEquals(turns().entries.map((e) => e.id), ["b", "a", "g"]);
  assertThrows(() => op({ type: "turns:roll" }), SceneError);
  assertThrows(() => op({ type: "turns:move", entryId: "a", direction: 1 }), SceneError);

  // Pipoca: quem está na vez escolhe o próximo; ao todos jogarem, a rodada recomeça.
  op({ type: "turns:system", system: "popcorn" });
  assertThrows(() => op({ type: "turns:pick", entryId: "a" }, false, "Ana"), SceneError); // sem vez ainda: só o anfitrião
  assertEquals(op({ type: "turns:pick", entryId: "a" }), "Turno de Ana.");
  assertThrows(() => op({ type: "turns:pick", entryId: "b" }, false, "Bia"), SceneError); // Bia não está na vez
  assertThrows(() => op({ type: "turns:pick", entryId: "a" }, false, "Ana"), SceneError); // não pode a si mesma
  assertEquals(op({ type: "turns:pick", entryId: "b" }, false, "Ana"), "Ana passou o turno para Bia.");
  assertThrows(() => op({ type: "turns:pick", entryId: "a" }, false, "Bia"), SceneError); // Ana já jogou
  assertEquals(op({ type: "turns:pick", entryId: "g" }, false, "Bia"), "Bia passou o turno para Goblin.");
  assertEquals(turns().entries.every((e) => e.done), true);
  // O Goblin é PNJ: o anfitrião escolhe por ele e a rodada recomeça.
  assertThrows(() => op({ type: "turns:pick", entryId: "a" }, false, "Ana"), SceneError);
  assertEquals(op({ type: "turns:pick", entryId: "a" }, true, "Ana"), "Todos jogaram. Rodada 2. Ana passou o turno para Ana.");
  assertEquals([turns().round, turns().current, turns().entries.map((e) => e.done)], [2, "a", [false, true, false]]);

  op({ type: "turns:remove", entryId: "a" });
  assertEquals(turns().current, null);
  op({ type: "turns:reset" });
  assertEquals([turns().round, turns().entries.length], [1, 2]);
});

Deno.test("votação: votos secretos enquanto aberta, resultado ao encerrar", () => {
  let state = createSceneState();
  const run = (o: Record<string, unknown>, isHost: boolean, actor: string) => {
    const result = applySceneOp(state, { cardId: "p", ...o } as never, isHost, undefined, 0, undefined, actor);
    state = result.state;
    return result.message(actor);
  };
  state = applySceneOp(state, { type: "card:add", id: "p", title: "Onde vamos?", text: "", kind: "poll", entries: ["Norte", "Sul", " "], anonymous: false }, true).state;
  const poll = () => state.scenes[0].cards[0].poll!;
  assertEquals(poll().options.map((o) => o.text), ["Norte", "Sul"]);
  assertThrows(() => applySceneOp(state, { type: "card:add", id: "q", title: "x", text: "", kind: "poll", entries: ["só"] }, true), SceneError);

  assertEquals(run({ type: "poll:vote", optionId: "o1" }, false, "Bia"), "Bia votou em Onde vamos?.");
  run({ type: "poll:vote", optionId: "o2" }, false, "Caio");
  run({ type: "poll:vote", optionId: "o1" }, true, "Ana");
  run({ type: "poll:vote", optionId: "o2" }, false, "Caio"); // trocar o voto não conta duas vezes
  assertEquals(poll().total, 3);
  assertThrows(() => run({ type: "poll:vote", optionId: "o9" }, false, "Bia"), SceneError);
  assertThrows(() => run({ type: "poll:state", open: false }, false, "Bia"), SceneError);

  // Aberta: cada um vê só o seu voto e o total; nem o anfitrião vê os dos outros.
  const bia = sceneFor(state, false, "Bia").scenes[0].cards[0].poll!;
  assertEquals([bia.votes, bia.total], [{ o1: undefined, Bia: "o1" }.Bia ? { Bia: "o1" } : {}, 3]);
  assertEquals(sceneFor(state, true, "Ana").scenes[0].cards[0].poll!.votes, { Ana: "o1" });
  assertEquals(sceneFor(state, false, "Dani").scenes[0].cards[0].poll!.votes, {});

  const closed = run({ type: "poll:state", open: false }, true, "Ana");
  assertEquals(closed, "Votação Onde vamos? encerrada, 3 votos. Norte, 2 votos; Sul, 1 voto.");
  assertThrows(() => run({ type: "poll:vote", optionId: "o1" }, false, "Dani"), SceneError);
  assertEquals(Object.keys(sceneFor(state, false, "Dani").scenes[0].cards[0].poll!.votes).sort(), ["Ana", "Bia", "Caio"]);

  // Anônima: o resultado aparece sem nomes.
  state = applySceneOp(state, { type: "card:add", id: "s", title: "Segredo", text: "", kind: "poll", entries: ["Sim", "Não"], anonymous: true }, true).state;
  state = applySceneOp(state, { type: "poll:vote", cardId: "s", optionId: "o1" }, false, undefined, 0, undefined, "Bia").state;
  state = applySceneOp(state, { type: "poll:state", cardId: "s", open: false }, true).state;
  const secret = sceneFor(state, false, "Bia").scenes[0].cards[1].poll!;
  assertEquals(Object.keys(secret.votes), ["voto 1"]);

  run({ type: "poll:reset" }, true, "Ana");
  assertEquals([poll().open, poll().total], [true, 0]);
});

Deno.test("lista de verificação: marcar, editar e remover itens", () => {
  let state = createSceneState();
  state = applySceneOp(state, { type: "card:add", id: "l", title: "Suprimentos", text: "", kind: "checklist", entries: ["Água", "Corda"] }, true).state;
  const items = () => state.scenes[0].cards[0].checklist!.items;
  assertEquals(items().map((i) => i.text), ["Água", "Corda"]);
  const toggled = applySceneOp(state, { type: "check:toggle", cardId: "l", itemId: "i1" }, false);
  assertEquals([toggled.state.scenes[0].cards[0].checklist!.items[0].done, toggled.message("Ana")], [true, "Ana marcou Água em Suprimentos."]);
  state = toggled.state;
  assertEquals(applySceneOp(state, { type: "check:toggle", cardId: "l", itemId: "i1" }, false).message("Ana"), "Ana desmarcou Água em Suprimentos.");
  state = applySceneOp(state, { type: "check:add", cardId: "l", itemId: "x", text: "Tocha" }, false).state;
  state = applySceneOp(state, { type: "check:edit", cardId: "l", itemId: "x", text: "Tochas" }, false).state;
  state = applySceneOp(state, { type: "check:remove", cardId: "l", itemId: "i2" }, false).state;
  assertEquals(items().map((i) => i.text), ["Água", "Tochas"]);
  assertThrows(() => applySceneOp(state, { type: "check:add", cardId: "l", itemId: "y", text: " " }, false), SceneError);
  state = applySceneOp(state, { type: "scene:editors", editors: "host" }, true).state;
  assertThrows(() => applySceneOp(state, { type: "check:toggle", cardId: "l", itemId: "i1" }, false), SceneError);
  // Estado guardado volta intacto.
  assertEquals(normalizeSceneState(JSON.parse(JSON.stringify(state))).scenes[0].cards[0].checklist, state.scenes[0].cards[0].checklist);
});
