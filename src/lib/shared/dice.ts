import type { DiceResult } from "./types.ts";

const DICE_PATTERN = /^\/(?:r|roll)\s+(\d*)d(\d+)(?:\s*([+-])\s*(\d+))?$/i;

export function rollDiceCommand(input: string): DiceResult | null {
  const match = input.trim().match(DICE_PATTERN);
  if (!match) return null;

  const count = clampNumber(Number(match[1] || "1"), 1, 100);
  const sides = clampNumber(Number(match[2]), 2, 1000);
  const modifier = match[3] && match[4]
    ? Number(`${match[3]}${match[4]}`)
    : 0;
  const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
  const total = rolls.reduce((sum, roll) => sum + roll, 0) + modifier;
  const modifierLabel = modifier === 0 ? "" : modifier > 0 ? `+${modifier}` : `${modifier}`;

  return {
    expression: `${count}d${sides}${modifierLabel}`,
    total,
    rolls,
    sides,
    modifier
  };
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
