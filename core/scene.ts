/**
 * Cena: um fundo, um grid pequeno que só desenha zonas nomeadas e uma lista ordenada de cards.
 * Um card sem zona fica na coluna de cards soltos; com zona, aparece como token nela.
 * Uma cena fica ativa por vez na mesa.
 */

export type CardKind = "note" | "image" | "clock";
export const CARD_KINDS: CardKind[] = ["note", "image", "clock"];

export interface SceneCard {
  id: string;
  title: string;
  /** Para uma imagem, é a descrição que o leitor de tela fala. */
  text: string;
  /** Oculto: só o anfitrião vê; o servidor não envia o card aos jogadores. */
  hidden: boolean;
  kind: CardKind;
  /** Imagem guardada no servidor (id da mídia). */
  mediaId: string | null;
  /** Só em relógios: segmentos totais e preenchidos. */
  clock: { segments: number; filled: number } | null;
  /** Zona onde o card está; `null` é a coluna de cards soltos. */
  zoneId: string | null;
}

export interface GridCell {
  x: number;
  y: number;
}

export interface GridSize {
  cols: number;
  rows: number;
}

/** Uma área nomeada do grid, de uma ou mais células. Nenhuma célula é de duas zonas. */
export interface Zone {
  id: string;
  name: string;
  description: string;
  cells: GridCell[];
}

export interface Scene {
  id: string;
  name: string;
  /** Texto lido ao entrar na cena: o que quem não vê a imagem precisa saber. */
  description: string;
  background: string | null;
  grid: GridSize;
  zones: Zone[];
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
  | { type: "scene:describe"; sceneId: string; description: string }
  /** `mediaId: null` tira o fundo. */
  | { type: "scene:background"; sceneId: string; mediaId: string | null }
  /** Células fora do novo tamanho saem das zonas. */
  | { type: "scene:grid"; sceneId: string; cols: number; rows: number }
  | { type: "zone:add"; id: string; name: string; description: string; cells: GridCell[] }
  | { type: "zone:edit"; zoneId: string; name: string; description: string; cells: GridCell[] }
  | { type: "zone:remove"; zoneId: string }
  | {
    type: "card:add";
    id: string;
    title: string;
    text: string;
    kind?: CardKind;
    mediaId?: string | null;
    segments?: number;
    zoneId?: string | null;
  }
  /** `mediaId` e `segments` ausentes mantêm o que o card já tem. */
  | { type: "card:edit"; cardId: string; title: string; text: string; mediaId?: string | null; segments?: number }
  | { type: "card:remove"; cardId: string }
  /** Põe o card numa zona (token) ou o solta na coluna (`zoneId: null`). */
  | { type: "card:place"; cardId: string; zoneId: string | null }
  | { type: "card:clock"; cardId: string; filled: number }
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
  "scene:describe",
  "scene:background",
  "scene:grid",
  "zone:add",
  "zone:edit",
  "zone:remove",
  "card:add",
  "card:edit",
  "card:remove",
  "card:place",
  "card:clock",
  "card:visibility",
  "card:move",
];

export const MAX_SCENES = 30;
export const MAX_CARDS = 100;
export const MAX_ZONES = 30;
export const MAX_COLS = 24;
export const MAX_ROWS = 16;
export const DEFAULT_GRID: GridSize = { cols: 8, rows: 6 };
export const MAX_SEGMENTS = 12;
const MAX_NAME = 80;
const MAX_TITLE = 120;
const MAX_TEXT = 2000;

export class SceneError extends Error {}

export function newScene(id: string, name: string): Scene {
  return { id, name, description: "", background: null, grid: { ...DEFAULT_GRID }, zones: [], cards: [] };
}

export function createSceneState(): SceneState {
  const scene = newScene(crypto.randomUUID(), "Cena 1");
  return { scenes: [scene], activeId: scene.id, editors: "everyone" };
}

export interface SceneResult {
  state: SceneState;
  /** Frase para o histórico da mesa; `who` é quem agiu. */
  message: (who: string) => string;
}

/** Aplica uma operação. Lança SceneError se não for permitida ou for inválida. */
export function applySceneOp(
  state: SceneState,
  op: SceneOp,
  isHost: boolean,
  /** Diz se uma mídia existe na mesa; o servidor passa a sua lista. */
  hasMedia: (id: string) => boolean = () => true,
): SceneResult {
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
  const patchScene = (id: string, patch: Partial<Scene>): SceneState => ({
    ...state,
    scenes: state.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  });
  const withActive = (cards: SceneCard[]): SceneState => patchScene(active.id, { cards });
  const media = (id: unknown): string | null => {
    if (id === null || id === undefined) return null;
    if (typeof id !== "string" || !hasMedia(id)) throw new SceneError("Imagem não encontrada na mesa.");
    return id;
  };
  const zoneById = (id: string): Zone => {
    const zone = active.zones.find((z) => z.id === id);
    if (!zone) throw new SceneError("Zona não encontrada.");
    return zone;
  };
  const zoneIdOrNull = (id: unknown): string | null => (id === null || id === undefined ? null : zoneById(String(id)).id);
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
        state: { ...state, scenes: [...state.scenes, newScene(op.id, name)], activeId: op.id },
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
    case "scene:describe": {
      hostOnly();
      const scene = sceneById(op.sceneId);
      const description = cleanText(op.description);
      return {
        state: patchScene(scene.id, { description }),
        message: (who) => `${who} descreveu a cena ${scene.name}.`,
      };
    }
    case "scene:background": {
      hostOnly();
      const scene = sceneById(op.sceneId);
      const background = media(op.mediaId);
      return {
        state: patchScene(scene.id, { background }),
        message: (who) => background ? `${who} trocou o fundo da cena ${scene.name}.` : `${who} tirou o fundo da cena ${scene.name}.`,
      };
    }
    case "scene:grid": {
      hostOnly();
      const scene = sceneById(op.sceneId);
      const grid = {
        cols: clampInt(op.cols, 1, MAX_COLS),
        rows: clampInt(op.rows, 1, MAX_ROWS),
      };
      const inside = (c: GridCell) => c.x < grid.cols && c.y < grid.rows;
      const zones = scene.zones.map((z) => ({ ...z, cells: z.cells.filter(inside) })).filter((z) => z.cells.length > 0);
      const kept = new Set(zones.map((z) => z.id));
      const cards = scene.cards.map((c) => (c.zoneId !== null && !kept.has(c.zoneId) ? { ...c, zoneId: null } : c));
      return {
        state: patchScene(scene.id, { grid, zones, cards }),
        message: (who) => `${who} mudou o grid da cena ${scene.name} para ${grid.cols} por ${grid.rows}.`,
      };
    }
    case "zone:add": {
      hostOnly();
      if (active.zones.length >= MAX_ZONES) throw new SceneError(`Limite de ${MAX_ZONES} zonas.`);
      if (active.zones.some((z) => z.id === op.id)) throw new SceneError("Já existe uma zona com esse id.");
      const zone = cleanZone(active, op.id, op.name, op.description, op.cells);
      return {
        state: patchScene(active.id, { zones: [...active.zones, zone] }),
        message: (who) => `${who} criou a zona ${zone.name}.`,
      };
    }
    case "zone:edit": {
      hostOnly();
      const old = zoneById(op.zoneId);
      const zone = cleanZone(active, old.id, op.name, op.description, op.cells);
      return {
        state: patchScene(active.id, { zones: active.zones.map((z) => (z.id === old.id ? zone : z)) }),
        message: (who) => `${who} editou a zona ${zone.name}.`,
      };
    }
    case "zone:remove": {
      hostOnly();
      const zone = zoneById(op.zoneId);
      return {
        state: patchScene(active.id, {
          zones: active.zones.filter((z) => z.id !== zone.id),
          cards: active.cards.map((c) => (c.zoneId === zone.id ? { ...c, zoneId: null } : c)),
        }),
        message: (who) => `${who} removeu a zona ${zone.name}.`,
      };
    }
    case "card:add": {
      cardEdit();
      if (active.cards.length >= MAX_CARDS) throw new SceneError(`Limite de ${MAX_CARDS} cards.`);
      if (active.cards.some((c) => c.id === op.id)) throw new SceneError("Já existe um card com esse id.");
      const kind = op.kind ?? "note";
      if (!CARD_KINDS.includes(kind)) throw new SceneError("Tipo de card inválido.");
      const card = {
        ...cleanCard(op.id, op.title, op.text),
        kind,
        mediaId: kind === "image" ? media(op.mediaId) : null,
        clock: kind === "clock" ? { segments: clampInt(op.segments ?? 6, 2, MAX_SEGMENTS), filled: 0 } : null,
        zoneId: zoneIdOrNull(op.zoneId),
      };
      if (kind === "image" && !card.mediaId) throw new SceneError("Escolha a imagem do card.");
      return {
        state: withActive([...active.cards, card]),
        message: (who) => `${who} adicionou o card ${card.title}.`,
      };
    }
    case "card:edit": {
      cardEdit();
      const old = cardById(op.cardId);
      const card: SceneCard = {
        ...old,
        ...cleanCard(old.id, op.title, op.text),
        hidden: old.hidden,
      };
      if (old.kind === "image" && op.mediaId !== undefined) card.mediaId = media(op.mediaId) ?? old.mediaId;
      if (old.clock && op.segments !== undefined) {
        const segments = clampInt(op.segments, 2, MAX_SEGMENTS);
        card.clock = { segments, filled: Math.min(old.clock.filled, segments) };
      }
      return {
        state: withActive(active.cards.map((c) => (c.id === old.id ? card : c))),
        message: (who) => card.hidden ? "" : `${who} editou o card ${card.title}.`,
      };
    }
    case "card:place": {
      cardEdit();
      const card = cardById(op.cardId);
      const zoneId = zoneIdOrNull(op.zoneId);
      const zone = zoneId === null ? null : zoneById(zoneId);
      return {
        state: withActive(active.cards.map((c) => (c.id === card.id ? { ...c, zoneId } : c))),
        message: (who) =>
          card.hidden ? "" : zone ? `${who} pôs ${card.title} na zona ${zone.name}.` : `${who} soltou ${card.title} da zona.`,
      };
    }
    case "card:clock": {
      cardEdit();
      const card = cardById(op.cardId);
      if (!card.clock) throw new SceneError("Esse card não é um relógio.");
      const filled = clampInt(op.filled, 0, card.clock.segments);
      const clock = { segments: card.clock.segments, filled };
      return {
        state: withActive(active.cards.map((c) => (c.id === card.id ? { ...c, clock } : c))),
        message: (who) => card.hidden ? "" : `${who} pôs o relógio ${card.title} em ${filled} de ${clock.segments}.`,
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
      // Troca com o vizinho mais próximo da mesma zona que quem move enxerga, para que a posição mude para todos.
      let target = index + step;
      while (active.cards[target] && (active.cards[target].zoneId !== card.zoneId || (!isHost && active.cards[target].hidden))) {
        target += step;
      }
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

function cleanText(raw: unknown): string {
  return (typeof raw === "string" ? raw : "").trim().slice(0, MAX_TEXT);
}

function clampInt(raw: unknown, min: number, max: number): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : min;
  return Math.min(max, Math.max(min, n));
}

/** Um card de nota, sem zona; quem chama ajusta o tipo, a mídia e o relógio. */
function cleanCard(id: string, title: unknown, text: unknown): SceneCard {
  const cleanTitle = (typeof title === "string" ? title : "").trim().slice(0, MAX_TITLE);
  const body = cleanText(text);
  if (!cleanTitle && !body) throw new SceneError("O card precisa de título ou texto.");
  return {
    id,
    title: cleanTitle || "Sem título",
    text: body,
    hidden: false,
    kind: "note",
    mediaId: null,
    clock: null,
    zoneId: null,
  };
}

/** Uma zona válida para a cena; recusa células fora do grid ou que já são de outra zona. */
function cleanZone(scene: Scene, id: string, name: unknown, description: unknown, cells: unknown): Zone {
  const title = (typeof name === "string" ? name : "").trim().slice(0, MAX_NAME);
  if (!title) throw new SceneError("A zona precisa de um nome.");
  if (!Array.isArray(cells) || cells.length === 0) throw new SceneError("A zona precisa de ao menos uma célula.");
  const taken = new Map<string, string>();
  for (const zone of scene.zones) {
    if (zone.id !== id) for (const c of zone.cells) taken.set(`${c.x},${c.y}`, zone.name);
  }
  const seen = new Set<string>();
  const clean: GridCell[] = [];
  for (const raw of cells as Array<Record<string, unknown>>) {
    const x = raw?.x;
    const y = raw?.y;
    if (!Number.isInteger(x) || !Number.isInteger(y)) throw new SceneError("Célula inválida.");
    const cx = x as number;
    const cy = y as number;
    if (cx < 0 || cy < 0 || cx >= scene.grid.cols || cy >= scene.grid.rows) {
      throw new SceneError("Célula fora do grid.");
    }
    const key = `${cx},${cy}`;
    const owner = taken.get(key);
    if (owner) throw new SceneError(`A célula ${cx + 1}, ${cy + 1} já é da zona ${owner}.`);
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push({ x: cx, y: cy });
  }
  clean.sort((a, b) => a.y - b.y || a.x - b.x);
  return { id, name: title, description: cleanText(description), cells: clean };
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
    const grid = {
      cols: clampInt((item.grid as GridSize | undefined)?.cols ?? DEFAULT_GRID.cols, 1, MAX_COLS),
      rows: clampInt((item.grid as GridSize | undefined)?.rows ?? DEFAULT_GRID.rows, 1, MAX_ROWS),
    };
    const scene: Scene = {
      ...newScene(item.id, typeof item.name === "string" ? item.name : "Cena"),
      description: cleanText(item.description),
      background: typeof item.background === "string" ? item.background : null,
      grid,
    };
    for (const z of Array.isArray(item.zones) ? item.zones as Array<Record<string, unknown>> : []) {
      if (typeof z?.id !== "string") continue;
      try {
        scene.zones.push(cleanZone(scene, z.id, z.name, z.description, z.cells));
      } catch (error) {
        if (!(error instanceof SceneError)) throw error;
      }
    }
    for (const card of item.cards as unknown as Array<Record<string, unknown>>) {
      if (typeof card?.id !== "string") continue;
      const kind = CARD_KINDS.includes(card.kind as CardKind) ? card.kind as CardKind : "note";
      const clock = card.clock as { segments?: number; filled?: number } | null | undefined;
      const segments = clampInt(clock?.segments ?? 6, 2, MAX_SEGMENTS);
      scene.cards.push({
        id: card.id,
        title: typeof card.title === "string" ? card.title : "Sem título",
        text: typeof card.text === "string" ? card.text : "",
        hidden: card.hidden === true,
        kind,
        mediaId: kind === "image" && typeof card.mediaId === "string" ? card.mediaId : null,
        clock: kind === "clock" ? { segments, filled: clampInt(clock?.filled ?? 0, 0, segments) } : null,
        zoneId: scene.zones.some((z) => z.id === card.zoneId) ? card.zoneId as string : null,
      });
    }
    scenes.push(scene);
  }
  if (scenes.length === 0) return createSceneState();
  const activeId = scenes.some((s) => s.id === raw.activeId) ? raw.activeId as string : scenes[0].id;
  return { scenes, activeId, editors: raw.editors === "host" ? "host" : "everyone" };
}
