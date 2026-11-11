/** Cena: uma lista ordenada de cards (título e texto). Uma cena fica ativa por vez na mesa. */

export interface SceneCard {
  id: string;
  title: string;
  text: string;
  /** Oculto: só o anfitrião vê; o servidor não envia o card aos jogadores. */
  hidden: boolean;
}

export interface Scene {
  id: string;
  name: string;
  cards: SceneCard[];
}

/** Quem pode mexer nos cards. Criar, trocar e excluir cenas é sempre do anfitrião. */
export type SceneEditors = "host" | "everyone";

export interface SceneState {
  scenes: Scene[];
  activeId: string;
  editors: SceneEditors;
}

export type SceneOp =
  | { type: "scene:create"; id: string; name: string }
  | { type: "scene:rename"; sceneId: string; name: string }
  | { type: "scene:activate"; sceneId: string }
  | { type: "scene:delete"; sceneId: string }
  | { type: "scene:editors"; editors: SceneEditors }
  | { type: "card:add"; id: string; title: string; text: string }
  | { type: "card:edit"; cardId: string; title: string; text: string }
  | { type: "card:remove"; cardId: string }
  /** Só o anfitrião. Revelar um card oculto é anunciado; ocultar não. */
  | { type: "card:visibility"; cardId: string; hidden: boolean }
  /** `direction` -1 sobe, 1 desce, dentro da cena ativa. */
  | { type: "card:move"; cardId: string; direction: -1 | 1 };

export const SCENE_OP_TYPES = [
  "scene:create",
  "scene:rename",
  "scene:activate",
  "scene:delete",
  "scene:editors",
  "card:add",
  "card:edit",
  "card:remove",
  "card:visibility",
  "card:move",
];

export const MAX_SCENES = 30;
export const MAX_CARDS = 100;
const MAX_NAME = 80;
const MAX_TITLE = 120;
const MAX_TEXT = 2000;

export class SceneError extends Error {}

export function createSceneState(): SceneState {
  const scene: Scene = { id: crypto.randomUUID(), name: "Cena 1", cards: [] };
  return { scenes: [scene], activeId: scene.id, editors: "everyone" };
}

export interface SceneResult {
  state: SceneState;
  /** Frase para o histórico da mesa; `who` é quem agiu. */
  message: (who: string) => string;
}

/** Aplica uma operação. Lança SceneError se não for permitida ou for inválida. */
export function applySceneOp(state: SceneState, op: SceneOp, isHost: boolean): SceneResult {
  const hostOnly = () => {
    if (!isHost) throw new SceneError("Só o anfitrião faz isso.");
  };
  const cardEdit = () => {
    if (!isHost && state.editors !== "everyone") {
      throw new SceneError("Só o anfitrião mexe nos cards desta mesa.");
    }
  };
  const active = state.scenes.find((s) => s.id === state.activeId);
  if (!active) throw new SceneError("Não há cena ativa.");
  const withActive = (cards: SceneCard[]): SceneState => ({
    ...state,
    scenes: state.scenes.map((s) => (s.id === active.id ? { ...s, cards } : s)),
  });
  const sceneById = (id: string): Scene => {
    const scene = state.scenes.find((s) => s.id === id);
    if (!scene) throw new SceneError("Cena não encontrada.");
    return scene;
  };
  const cardById = (id: string): SceneCard => {
    const card = active.cards.find((c) => c.id === id && (isHost || !c.hidden));
    if (!card) throw new SceneError("Card não encontrado.");
    return card;
  };

  switch (op.type) {
    case "scene:create": {
      hostOnly();
      if (state.scenes.length >= MAX_SCENES) throw new SceneError(`Limite de ${MAX_SCENES} cenas.`);
      if (state.scenes.some((s) => s.id === op.id)) throw new SceneError("Já existe uma cena com esse id.");
      const name = cleanName(op.name);
      return {
        state: { ...state, scenes: [...state.scenes, { id: op.id, name, cards: [] }], activeId: op.id },
        message: (who) => `${who} criou a cena ${name}.`,
      };
    }
    case "scene:rename": {
      hostOnly();
      const scene = sceneById(op.sceneId);
      const name = cleanName(op.name);
      return {
        state: { ...state, scenes: state.scenes.map((s) => (s.id === scene.id ? { ...s, name } : s)) },
        message: (who) => `${who} renomeou a cena ${scene.name} para ${name}.`,
      };
    }
    case "scene:activate": {
      hostOnly();
      const scene = sceneById(op.sceneId);
      return { state: { ...state, activeId: scene.id }, message: () => `A cena agora é ${scene.name}.` };
    }
    case "scene:delete": {
      hostOnly();
      const scene = sceneById(op.sceneId);
      if (state.scenes.length === 1) throw new SceneError("A mesa precisa de ao menos uma cena.");
      const scenes = state.scenes.filter((s) => s.id !== scene.id);
      const activeId = scene.id === state.activeId ? scenes[0].id : state.activeId;
      return {
        state: { ...state, scenes, activeId },
        message: (who) => `${who} excluiu a cena ${scene.name}.`,
      };
    }
    case "scene:editors": {
      hostOnly();
      if (op.editors !== "host" && op.editors !== "everyone") throw new SceneError("Opção inválida.");
      return {
        state: { ...state, editors: op.editors },
        message: () =>
          op.editors === "host" ? "Só o anfitrião edita os cards." : "Todos podem editar os cards.",
      };
    }
    case "card:add": {
      cardEdit();
      if (active.cards.length >= MAX_CARDS) throw new SceneError(`Limite de ${MAX_CARDS} cards.`);
      if (active.cards.some((c) => c.id === op.id)) throw new SceneError("Já existe um card com esse id.");
      const card = cleanCard(op.id, op.title, op.text);
      return {
        state: withActive([...active.cards, card]),
        message: (who) => `${who} adicionou o card ${card.title}.`,
      };
    }
    case "card:edit": {
      cardEdit();
      const old = cardById(op.cardId);
      const card = { ...cleanCard(old.id, op.title, op.text), hidden: old.hidden };
      return {
        state: withActive(active.cards.map((c) => (c.id === old.id ? card : c))),
        message: (who) => card.hidden ? "" : `${who} editou o card ${card.title}.`,
      };
    }
    case "card:remove": {
      cardEdit();
      const card = cardById(op.cardId);
      return {
        state: withActive(active.cards.filter((c) => c.id !== card.id)),
        message: (who) => card.hidden ? "" : `${who} removeu o card ${card.title}.`,
      };
    }
    case "card:visibility": {
      hostOnly();
      const card = cardById(op.cardId);
      const hidden = op.hidden === true;
      if (card.hidden === hidden) throw new SceneError(hidden ? "O card já está oculto." : "O card já está revelado.");
      return {
        state: withActive(active.cards.map((c) => (c.id === card.id ? { ...c, hidden } : c))),
        message: (who) => hidden ? "" : `${who} revelou o card ${card.title}.`,
      };
    }
    case "card:move": {
      cardEdit();
      const card = cardById(op.cardId);
      const step = op.direction < 0 ? -1 : 1;
      const index = active.cards.indexOf(card);
      // Troca com o vizinho mais próximo que quem move enxerga, para que a posição mude para todos.
      let target = index + step;
      while (!isHost && active.cards[target]?.hidden) target += step;
      if (target < 0 || target >= active.cards.length) throw new SceneError("O card já está no limite da lista.");
      const cards = [...active.cards];
      [cards[index], cards[target]] = [cards[target], cards[index]];
      return { state: withActive(cards), message: () => "" };
    }
  }
}

function cleanName(raw: string): string {
  return (typeof raw === "string" ? raw : "").trim().slice(0, MAX_NAME) || "Cena sem nome";
}

function cleanCard(id: string, title: unknown, text: unknown): SceneCard {
  const cleanTitle = (typeof title === "string" ? title : "").trim().slice(0, MAX_TITLE);
  const cleanText = (typeof text === "string" ? text : "").trim().slice(0, MAX_TEXT);
  if (!cleanTitle && !cleanText) throw new SceneError("O card precisa de título ou texto.");
  return { id, title: cleanTitle || "Sem título", text: cleanText, hidden: false };
}

/** A cena como o destinatário pode vê-la: jogadores não recebem cards ocultos. */
export function sceneFor(state: SceneState, isHost: boolean): SceneState {
  if (isHost) return state;
  return {
    ...state,
    scenes: state.scenes.map((s) => ({ ...s, cards: s.cards.filter((c) => !c.hidden) })),
  };
}

/** Valida o estado lido de disco; devolve um estado inicial se estiver corrompido. */
export function normalizeSceneState(value: unknown): SceneState {
  const raw = value as Partial<SceneState> | null;
  if (!raw || !Array.isArray(raw.scenes) || raw.scenes.length === 0) return createSceneState();
  const scenes: Scene[] = [];
  for (const item of raw.scenes as unknown as Array<Record<string, unknown>>) {
    if (typeof item?.id !== "string" || !Array.isArray(item.cards)) continue;
    const cards: SceneCard[] = [];
    for (const card of item.cards as unknown as Array<Record<string, unknown>>) {
      if (typeof card?.id !== "string") continue;
      cards.push({
        id: card.id,
        title: typeof card.title === "string" ? card.title : "Sem título",
        text: typeof card.text === "string" ? card.text : "",
        hidden: card.hidden === true,
      });
    }
    scenes.push({ id: item.id, name: typeof item.name === "string" ? item.name : "Cena", cards });
  }
  if (scenes.length === 0) return createSceneState();
  const activeId = scenes.some((s) => s.id === raw.activeId) ? raw.activeId as string : scenes[0].id;
  return { scenes, activeId, editors: raw.editors === "host" ? "host" : "everyone" };
}
