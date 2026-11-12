/**
 * Cards com estado próprio e lógica própria: ordem de turnos, votação e lista de verificação.
 * São funções puras sobre o estado do card; scene.ts decide quem pode chamá-las.
 */
import { SceneError } from "./scene.ts";

// --- Ordem de turnos -------------------------------------------------------------------------

/**
 * Manual: o anfitrião (ou quem edita) põe a ordem na mão e passa o turno em sequência.
 * Iniciativa: cada participante tem um valor (digitado ou rolado) e a ordem segue do maior ao menor.
 * Pipoca: quem está na vez escolhe o próximo, entre os que ainda não jogaram na rodada.
 */
export type TurnSystem = "manual" | "initiative" | "popcorn";
export const TURN_SYSTEMS: TurnSystem[] = ["manual", "initiative", "popcorn"];

export interface TurnEntry {
  id: string;
  name: string;
  /** Pessoa da mesa que joga por este participante; `null` é um PNJ, e o anfitrião age por ele. */
  owner: string | null;
  /** Iniciativa. */
  value: number | null;
  /** Pipoca: já jogou nesta rodada. */
  done: boolean;
}

export interface TurnsSpec {
  system: TurnSystem;
  entries: TurnEntry[];
  /** Id de quem está na vez. */
  current: string | null;
  round: number;
  /** Dados da iniciativa: `count` dados de `sides` lados. */
  count: number;
  sides: number;
}

export const MAX_PARTICIPANTS = 30;

export type TurnsOp =
  | { type: "turns:add"; entryId: string; name: string; owner?: string | null }
  | { type: "turns:remove"; entryId: string }
  | { type: "turns:move"; entryId: string; direction: -1 | 1 }
  | { type: "turns:value"; entryId: string; value: number | null }
  | { type: "turns:roll"; entryId?: string }
  | { type: "turns:system"; system: TurnSystem; count?: number; sides?: number }
  | { type: "turns:next" }
  | { type: "turns:pick"; entryId: string }
  | { type: "turns:reset" };

export function newTurns(system: TurnSystem = "manual"): TurnsSpec {
  return { system, entries: [], current: null, round: 1, count: 1, sides: 20 };
}

function clampInt(raw: unknown, min: number, max: number): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : min;
  return Math.min(max, Math.max(min, n));
}

function cleanLabel(raw: unknown, limit: number): string {
  return (typeof raw === "string" ? raw : "").trim().slice(0, limit);
}

/** Do maior valor ao menor; quem ainda não tem valor fica por último. A ordem anterior desempata. */
function sortedByInitiative(entries: TurnEntry[]): TurnEntry[] {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (b.e.value ?? -Infinity) - (a.e.value ?? -Infinity) || a.i - b.i)
    .map(({ e }) => e);
}

function arranged(spec: TurnsSpec): TurnsSpec {
  return spec.system === "initiative" ? { ...spec, entries: sortedByInitiative(spec.entries) } : spec;
}

export interface TurnsContext {
  /** Nome de quem pediu. */
  actor: string;
  isHost: boolean;
  /** Quem pode mexer nos participantes e na configuração (anfitrião, ou todos se a mesa deixa). */
  canEdit: boolean;
  rng: () => number;
}

export interface KindResult<T> {
  spec: T;
  message: (who: string) => string;
}

export function applyTurns(spec: TurnsSpec, op: TurnsOp, ctx: TurnsContext): KindResult<TurnsSpec> {
  const edit = () => {
    if (!ctx.canEdit) throw new SceneError("Só o anfitrião mexe nos cards desta mesa.");
  };
  const entry = (id: string): TurnEntry => {
    const found = spec.entries.find((e) => e.id === id);
    if (!found) throw new SceneError("Participante não encontrado.");
    return found;
  };
  const current = spec.entries.find((e) => e.id === spec.current);
  /** Quem está na vez (ou o anfitrião) pode passar o turno. */
  const holder = () => ctx.isHost || (current !== undefined && current.owner !== null && current.owner === ctx.actor);

  switch (op.type) {
    case "turns:add": {
      edit();
      if (spec.entries.length >= MAX_PARTICIPANTS) throw new SceneError(`Limite de ${MAX_PARTICIPANTS} participantes.`);
      if (spec.entries.some((e) => e.id === op.entryId)) throw new SceneError("Já existe um participante com esse id.");
      const name = cleanLabel(op.name, 80);
      if (!name) throw new SceneError("O participante precisa de um nome.");
      const owner = cleanLabel(op.owner, 80) || null;
      const added = { id: op.entryId, name, owner, value: null, done: false };
      return {
        spec: arranged({ ...spec, entries: [...spec.entries, added] }),
        message: (who) => `${who} pôs ${name} na ordem de turnos.`,
      };
    }
    case "turns:remove": {
      edit();
      const gone = entry(op.entryId);
      return {
        spec: { ...spec, entries: spec.entries.filter((e) => e.id !== gone.id), current: spec.current === gone.id ? null : spec.current },
        message: (who) => `${who} tirou ${gone.name} da ordem de turnos.`,
      };
    }
    case "turns:move": {
      edit();
      if (spec.system !== "manual") throw new SceneError("Só dá para mudar a ordem na mão no sistema manual.");
      const moved = entry(op.entryId);
      const from = spec.entries.indexOf(moved);
      const to = from + (op.direction < 0 ? -1 : 1);
      if (to < 0 || to >= spec.entries.length) throw new SceneError("O participante já está no limite da lista.");
      const entries = [...spec.entries];
      [entries[from], entries[to]] = [entries[to], entries[from]];
      return { spec: { ...spec, entries }, message: () => "" };
    }
    case "turns:value": {
      edit();
      if (spec.system !== "initiative") throw new SceneError("Só o sistema de iniciativa usa valores.");
      const target = entry(op.entryId);
      const value = op.value === null ? null : clampInt(op.value, -999, 999);
      const entries = spec.entries.map((e) => (e.id === target.id ? { ...e, value } : e));
      return {
        spec: arranged({ ...spec, entries }),
        message: (who) => value === null ? `${who} limpou a iniciativa de ${target.name}.` : `${who} deu iniciativa ${value} a ${target.name}.`,
      };
    }
    case "turns:roll": {
      edit();
      if (spec.system !== "initiative") throw new SceneError("Só o sistema de iniciativa rola dados.");
      const targets = op.entryId ? [entry(op.entryId)] : spec.entries.filter((e) => e.value === null);
      if (targets.length === 0) throw new SceneError("Ninguém está sem iniciativa.");
      const rolled = new Map<string, number>();
      for (const t of targets) {
        let total = 0;
        for (let i = 0; i < spec.count; i++) total += Math.min(spec.sides, Math.floor(ctx.rng() * spec.sides) + 1);
        rolled.set(t.id, total);
      }
      const entries = spec.entries.map((e) => (rolled.has(e.id) ? { ...e, value: rolled.get(e.id)! } : e));
      const list = targets.map((t) => `${t.name}, ${rolled.get(t.id)}`).join("; ");
      return { spec: arranged({ ...spec, entries }), message: (who) => `${who} rolou a iniciativa: ${list}.` };
    }
    case "turns:system": {
      edit();
      if (!TURN_SYSTEMS.includes(op.system)) throw new SceneError("Sistema de turnos inválido.");
      const next: TurnsSpec = {
        ...spec,
        system: op.system,
        current: null,
        round: 1,
        count: op.count === undefined ? spec.count : clampInt(op.count, 1, 10),
        sides: op.sides === undefined ? spec.sides : clampInt(op.sides, 2, 100),
        entries: spec.entries.map((e) => ({ ...e, done: false })),
      };
      const names = { manual: "manual", initiative: "iniciativa", popcorn: "pipoca" };
      return { spec: arranged(next), message: (who) => `${who} pôs a ordem de turnos no sistema ${names[op.system]}.` };
    }
    case "turns:next": {
      if (spec.system === "popcorn") throw new SceneError("No turno pipoca, quem está na vez escolhe o próximo.");
      if (!ctx.canEdit && !holder()) throw new SceneError("Só quem está na vez ou o anfitrião passa o turno.");
      if (spec.entries.length === 0) throw new SceneError("Não há participantes.");
      const index = current ? spec.entries.indexOf(current) : -1;
      const wrapped = index + 1 >= spec.entries.length;
      const target = spec.entries[wrapped ? 0 : index + 1];
      const round = wrapped && index >= 0 ? spec.round + 1 : spec.round;
      return {
        spec: { ...spec, current: target.id, round },
        message: () => wrapped && index >= 0 ? `Rodada ${round}. Turno de ${target.name}.` : `Turno de ${target.name}.`,
      };
    }
    case "turns:pick": {
      if (spec.system !== "popcorn") throw new SceneError("Só o turno pipoca deixa escolher o próximo.");
      if (!holder()) throw new SceneError("Só quem está na vez ou o anfitrião escolhe o próximo.");
      const target = entry(op.entryId);
      if (target.id === spec.current && spec.entries.length > 1) throw new SceneError("Escolha outra pessoa.");
      // Quando todos já jogaram, a rodada recomeça e todos podem jogar de novo.
      const everyoneDone = spec.entries.every((e) => e.done);
      const round = everyoneDone ? spec.round + 1 : spec.round;
      if (!everyoneDone && target.done) throw new SceneError(`${target.name} já jogou nesta rodada.`);
      const entries = spec.entries.map((e) => ({ ...e, done: e.id === target.id ? true : everyoneDone ? false : e.done }));
      const first = current === undefined;
      return {
        spec: { ...spec, entries, current: target.id, round },
        message: (who) =>
          (everyoneDone && !first ? `Todos jogaram. Rodada ${round}. ` : "") +
          (first ? `Turno de ${target.name}.` : `${who} passou o turno para ${target.name}.`),
      };
    }
    case "turns:reset": {
      edit();
      return {
        spec: { ...spec, current: null, round: 1, entries: spec.entries.map((e) => ({ ...e, done: false })) },
        message: (who) => `${who} zerou a ordem de turnos.`,
      };
    }
  }
}

/** O que a fala diz sobre quem está na vez. */
export function currentName(spec: TurnsSpec): string | null {
  return spec.entries.find((e) => e.id === spec.current)?.name ?? null;
}

// --- Votação ---------------------------------------------------------------------------------

export interface PollOption {
  id: string;
  text: string;
}

/**
 * Enquanto aberta, ninguém vê os votos dos outros: só o próprio e quantos já votaram. Ao encerrar,
 * todos veem o resultado; e, se não for anônima, quem votou em quê.
 */
export interface PollSpec {
  options: PollOption[];
  /** Quem votou em quê, pelo nome. Só o servidor guarda tudo; o que chega a cada pessoa é filtrado. */
  votes: Record<string, string>;
  total: number;
  open: boolean;
  anonymous: boolean;
}

export const MAX_OPTIONS = 10;

export type PollOp =
  | { type: "poll:vote"; optionId: string }
  | { type: "poll:state"; open: boolean }
  | { type: "poll:reset" };

export function newPoll(options: string[], anonymous: boolean): PollSpec {
  const texts = options.map((o) => cleanLabel(o, 120)).filter(Boolean).slice(0, MAX_OPTIONS);
  if (texts.length < 2) throw new SceneError("A votação precisa de ao menos duas opções.");
  return {
    options: texts.map((text, i) => ({ id: `o${i + 1}`, text })),
    votes: {},
    total: 0,
    open: true,
    anonymous,
  };
}

/** Contagem por opção, da mais votada à menos; empates ficam na ordem original. */
export function pollTally(spec: PollSpec): Array<{ option: PollOption; votes: number }> {
  return spec.options
    .map((option, i) => ({ option, votes: Object.values(spec.votes).filter((v) => v === option.id).length, i }))
    .sort((a, b) => b.votes - a.votes || a.i - b.i)
    .map(({ option, votes }) => ({ option, votes }));
}

export function applyPoll(
  spec: PollSpec,
  op: PollOp,
  ctx: { actor: string; isHost: boolean },
  title: string,
): KindResult<PollSpec> {
  switch (op.type) {
    case "poll:vote": {
      if (!spec.open) throw new SceneError("A votação já foi encerrada.");
      if (!ctx.actor) throw new SceneError("Não foi possível saber quem votou.");
      if (!spec.options.some((o) => o.id === op.optionId)) throw new SceneError("Opção não encontrada.");
      const votes = { ...spec.votes, [ctx.actor]: op.optionId };
      return {
        spec: { ...spec, votes, total: Object.keys(votes).length },
        message: (who) => `${who} votou em ${title}.`,
      };
    }
    case "poll:state": {
      if (!ctx.isHost) throw new SceneError("Só o anfitrião faz isso.");
      if (spec.open === op.open) throw new SceneError(op.open ? "A votação já está aberta." : "A votação já está encerrada.");
      const next = { ...spec, open: op.open };
      return {
        spec: next,
        message: () => {
          if (op.open) return `A votação ${title} foi reaberta.`;
          const result = pollTally(next).map((t) => `${t.option.text}, ${t.votes} ${t.votes === 1 ? "voto" : "votos"}`).join("; ");
          return `Votação ${title} encerrada, ${next.total} ${next.total === 1 ? "voto" : "votos"}. ${result}.`;
        },
      };
    }
    case "poll:reset": {
      if (!ctx.isHost) throw new SceneError("Só o anfitrião faz isso.");
      return {
        spec: { ...spec, votes: {}, total: 0, open: true },
        message: (who) => `${who} zerou a votação ${title}.`,
      };
    }
  }
}

/** A votação como `viewer` pode vê-la. */
export function pollFor(spec: PollSpec, viewer: string): PollSpec {
  if (spec.open) {
    const mine = spec.votes[viewer];
    return { ...spec, votes: mine === undefined ? {} : { [viewer]: mine } };
  }
  if (!spec.anonymous) return spec;
  // Anônima e encerrada: as contagens ficam, os nomes somem.
  const votes: Record<string, string> = {};
  Object.values(spec.votes).forEach((optionId, i) => (votes[`voto ${i + 1}`] = optionId));
  return { ...spec, votes };
}

// --- Lista de verificação --------------------------------------------------------------------

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface ChecklistSpec {
  items: ChecklistItem[];
}

export const MAX_ITEMS = 50;

export type ChecklistOp =
  | { type: "check:add"; itemId: string; text: string }
  | { type: "check:toggle"; itemId: string }
  | { type: "check:edit"; itemId: string; text: string }
  | { type: "check:remove"; itemId: string };

export function newChecklist(items: string[]): ChecklistSpec {
  return {
    items: items.map((t) => cleanLabel(t, 200)).filter(Boolean).slice(0, MAX_ITEMS).map((text, i) => ({ id: `i${i + 1}`, text, done: false })),
  };
}

export function applyChecklist(spec: ChecklistSpec, op: ChecklistOp, title: string): KindResult<ChecklistSpec> {
  const item = (id: string): ChecklistItem => {
    const found = spec.items.find((i) => i.id === id);
    if (!found) throw new SceneError("Item não encontrado.");
    return found;
  };
  switch (op.type) {
    case "check:add": {
      if (spec.items.length >= MAX_ITEMS) throw new SceneError(`Limite de ${MAX_ITEMS} itens.`);
      if (spec.items.some((i) => i.id === op.itemId)) throw new SceneError("Já existe um item com esse id.");
      const text = cleanLabel(op.text, 200);
      if (!text) throw new SceneError("O item precisa de um texto.");
      return {
        spec: { items: [...spec.items, { id: op.itemId, text, done: false }] },
        message: (who) => `${who} adicionou ${text} a ${title}.`,
      };
    }
    case "check:toggle": {
      const found = item(op.itemId);
      return {
        spec: { items: spec.items.map((i) => (i.id === found.id ? { ...i, done: !i.done } : i)) },
        message: (who) => `${who} ${found.done ? "desmarcou" : "marcou"} ${found.text} em ${title}.`,
      };
    }
    case "check:edit": {
      const found = item(op.itemId);
      const text = cleanLabel(op.text, 200);
      if (!text) throw new SceneError("O item precisa de um texto.");
      return { spec: { items: spec.items.map((i) => (i.id === found.id ? { ...i, text } : i)) }, message: () => "" };
    }
    case "check:remove": {
      const found = item(op.itemId);
      return {
        spec: { items: spec.items.filter((i) => i.id !== found.id) },
        message: (who) => `${who} tirou ${found.text} de ${title}.`,
      };
    }
  }
}

// --- Leitura de disco ------------------------------------------------------------------------

export function cleanTurns(raw: unknown): TurnsSpec {
  const t = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const system = TURN_SYSTEMS.includes(t.system as TurnSystem) ? t.system as TurnSystem : "manual";
  const seen = new Set<string>();
  const entries: TurnEntry[] = [];
  for (const e of Array.isArray(t.entries) ? t.entries as Array<Record<string, unknown>> : []) {
    if (typeof e?.id !== "string" || seen.has(e.id) || entries.length >= MAX_PARTICIPANTS) continue;
    const name = cleanLabel(e.name, 80);
    if (!name) continue;
    seen.add(e.id);
    entries.push({
      id: e.id,
      name,
      owner: cleanLabel(e.owner, 80) || null,
      value: typeof e.value === "number" && Number.isFinite(e.value) ? clampInt(e.value, -999, 999) : null,
      done: e.done === true,
    });
  }
  return arranged({
    system,
    entries,
    current: entries.some((e) => e.id === t.current) ? t.current as string : null,
    round: clampInt(t.round ?? 1, 1, 9999),
    count: clampInt(t.count ?? 1, 1, 10),
    sides: clampInt(t.sides ?? 20, 2, 100),
  });
}

export function cleanPoll(raw: unknown): PollSpec {
  const p = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const options: PollOption[] = [];
  for (const o of Array.isArray(p.options) ? p.options as Array<Record<string, unknown>> : []) {
    const text = cleanLabel(o?.text, 120);
    if (typeof o?.id === "string" && text && options.length < MAX_OPTIONS && !options.some((x) => x.id === o.id)) {
      options.push({ id: o.id, text });
    }
  }
  while (options.length < 2) options.push({ id: `o${options.length + 1}`, text: options.length === 0 ? "Sim" : "Não" });
  const votes: Record<string, string> = {};
  const stored = typeof p.votes === "object" && p.votes !== null ? p.votes as Record<string, unknown> : {};
  for (const [name, optionId] of Object.entries(stored)) {
    if (typeof optionId === "string" && options.some((o) => o.id === optionId)) votes[name] = optionId;
  }
  return { options, votes, total: Object.keys(votes).length, open: p.open !== false, anonymous: p.anonymous === true };
}

export function cleanChecklist(raw: unknown): ChecklistSpec {
  const c = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const items: ChecklistItem[] = [];
  for (const i of Array.isArray(c.items) ? c.items as Array<Record<string, unknown>> : []) {
    const text = cleanLabel(i?.text, 200);
    if (typeof i?.id !== "string" || !text || seen.has(i.id) || items.length >= MAX_ITEMS) continue;
    seen.add(i.id);
    items.push({ id: i.id, text, done: i.done === true });
  }
  return { items };
}
