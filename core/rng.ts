/** Fonte de aleatoriedade em [0, 1). Injetável para tornar rolagens testáveis. */
export type Rng = () => number;

export const defaultRng: Rng = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

/** Rola um dado de `sides` faces: 1..sides. */
export function rollDie(rng: Rng, sides: number): number {
  return 1 + Math.floor(rng() * sides);
}

/** Rola um dado Fate: -1, 0 ou +1. */
export function rollFateDie(rng: Rng): -1 | 0 | 1 {
  return (Math.floor(rng() * 3) - 1) as -1 | 0 | 1;
}
