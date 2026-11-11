import { type Rng, rollDie, rollFateDie } from "./rng.ts";

export type Outcome = "strong" | "weak" | "miss";

export interface DiceTerm {
  sign: 1 | -1;
  count: number;
  sides: number;
  rolls: number[];
}

export interface GenericRoll {
  kind: "generic";
  expression: string;
  terms: DiceTerm[];
  modifier: number;
  total: number;
}

export interface FateRoll {
  kind: "fate";
  label?: string;
  dice: Array<-1 | 0 | 1>;
  modifier: number;
  total: number;
  ladder: string;
}

export interface IronswornRoll {
  kind: "ironsworn";
  label?: string;
  actionDie: number;
  modifier: number;
  /** d6 + modificador, limitado a 10. */
  actionScore: number;
  challenge: [number, number];
  outcome: Outcome;
  match: boolean;
  /** Valor do momentum queimado, que substitui a pontuação de ação. */
  burnedMomentum?: number;
}

export interface ProgressRoll {
  kind: "progress";
  label?: string;
  /** Caixas completas da trilha, de 0 a 10. */
  progress: number;
  challenge: [number, number];
  outcome: Outcome;
  match: boolean;
}

export type Roll = GenericRoll | FateRoll | IronswornRoll | ProgressRoll;

export const MAX_DICE_COUNT = 100;
export const MAX_DICE_SIDES = 1000;

const TERM_PATTERN = /([+-]?)(?:(\d*)d(\d+)|(\d+))/gy;

export interface ParsedDice {
  terms: Array<{ sign: 1 | -1; count: number; sides: number }>;
  modifier: number;
}

/** Interpreta expressões como `2d6+1d4-1`, `d20` ou `3`. Retorna null se inválida. */
export function parseDiceExpression(input: string): ParsedDice | null {
  const text = input.trim().replace(/\s*([+-])\s*/g, "$1").toLowerCase();
  if (!text || /\s/.test(text)) return null;

  const terms: ParsedDice["terms"] = [];
  let modifier = 0;
  let index = 0;
  TERM_PATTERN.lastIndex = 0;

  while (index < text.length) {
    TERM_PATTERN.lastIndex = index;
    const match = TERM_PATTERN.exec(text);
    if (!match) return null;
    // Apenas o primeiro termo pode omitir o sinal.
    if (index > 0 && !match[1]) return null;
    const sign: 1 | -1 = match[1] === "-" ? -1 : 1;
    if (match[3] !== undefined) {
      const count = match[2] === "" ? 1 : Number(match[2]);
      const sides = Number(match[3]);
      if (count < 1 || count > MAX_DICE_COUNT || sides < 2 || sides > MAX_DICE_SIDES) return null;
      terms.push({ sign, count, sides });
    } else {
      modifier += sign * Number(match[4]);
    }
    index = TERM_PATTERN.lastIndex;
  }

  return terms.length > 0 ? { terms, modifier } : null;
}

export function rollGeneric(parsed: ParsedDice, rng: Rng): GenericRoll {
  const terms: DiceTerm[] = parsed.terms.map((term) => ({
    ...term,
    rolls: Array.from({ length: term.count }, () => rollDie(rng, term.sides)),
  }));
  const diceTotal = terms.reduce(
    (sum, term) => sum + term.sign * term.rolls.reduce((a, b) => a + b, 0),
    0,
  );
  const expression = terms
    .map((term, i) => `${i === 0 ? (term.sign < 0 ? "-" : "") : term.sign < 0 ? "-" : "+"}${term.count}d${term.sides}`)
    .join("") + (parsed.modifier === 0 ? "" : signed(parsed.modifier));
  return {
    kind: "generic",
    expression,
    terms,
    modifier: parsed.modifier,
    total: diceTotal + parsed.modifier,
  };
}

export function rollFate(modifier: number, rng: Rng, label?: string): FateRoll {
  const dice = Array.from({ length: 4 }, () => rollFateDie(rng));
  const total = dice.reduce<number>((sum, die) => sum + die, 0) + modifier;
  return { kind: "fate", label, dice, modifier, total, ladder: fateLadder(total) };
}

export function rollIronsworn(modifier: number, rng: Rng, label?: string): IronswornRoll {
  const actionDie = rollDie(rng, 6);
  const challenge: [number, number] = [rollDie(rng, 10), rollDie(rng, 10)];
  const actionScore = Math.min(10, actionDie + modifier);
  return {
    kind: "ironsworn",
    label,
    actionDie,
    modifier,
    actionScore,
    challenge,
    outcome: ironswornOutcome(actionScore, challenge),
    match: challenge[0] === challenge[1],
  };
}

export function rollProgress(progress: number, rng: Rng, label?: string): ProgressRoll {
  const challenge: [number, number] = [rollDie(rng, 10), rollDie(rng, 10)];
  return {
    kind: "progress",
    label,
    progress,
    challenge,
    outcome: ironswornOutcome(progress, challenge),
    match: challenge[0] === challenge[1],
  };
}

/**
 * Queima momentum: o valor substitui a pontuação de ação. Retorna null se isso não
 * melhoraria o resultado.
 */
export function burnMomentum(roll: IronswornRoll, momentum: number): IronswornRoll | null {
  const outcome = ironswornOutcome(momentum, roll.challenge);
  if (RANK[outcome] <= RANK[roll.outcome]) return null;
  return { ...roll, actionScore: momentum, outcome, burnedMomentum: momentum };
}

const RANK: Record<Outcome, number> = { miss: 0, weak: 1, strong: 2 };

/** Pontuação maior que ambos os dados de desafio: acerto forte; maior que um: parcial; senão erro. */
export function ironswornOutcome(score: number, challenge: [number, number]): Outcome {
  const beaten = Number(score > challenge[0]) + Number(score > challenge[1]);
  return beaten === 2 ? "strong" : beaten === 1 ? "weak" : "miss";
}

const LADDER: Record<number, string> = {
  8: "Lendário",
  7: "Épico",
  6: "Fantástico",
  5: "Excepcional",
  4: "Ótimo",
  3: "Bom",
  2: "Razoável",
  1: "Médio",
  0: "Medíocre",
  [-1]: "Ruim",
  [-2]: "Terrível",
};

export function fateLadder(value: number): string {
  if (value > 8) return "Além de Lendário";
  if (value < -2) return "Pior que Terrível";
  return LADDER[value];
}

export function signed(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  strong: "Acerto forte",
  weak: "Acerto parcial",
  miss: "Erro",
};

export function outcomeLabel(outcome: Outcome): string {
  return OUTCOME_LABEL[outcome];
}

const FATE_FACE: Record<number, string> = { [-1]: "menos", 0: "vazio", 1: "mais" };

/** Texto completo da rolagem, pensado para ser lido por leitor de tela. */
export function describeRoll(roll: Roll): string {
  switch (roll.kind) {
    case "generic": {
      const parts = roll.terms.map((term) =>
        `${term.sign < 0 ? "-" : ""}${term.count}d${term.sides}: ${term.rolls.join(", ")}`
      );
      const modifier = roll.modifier === 0 ? "" : ` ${signed(roll.modifier)}`;
      return `Rolagem ${roll.expression}. ${parts.join("; ")}${modifier}. Total ${roll.total}.`;
    }
    case "fate": {
      const faces = roll.dice.map((die) => FATE_FACE[die]).join(", ");
      const sum = roll.dice.reduce<number>((a, b) => a + b, 0);
      const name = roll.label ? ` ${roll.label}` : "";
      return `Fate${name}. Dados: ${faces}, soma ${signed(sum)}. Modificador ${signed(roll.modifier)}. ` +
        `Resultado ${signed(roll.total)}, ${roll.ladder}.`;
    }
    case "ironsworn": {
      const name = roll.label ? ` ${roll.label}` : "";
      if (roll.burnedMomentum !== undefined) {
        return `Ironsworn${name}. Momentum queimado: ${roll.burnedMomentum} no lugar do dado de ação, ` +
          `contra ${roll.challenge[0]} e ${roll.challenge[1]}. ${outcomeLabel(roll.outcome)}.` +
          (roll.match ? " Coincidência nos dados de desafio!" : "");
      }
      const capped = roll.actionDie + roll.modifier > 10 ? " (limitado a 10)" : "";
      return `Ironsworn${name}. Dado de ação ${roll.actionDie} ${signed(roll.modifier)} = ${roll.actionScore}${capped}, ` +
        `contra ${roll.challenge[0]} e ${roll.challenge[1]}. ${outcomeLabel(roll.outcome)}.` +
        (roll.match ? " Coincidência nos dados de desafio!" : "");
    }
    case "progress": {
      const name = roll.label ? ` ${roll.label}` : "";
      return `Rolagem de progresso${name}. Progresso ${roll.progress} contra ${roll.challenge[0]} e ${roll.challenge[1]}. ` +
        `${outcomeLabel(roll.outcome)}.` + (roll.match ? " Coincidência nos dados de desafio!" : "");
    }
  }
}
