import { type DungeonWorldRoll, outcomeLabel, ROLL_SEPARATOR, type Roll, signed } from "./dice.ts";
import type { ChatEntry } from "./protocol.ts";

/**
 * Diário da mesa no formato Lonelog (Roberto Bisceglie, CC BY-SA 4.0): `@` ação, `?` pergunta ao
 * oráculo, `d:` rolagem, `->` resultado, `=>` consequência. A notação vai em blocos de código e a
 * narração em texto comum, como a especificação pede para Markdown.
 */

/** Uma pausa maior que esta entre duas entradas abre uma sessão nova. */
export const SESSION_GAP_MS = 6 * 60 * 60 * 1000;

export interface LonelogInput {
  title: string;
  hostName: string;
  entries: readonly ChatEntry[];
}

const NOTATION_START = /^(?:@(?:\([^)]*\))?\s|\?\s|->\s|=>\s|d:\s|tbl:\s|gen:\s|\(|\[|(?:N|PC)(?: \([^)]*\))?:\s)/;
const CLOCK_MESSAGE = /pôs o relógio (.+) em (\d+) de (\d+)\.$/;

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").replaceAll("```", "'''").trim();
}

function twoDigits(n: number): string {
  return String(n).padStart(2, "0");
}

function dateOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${twoDigits(d.getMonth() + 1)}-${twoDigits(d.getDate())}`;
}

function durationOf(startIso: string, endIso: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h${twoDigits(minutes % 60)}` : `${minutes}min`;
}

function part(label: string | undefined, rest: string): string {
  return label ? `${label} ${rest}` : rest;
}

function versus(roll: { challenge: [number, number] }): string {
  return `vs ${roll.challenge[0]},${roll.challenge[1]}`;
}

function edgeNote(roll: DungeonWorldRoll): string {
  if (roll.edge === 0) return "";
  const times = Math.abs(roll.edge) === 1 ? "" : `${Math.abs(roll.edge)} `;
  return ` (${times}${roll.edge > 0 ? "vantagem" : "desvantagem"})`;
}

/** A rolagem como uma linha `d:`, com o resultado depois de `->` quando o jogo tem um. */
export function rollNotation(roll: Roll): string {
  switch (roll.kind) {
    case "generic": {
      const rolls = roll.terms.map((t) => `${t.sign < 0 ? "-" : ""}${t.rolls.join(",")}`).join("; ");
      return `d: ${roll.expression}=${roll.total} (${rolls})`;
    }
    case "fate": {
      const faces = roll.dice.map((die) => die > 0 ? "+" : die < 0 ? "-" : "0").join(" ");
      const formula = roll.modifier === 0 ? "4dF" : `4dF${signed(roll.modifier)}`;
      return `d: ${part(roll.label, `${formula}=${signed(roll.total)} (${faces})`)} -> ${roll.ladder}`;
    }
    case "ironsworn": {
      const match = roll.match ? " (coincidência)" : "";
      if (roll.burnedMomentum !== undefined) {
        return `d: ${part(roll.label, `momentum ${roll.burnedMomentum} ${versus(roll)}`)} -> ${
          outcomeLabel(roll.outcome)
        }${match} (momentum queimado)`;
      }
      const modifier = roll.modifier === 0 ? "" : signed(roll.modifier);
      return `d: ${part(roll.label, `d6=${roll.actionDie}${modifier}=${roll.actionScore} ${versus(roll)}`)} -> ${
        outcomeLabel(roll.outcome)
      }${match}`;
    }
    case "progress": {
      const match = roll.match ? " (coincidência)" : "";
      return `d: ${part(roll.label, `progresso ${roll.progress} ${versus(roll)}`)} -> ${
        outcomeLabel(roll.outcome)
      }${match}`;
    }
    case "dungeon-world": {
      const formula = roll.modifier === 0 ? "2d6" : `2d6${signed(roll.modifier)}`;
      const kept = roll.edge === 0 ? "" : `; valem ${roll.kept.join(",")}`;
      return `d: ${part(roll.label, `${formula}=${roll.total} (${roll.dice.join(",")}${kept})`)}${edgeNote(roll)} -> ${
        outcomeLabel(roll.outcome)
      }`;
    }
  }
}

/** Oráculo de compêndio: "resultado · tabela, d100 42" vira uma linha `d:` (sim ou não) ou `tbl:`. */
function oracleNotation(text: string): string {
  const [result, ...rest] = text.split(ROLL_SEPARATOR);
  const detail = rest.join(ROLL_SEPARATOR);
  if (!detail) return `-> ${oneLine(result)}`;
  const yesNo = /^(Sim|Não)\b/.test(result);
  return `${yesNo ? "d:" : "tbl:"} ${oneLine(detail)} -> ${oneLine(result)}`;
}

type Block = { notation: boolean; lines: string[] };

function rulesetOf(entries: readonly ChatEntry[]): string {
  const kinds = new Set(entries.map((e) => e.roll?.kind));
  const names: string[] = [];
  if (kinds.has("fate")) names.push("Fate");
  if (kinds.has("ironsworn") || kinds.has("progress")) names.push("Ironsworn");
  if (kinds.has("dungeon-world")) names.push("Dungeon World 2");
  return names.join(" + ");
}

function yamlValue(value: string): string {
  const text = oneLine(value);
  return /^[\s\-?:,\[\]{}#&*!|>'"%@`]|: | #/.test(text) ? JSON.stringify(text) : text;
}

/** O registro completo da mesa em Markdown, pronto para colar num diário de campanha. */
export function buildLonelog(input: LonelogInput): string {
  const entries = input.entries.filter((e) => !e.private);
  const writers = [...new Set(entries.filter((e) => e.kind === "text").map((e) => e.author))];
  const several = writers.length > 1;
  const players = writers.length > 0 ? writers : [input.hostName];

  const out: string[] = ["---", `title: ${yamlValue(input.title)}`];
  const ruleset = rulesetOf(entries);
  if (ruleset) out.push(`ruleset: ${ruleset}`);
  out.push(`player: ${players.map(yamlValue).join(", ")}`);
  if (entries.length > 0) {
    out.push(`start_date: ${dateOf(entries[0].at)}`, `last_update: ${dateOf(entries[entries.length - 1].at)}`);
  }
  out.push("tools: Guacamole", "---", "", `# ${oneLine(input.title)}`, "");

  // Separa as sessões pela pausa entre as entradas.
  const sessions: ChatEntry[][] = [];
  for (const entry of entries) {
    const last = sessions[sessions.length - 1];
    const gap = last ? Date.parse(entry.at) - Date.parse(last[last.length - 1].at) : Infinity;
    if (gap >= SESSION_GAP_MS) sessions.push([entry]);
    else last.push(entry);
  }

  const counter = { n: 0 };
  sessions.forEach((session, index) => {
    const before = counter.n;
    const body = renderSession(session, several, counter);
    const made = counter.n - before;
    const scenes = made === 0 ? "" : ` | Cenas: S${before + 1}${made > 1 ? `-S${counter.n}` : ""}`;
    out.push(
      `## Sessão ${index + 1}`,
      `*Data: ${dateOf(session[0].at)} | Duração: ${durationOf(session[0].at, session[session.length - 1].at)}${scenes}*`,
      "",
      ...body.lines,
    );
  });
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function renderSession(
  session: readonly ChatEntry[],
  several: boolean,
  counter: { n: number },
): { lines: string[] } {
  const blocks: Block[] = [];
  const lines: string[] = [];
  const push = (notation: boolean, text: string) => {
    const last = blocks[blocks.length - 1];
    if (last && last.notation === notation) last.lines.push(text);
    else blocks.push({ notation, lines: [text] });
  };
  const header = (name: string, description: string) => {
    flush();
    lines.push(`### S${++counter.n} *${oneLine(name)}*`, "");
    if (description) push(true, `(descrição: ${oneLine(description)})`);
  };
  const flush = () => {
    for (const block of blocks) {
      if (block.notation) lines.push("```", ...block.lines, "```", "");
      else lines.push(block.lines.join("\n\n"), "");
    }
    blocks.length = 0;
  };

  for (const entry of session) {
    if (entry.scene) {
      header(entry.scene.name, entry.scene.description);
      continue;
    }
    if (counter.n === 0 && (entry.kind === "text" || entry.kind === "roll")) header("Início", "");
    switch (entry.kind) {
      case "text": {
        const text = oneLine(entry.text);
        if (!text) break;
        if (NOTATION_START.test(text)) {
          push(true, several && /^@\s/.test(text) ? `@(${oneLine(entry.author)}) ${text.slice(2)}` : text);
        } else {
          push(false, several ? `**${oneLine(entry.author)}:** ${text}` : text);
        }
        break;
      }
      case "roll":
        push(true, entry.roll ? rollNotation(entry.roll) : oracleNotation(entry.text));
        break;
      case "safety":
        push(true, `(segurança: ${oneLine(entry.text)})`);
        break;
      case "system": {
        const clock = CLOCK_MESSAGE.exec(entry.text);
        if (clock) push(true, `[Clock:${oneLine(clock[1])} ${clock[2]}/${clock[3]}]`);
        break;
      }
    }
  }
  flush();
  return { lines };
}
