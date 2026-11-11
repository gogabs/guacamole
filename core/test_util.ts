import type { Rng } from "./rng.ts";

/** Gera um Rng que devolve os valores dados, em ordem. */
export function seq(...values: number[]): Rng {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error("Rng esgotado");
    return values[i++];
  };
}

/** Float que produz a face `value` (1..sides) em rollDie. */
export const face = (value: number, sides: number) => (value - 1 + 0.5) / sides;
/** Float que produz o dado Fate -1, 0 ou +1. */
export const fateFace = (value: -1 | 0 | 1) => (value + 1 + 0.5) / 3;
