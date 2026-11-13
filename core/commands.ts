import {
  describeRoll,
  parseDiceExpression,
  type Roll,
  rollFate,
  rollGeneric,
  rollIronsworn,
  rollProgress,
} from "./dice.ts";
import { defaultRng, type Rng } from "./rng.ts";
import { type SafetyAction, safetyLabel } from "./safety.ts";

export const MAX_CHAT_LENGTH = 2000;
const MAX_MODIFIER = 50;

export type ChatResult =
  | { type: "text"; content: string }
  | { type: "roll"; roll: Roll; text: string }
  | { type: "safety"; action: SafetyAction; text: string }
  | { type: "error"; message: string };

const SAFETY_COMMANDS: Record<string, SafetyAction> = {
  x: "stop",
  stop: "stop",
  parar: "stop",
  pause: "pause",
  pausar: "pause",
  rewind: "rewind",
  retroceder: "rewind",
  forward: "forward",
  avancar: "forward",
  avançar: "forward",
};

/** Atalhos para anotar no diário em Lonelog sem digitar os símbolos. */
const LONELOG_COMMANDS: Record<string, { what: string; format: (text: string) => string }> = {};
for (
  const [names, what, format] of [
    [["a", "acao", "ação"], "uma ação", (t: string) => `@ ${t}`],
    [["q", "pergunta"], "uma pergunta ao oráculo", (t: string) => `? ${t}`],
    [["res", "resultado"], "um resultado", (t: string) => `-> ${t}`],
    [["c", "consequencia", "consequência"], "uma consequência", (t: string) => `=> ${t}`],
    [["n", "nota"], "uma nota", (t: string) => `(nota: ${t})`],
  ] as Array<[string[], string, (text: string) => string]>
) {
  for (const name of names) LONELOG_COMMANDS[name] = { what, format };
}

/**
 * Interpreta uma linha digitada no chat. Texto comum vira mensagem; comandos
 * começados por `/` viram rolagens ou sinais de segurança já resolvidos.
 */
export function runChatInput(input: string, rng: Rng = defaultRng): ChatResult {
  const line = input.trim();
  if (!line) return { type: "error", message: "Mensagem vazia." };
  if (line.length > MAX_CHAT_LENGTH) {
    return { type: "error", message: `Mensagem longa demais (máximo ${MAX_CHAT_LENGTH} caracteres).` };
  }
  if (!line.startsWith("/")) return { type: "text", content: line };

  const [head, ...rest] = line.slice(1).split(/\s+/);
  const command = head.toLowerCase();
  const args = rest.join(" ");

  const safety = SAFETY_COMMANDS[command];
  if (safety) return { type: "safety", action: safety, text: safetyLabel(safety) };

  const lonelog = LONELOG_COMMANDS[command];
  if (lonelog) {
    if (!args) return { type: "error", message: `Uso: /${command} texto (anota ${lonelog.what} no diário).` };
    return { type: "text", content: lonelog.format(args) };
  }

  switch (command) {
    case "r":
    case "roll":
    case "rolar": {
      const parsed = parseDiceExpression(args);
      if (!parsed) {
        return { type: "error", message: "Uso: /roll 2d6+3 (até 100 dados de 2 a 1000 faces)." };
      }
      return rolled(rollGeneric(parsed, rng));
    }
    case "f":
    case "fate": {
      const { modifier, label, error } = parseModifierAndLabel(args);
      if (error) return { type: "error", message: `${error} Uso: /fate +3 Lutar` };
      return rolled(rollFate(modifier, rng, label));
    }
    case "i":
    case "iron":
    case "ironsworn": {
      const { modifier, label, error } = parseModifierAndLabel(args);
      if (error) return { type: "error", message: `${error} Uso: /iron +2 Ferro` };
      return rolled(rollIronsworn(modifier, rng, label));
    }
    case "p":
    case "progress":
    case "progresso": {
      const match = args.match(/^(\d+)(?:\s+(.*))?$/);
      const progress = match ? Number(match[1]) : NaN;
      if (!match || progress > 10) {
        return { type: "error", message: "Uso: /progress 6 Vingança (progresso de 0 a 10)." };
      }
      return rolled(rollProgress(progress, rng, match[2]?.trim() || undefined));
    }
    default:
      return { type: "error", message: `Comando desconhecido: /${command}.` };
  }
}

function rolled(roll: Roll): ChatResult {
  return { type: "roll", roll, text: describeRoll(roll) };
}

/**
 * Soma todos os números soltos (`+3`, `-1`, `2`) como modificador; o restante vira rótulo.
 * Aceita `+ 3` com espaço.
 */
function parseModifierAndLabel(args: string): { modifier: number; label?: string; error?: string } {
  const tokens = args.replace(/([+-])\s+(\d)/g, "$1$2").split(/\s+/).filter(Boolean);
  let modifier = 0;
  const label: string[] = [];
  for (const token of tokens) {
    if (/^[+-]?\d+$/.test(token)) modifier += Number(token);
    else label.push(token);
  }
  if (Math.abs(modifier) > MAX_MODIFIER) {
    return { modifier: 0, error: `Modificador fora do limite (±${MAX_MODIFIER}).` };
  }
  return { modifier, label: label.join(" ") || undefined };
}
