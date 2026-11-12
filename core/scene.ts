import { defaultRng, type Rng } from "./rng.ts";
import {
  applyChecklist,
  applyPoll,
  applyTurns,
  type ChecklistOp,
  type ChecklistSpec,
  cleanChecklist,
  cleanPoll,
  cleanTurns,
  newChecklist,
  newPoll,
  newTurns,
  type PollOp,
  pollFor,
  type PollSpec,
  TURN_SYSTEMS,
  type TurnsOp,
  type TurnsSpec,
  type TurnSystem,
} from "./scene_kinds.ts";

export type { ChecklistSpec, PollSpec, TurnsSpec };

/**
 * Cena: um fundo, um grid pequeno que só desenha zonas nomeadas e uma lista ordenada de cards.
 * Um card sem zona fica na coluna de cards soltos; com zona, aparece como token nela.
 * Uma cena fica ativa por vez na mesa.
 */

export type CardKind =
  | "note"
  | "image"
  | "clock"
  | "audio"
  | "counter"
  | "timer"
  | "stopwatch"
  | "table"
  | "turns"
  | "poll"
  | "checklist";
export const CARD_KINDS: CardKind[] = [
  "note",
  "image",
  "clock",
  "audio",
  "counter",
  "timer",
  "stopwatch",
  "table",
  "turns",
  "poll",
  "checklist",
];

/**
 * Temporizador (conta para baixo até `duration`) ou cronômetro (conta para cima). O tempo corrido é
 * `base` mais, se estiver rodando, o que passou desde `startedAt` no relógio do servidor.
 */
export interface TimerSpec {
  mode: "down" | "up";
  /** Segundos; 0 no cronômetro. */
  duration: number;
  running: boolean;
  startedAt: number | null;
  /** Segundos já corridos até a última pausa. */
  base: number;
}

export interface CounterSpec {
  value: number;
  min: number;
  max: number;
}

/** Tabela aleatória: o sorteio é do servidor, e o último resultado fica no card. */
export interface TableSpec {
  entries: string[];
  last: number | null;
}

export const MAX_DURATION = 86400;
export const MAX_ENTRIES = 40;

/** Ambiência (loop, posicional se estiver numa zona), música (uma por vez) ou efeito (dispara e acaba). */
export type AudioMode = "ambient" | "music" | "effect";
export const AUDIO_MODES: AudioMode[] = ["ambient", "music", "effect"];

export interface AudioSpec {
  mode: AudioMode;
  /** De 0 a 100. */
  volume: number;
  loop: boolean;
  /** Efeitos nunca ficam tocando: só são disparados. */
  playing: boolean;
  /** Relógio do servidor (ms) de quando começou, para quem entra depois cair no ponto certo. */
  startedAt: number | null;
  /** Tecla de 1 a 9 do soundboard. */
  slot: number | null;
}

export interface SceneCard {
  id: string;
  title: string;
  /** Para uma imagem, é a descrição que o leitor de tela fala. */
  text: string;
  /** Oculto: só o anfitrião vê; o servidor não envia o card aos jogadores. */
  hidden: boolean;
  kind: CardKind;
  /** Imagem ou áudio guardado no servidor (id da mídia). */
  mediaId: string | null;
  /** Só em cards de áudio. */
  audio: AudioSpec | null;
  counter: CounterSpec | null;
  timer: TimerSpec | null;
  table: TableSpec | null;
  turns: TurnsSpec | null;
  poll: PollSpec | null;
  checklist: ChecklistSpec | null;
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
  /** Traz uma cena de arquivo; a mídia que ela usa já deve estar na mesa. */
  | { type: "scene:import"; id: string; scene: unknown }
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
    mode?: AudioMode;
    zoneId?: string | null;
    /** Contador: valor inicial, mínimo e máximo. */
    value?: number;
    min?: number;
    max?: number;
    /** Temporizador, em segundos. */
    duration?: number;
    /** Tabela aleatória, opções da votação ou itens iniciais da lista. */
    entries?: string[];
    /** Ordem de turnos. */
    system?: TurnSystem;
    /** Votação sem nomes no resultado. */
    anonymous?: boolean;
  }
  /** Campos ausentes mantêm o que o card já tem. */
  | {
    type: "card:edit";
    cardId: string;
    title: string;
    text: string;
    mediaId?: string | null;
    segments?: number;
    min?: number;
    max?: number;
    duration?: number;
    entries?: string[];
  }
  | { type: "card:counter"; cardId: string; value: number }
  | { type: "card:timer"; cardId: string; action: "start" | "pause" | "reset" }
  /** Sorteia uma entrada da tabela. */
  | { type: "card:roll"; cardId: string }
  | ({ cardId: string } & TurnsOp)
  | ({ cardId: string } & PollOp)
  | ({ cardId: string } & ChecklistOp)
  | { type: "card:remove"; cardId: string }
  /** Põe o card numa zona (token) ou o solta na coluna (`zoneId: null`). */
  | { type: "card:place"; cardId: string; zoneId: string | null }
  | { type: "card:clock"; cardId: string; filled: number }
  /** Só o anfitrião controla o áudio. Efeitos disparam sem mudar o estado. */
  | { type: "audio:play"; cardId: string }
  | { type: "audio:stop"; cardId: string }
  | { type: "audio:stopall" }
  | { type: "audio:set"; cardId: string; volume?: number; loop?: boolean; mode?: AudioMode; slot?: number | null }
  /** Só o anfitrião. Revelar um card oculto é anunciado; ocultar não. */
  | { type: "card:visibility"; cardId: string; hidden: boolean }
  /** `direction` -1 sobe, 1 desce, dentro da cena ativa. */
  | { type: "card:move"; cardId: string; direction: -1 | 1 };

export const SCENE_OP_TYPES = [
  "scene:create",
  "scene:import",
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
  "card:counter",
  "card:timer",
  "card:roll",
  "turns:add",
  "turns:remove",
  "turns:move",
  "turns:value",
  "turns:roll",
  "turns:system",
  "turns:next",
  "turns:pick",
  "turns:reset",
  "poll:vote",
  "poll:state",
  "poll:reset",
  "check:add",
  "check:toggle",
  "check:edit",
  "check:remove",
  "audio:play",
  "audio:stop",
  "audio:stopall",
  "audio:set",
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
  /** Um efeito foi disparado: o servidor avisa todos, sem guardar nada. */
  fired?: string;
}

/** Aplica uma operação. Lança SceneError se não for permitida ou for inválida. */
export function applySceneOp(
  state: SceneState,
  op: SceneOp,
  isHost: boolean,
  /** Diz se uma mídia existe na mesa; o servidor passa a sua lista. */
  hasMedia: (id: string, kind: "image" | "audio") => boolean = () => true,
  /** Relógio do servidor em ms; vira o `startedAt` de quem começa a tocar. */
  now: number = Date.now(),
  rng: Rng = defaultRng,
  /** Nome de quem pediu; votos e turnos dependem dele. */
  actor: string = "",
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
  const media = (id: unknown, kind: "image" | "audio" = "image"): string | null => {
    if (id === null || id === undefined) return null;
    if (typeof id !== "string" || !hasMedia(id, kind)) {
      throw new SceneError(kind === "image" ? "Imagem não encontrada na mesa." : "Áudio não encontrado na mesa.");
    }
    return id;
  };
  const audioCard = (id: string): SceneCard & { audio: AudioSpec } => {
    const card = cardById(id);
    if (!card.audio) throw new SceneError("Esse card não é um áudio.");
    return card as SceneCard & { audio: AudioSpec };
  };
  const patchAudio = (id: string, patch: Partial<AudioSpec>): SceneState =>
    withActive(active.cards.map((c) => (c.id === id && c.audio ? { ...c, audio: { ...c.audio, ...patch } } : c)));
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
      const leaving = patchScene(active.id, { cards: active.cards.map(stopped) });
      return {
        state: { ...leaving, scenes: [...leaving.scenes, newScene(op.id, name)], activeId: op.id },
        message: (who) => `${who} criou a cena ${name}.`,
      };
    }
    case "scene:import": {
      hostOnly();
      if (state.scenes.length >= MAX_SCENES) throw new SceneError(`Limite de ${MAX_SCENES} cenas.`);
      if (state.scenes.some((s) => s.id === op.id)) throw new SceneError("Já existe uma cena com esse id.");
      const raw = op.scene as Record<string, unknown> | null;
      if (typeof raw !== "object" || raw === null || !Array.isArray(raw.cards)) {
        throw new SceneError("Arquivo de cena inválido.");
      }
      const imported = normalizeSceneState({ scenes: [{ ...raw, id: op.id }] }).scenes[0];
      if (imported.id !== op.id) throw new SceneError("Arquivo de cena inválido.");
      if (imported.background !== null && !hasMedia(imported.background, "image")) {
        throw new SceneError("O plano de fundo da cena não foi enviado à mesa.");
      }
      for (const card of imported.cards) {
        if (card.mediaId !== null && !hasMedia(card.mediaId, card.kind === "audio" ? "audio" : "image")) {
          throw new SceneError(`A mídia do card ${card.title} não foi enviada à mesa.`);
        }
      }
      // Nada chega tocando: o anfitrião liga o que quiser, no momento certo.
      const quiet: Scene = { ...imported, cards: imported.cards.map(stopped) };
      const leaving = patchScene(active.id, { cards: active.cards.map(stopped) });
      return {
        state: { ...leaving, scenes: [...leaving.scenes, quiet], activeId: quiet.id },
        message: (who) => `${who} carregou a cena ${quiet.name}.`,
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
      // O som da cena que sai para: só a ativa toca.
      const leaving = patchScene(active.id, { cards: active.cards.map(stopped) });
      return { state: { ...leaving, activeId: scene.id }, message: () => `A cena agora é ${scene.name}.` };
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
      if (kind === "audio") hostOnly();
      const mode = op.mode ?? "ambient";
      if (!AUDIO_MODES.includes(mode)) throw new SceneError("Modo de áudio inválido.");
      const card: SceneCard = {
        ...cleanCard(op.id, op.title, op.text),
        kind,
        mediaId: kind === "image" || kind === "audio" ? media(op.mediaId, kind) : null,
        audio: kind === "audio"
          ? { mode, volume: 80, loop: mode !== "effect", playing: false, startedAt: null, slot: null }
          : null,
        clock: kind === "clock" ? { segments: clampInt(op.segments ?? 6, 2, MAX_SEGMENTS), filled: 0 } : null,
        counter: kind === "counter" ? cleanCounter(op.value ?? 0, op.min ?? 0, op.max ?? 10) : null,
        timer: kind === "timer"
          ? { mode: "down", duration: clampInt(op.duration ?? 60, 1, MAX_DURATION), running: false, startedAt: null, base: 0 }
          : kind === "stopwatch"
          ? { mode: "up", duration: 0, running: false, startedAt: null, base: 0 }
          : null,
        table: kind === "table" ? { entries: cleanEntries(op.entries), last: null } : null,
        turns: kind === "turns" ? newTurns(TURN_SYSTEMS.includes(op.system ?? "manual") ? op.system : "manual") : null,
        poll: kind === "poll" ? newPoll(op.entries ?? [], op.anonymous === true) : null,
        checklist: kind === "checklist" ? newChecklist(op.entries ?? []) : null,
        zoneId: zoneIdOrNull(op.zoneId),
      };
      if (kind === "image" && !card.mediaId) throw new SceneError("Escolha a imagem do card.");
      if (kind === "audio" && !card.mediaId) throw new SceneError("Escolha o arquivo de áudio.");
      return {
        state: withActive([...active.cards, card]),
        message: (who) => `${who} adicionou o card ${card.title}.`,
      };
    }
    case "card:edit": {
      cardEdit();
      const old = cardById(op.cardId);
      const { title, text } = cleanCard(old.id, op.title, op.text);
      const card: SceneCard = { ...old, title, text };
      if (old.kind === "image" && op.mediaId !== undefined) card.mediaId = media(op.mediaId) ?? old.mediaId;
      if (old.clock && op.segments !== undefined) {
        const segments = clampInt(op.segments, 2, MAX_SEGMENTS);
        card.clock = { segments, filled: Math.min(old.clock.filled, segments) };
      }
      if (old.counter) {
        card.counter = cleanCounter(old.counter.value, op.min ?? old.counter.min, op.max ?? old.counter.max);
      }
      if (old.timer?.mode === "down" && op.duration !== undefined) {
        card.timer = { ...old.timer, duration: clampInt(op.duration, 1, MAX_DURATION) };
      }
      if (old.table && op.entries !== undefined) card.table = { entries: cleanEntries(op.entries), last: null };
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
    case "card:counter": {
      cardEdit();
      const card = cardById(op.cardId);
      if (!card.counter) throw new SceneError("Esse card não é um contador.");
      const value = clampInt(op.value, card.counter.min, card.counter.max);
      return {
        state: withActive(active.cards.map((c) => (c.id === card.id ? { ...c, counter: { ...card.counter!, value } } : c))),
        message: (who) => card.hidden ? "" : `${who} pôs ${card.title} em ${value}.`,
      };
    }
    case "card:timer": {
      cardEdit();
      const card = cardById(op.cardId);
      const old = card.timer;
      if (!old) throw new SceneError("Esse card não é um relógio de tempo.");
      const what = old.mode === "down" ? "o temporizador" : "o cronômetro";
      let timer: TimerSpec;
      let verb: string;
      if (op.action === "start") {
        if (old.running) throw new SceneError("Já está rodando.");
        // Um temporizador que acabou recomeça do início.
        const base = old.mode === "down" && old.base >= old.duration ? 0 : old.base;
        timer = { ...old, running: true, startedAt: now, base };
        verb = "iniciou";
      } else if (op.action === "pause") {
        if (!old.running) throw new SceneError("Já está parado.");
        timer = { ...old, running: false, startedAt: null, base: old.base + (now - (old.startedAt ?? now)) / 1000 };
        verb = "pausou";
      } else if (op.action === "reset") {
        timer = { ...old, running: false, startedAt: null, base: 0 };
        verb = "zerou";
      } else {
        throw new SceneError("Ação inválida.");
      }
      return {
        state: withActive(active.cards.map((c) => (c.id === card.id ? { ...c, timer } : c))),
        message: (who) => card.hidden ? "" : `${who} ${verb} ${what} ${card.title}.`,
      };
    }
    case "turns:add":
    case "turns:remove":
    case "turns:move":
    case "turns:value":
    case "turns:roll":
    case "turns:system":
    case "turns:next":
    case "turns:pick":
    case "turns:reset": {
      // Passar o turno e escolher o próximo dependem de quem está na vez, não de poder editar.
      const card = cardById(op.cardId);
      if (!card.turns) throw new SceneError("Esse card não é uma ordem de turnos.");
      const result = applyTurns(card.turns, op, { actor, isHost, canEdit: isHost || state.editors === "everyone", rng });
      return {
        state: withActive(active.cards.map((c) => (c.id === card.id ? { ...c, turns: result.spec } : c))),
        message: card.hidden ? () => "" : result.message,
      };
    }
    case "poll:vote":
    case "poll:state":
    case "poll:reset": {
      const card = cardById(op.cardId);
      if (!card.poll) throw new SceneError("Esse card não é uma votação.");
      const result = applyPoll(card.poll, op, { actor, isHost }, card.title);
      return {
        state: withActive(active.cards.map((c) => (c.id === card.id ? { ...c, poll: result.spec } : c))),
        message: card.hidden ? () => "" : result.message,
      };
    }
    case "check:add":
    case "check:toggle":
    case "check:edit":
    case "check:remove": {
      cardEdit();
      const card = cardById(op.cardId);
      if (!card.checklist) throw new SceneError("Esse card não é uma lista de verificação.");
      const result = applyChecklist(card.checklist, op, card.title);
      return {
        state: withActive(active.cards.map((c) => (c.id === card.id ? { ...c, checklist: result.spec } : c))),
        message: card.hidden ? () => "" : result.message,
      };
    }
    case "card:roll": {
      cardEdit();
      const card = cardById(op.cardId);
      if (!card.table) throw new SceneError("Esse card não é uma tabela.");
      const index = Math.min(card.table.entries.length - 1, Math.floor(rng() * card.table.entries.length));
      const entry = card.table.entries[index];
      return {
        state: withActive(active.cards.map((c) => (c.id === card.id ? { ...c, table: { ...card.table!, last: index } } : c))),
        message: (who) => card.hidden ? "" : `${who} sorteou em ${card.title}: ${entry}.`,
      };
    }
    case "audio:play": {
      hostOnly();
      const card = audioCard(op.cardId);
      if (card.audio.mode === "effect") return { state, message: () => "", fired: card.id };
      // Só uma música por vez: a nova toma o lugar da que tocava.
      const cards = active.cards.map((c) => {
        if (c.id === card.id) return { ...c, audio: { ...card.audio, playing: true, startedAt: now } };
        if (card.audio.mode === "music" && c.audio?.mode === "music" && c.audio.playing) {
          return { ...c, audio: { ...c.audio, playing: false, startedAt: null } };
        }
        return c;
      });
      return { state: withActive(cards), message: () => "" };
    }
    case "audio:stop": {
      hostOnly();
      const card = audioCard(op.cardId);
      return { state: patchAudio(card.id, { playing: false, startedAt: null }), message: () => "" };
    }
    case "audio:stopall": {
      hostOnly();
      return { state: withActive(active.cards.map(stopped)), message: () => "" };
    }
    case "audio:set": {
      hostOnly();
      const card = audioCard(op.cardId);
      const patch: Partial<AudioSpec> = {};
      if (op.volume !== undefined) patch.volume = clampInt(op.volume, 0, 100);
      if (op.loop !== undefined) patch.loop = op.loop === true;
      if (op.mode !== undefined) {
        if (!AUDIO_MODES.includes(op.mode)) throw new SceneError("Modo de áudio inválido.");
        patch.mode = op.mode;
        // Mudar de modo reinicia: um efeito não fica tocando, e uma música nova pede para ser tocada.
        patch.playing = false;
        patch.startedAt = null;
        patch.loop = op.loop === undefined ? op.mode !== "effect" : op.loop === true;
      }
      let cards = active.cards;
      if (op.slot !== undefined) {
        if (op.slot !== null && (!Number.isInteger(op.slot) || op.slot < 1 || op.slot > 9)) {
          throw new SceneError("A tecla do soundboard vai de 1 a 9.");
        }
        patch.slot = op.slot;
        // A tecla pertence a um card só: quem a tinha perde.
        if (op.slot !== null) {
          cards = cards.map((c) => (c.audio && c.audio.slot === op.slot && c.id !== card.id ? { ...c, audio: { ...c.audio, slot: null } } : c));
        }
      }
      return {
        state: patchScene(active.id, { cards: cards.map((c) => (c.id === card.id ? { ...c, audio: { ...card.audio, ...patch } } : c)) }),
        message: () => "",
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

/** O estado lido de disco: nada continua tocando depois de um reinício do servidor. */
function cleanAudio(raw: unknown): AudioSpec {
  const a = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const mode = AUDIO_MODES.includes(a.mode as AudioMode) ? a.mode as AudioMode : "ambient";
  const slot = Number.isInteger(a.slot) && (a.slot as number) >= 1 && (a.slot as number) <= 9 ? a.slot as number : null;
  return {
    mode,
    volume: clampInt(a.volume ?? 80, 0, 100),
    loop: typeof a.loop === "boolean" ? a.loop : mode !== "effect",
    playing: false,
    startedAt: null,
    slot,
  };
}

/** O card sem som tocando; cards que não são áudio ficam como estão. */
function stopped(card: SceneCard): SceneCard {
  return card.audio?.playing ? { ...card, audio: { ...card.audio, playing: false, startedAt: null } } : card;
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
    audio: null,
    clock: null,
    counter: null,
    timer: null,
    table: null,
    turns: null,
    poll: null,
    checklist: null,
    zoneId: null,
  };
}

function cleanCounter(value: unknown, min: unknown, max: unknown): CounterSpec {
  const lo = clampInt(min, -999, 999);
  const hi = Math.max(lo, clampInt(max, -999, 999));
  return { min: lo, max: hi, value: clampInt(value, lo, hi) };
}

/** Entradas da tabela: sem linhas vazias, de 2 a MAX_ENTRIES. */
function cleanEntries(raw: unknown): string[] {
  const entries = (Array.isArray(raw) ? raw : [])
    .filter((e): e is string => typeof e === "string")
    .map((e) => e.trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, MAX_ENTRIES);
  if (entries.length < 2) throw new SceneError("A tabela precisa de ao menos duas entradas.");
  return entries;
}

function cleanStoredTable(raw: unknown): TableSpec {
  const t = (typeof raw === "object" && raw !== null ? raw : {}) as { entries?: unknown; last?: unknown };
  let entries: string[];
  try {
    entries = cleanEntries(t.entries);
  } catch {
    entries = ["Sem entradas", "Sem entradas"];
  }
  const last = Number.isInteger(t.last) && (t.last as number) >= 0 && (t.last as number) < entries.length ? t.last as number : null;
  return { entries, last };
}

/** O estado do tempo lido de disco: nada continua rodando depois de um reinício do servidor. */
function cleanTimer(raw: unknown, mode: "down" | "up"): TimerSpec {
  const t = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const running = t.running === true && typeof t.startedAt === "number";
  const elapsed = (typeof t.base === "number" ? t.base : 0) + (running ? (Date.now() - (t.startedAt as number)) / 1000 : 0);
  return {
    mode,
    duration: mode === "down" ? clampInt(t.duration ?? 60, 1, MAX_DURATION) : 0,
    running: false,
    startedAt: null,
    base: Math.max(0, Math.min(elapsed, MAX_DURATION)),
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

/**
 * A cena como `viewer` pode vê-la: jogadores não recebem cards ocultos, e ninguém, nem o
 * anfitrião, recebe os votos dos outros enquanto uma votação está aberta.
 */
export function sceneFor(state: SceneState, isHost: boolean, viewer = ""): SceneState {
  return {
    ...state,
    scenes: state.scenes.map((s) => ({
      ...s,
      cards: s.cards
        .filter((c) => isHost || !c.hidden)
        .map((c) => (c.poll ? { ...c, poll: pollFor(c.poll, viewer) } : c)),
    })),
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
        mediaId: (kind === "image" || kind === "audio") && typeof card.mediaId === "string" ? card.mediaId : null,
        audio: kind === "audio" ? cleanAudio(card.audio) : null,
        counter: kind === "counter"
          ? cleanCounter((card.counter as CounterSpec | undefined)?.value, (card.counter as CounterSpec | undefined)?.min ?? 0, (card.counter as CounterSpec | undefined)?.max ?? 10)
          : null,
        timer: kind === "timer" || kind === "stopwatch" ? cleanTimer(card.timer, kind === "timer" ? "down" : "up") : null,
        table: kind === "table" ? cleanStoredTable(card.table) : null,
        turns: kind === "turns" ? cleanTurns(card.turns) : null,
        poll: kind === "poll" ? cleanPoll(card.poll) : null,
        checklist: kind === "checklist" ? cleanChecklist(card.checklist) : null,
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
