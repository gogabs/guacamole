import ironsworn from "../../content/ironsworn.json" with { type: "json" };
import { DUNGEON_WORLD_COMPENDIUM } from "./dw2.ts";
import {
  FATE_ACCELERATED_COMPENDIUM,
  FATE_CONDENSED_COMPENDIUM,
  FATE_CORE_COMPENDIUM,
} from "./fate.ts";
import type { Compendium, CompendiumItem, CompendiumSummary } from "./types.ts";

export * from "./oracle.ts";
export type * from "./types.ts";

export const IRONSWORN_COMPENDIUM = ironsworn as unknown as Compendium;

export const BUILT_IN_COMPENDIUMS: readonly Compendium[] = [
  FATE_CORE_COMPENDIUM,
  FATE_ACCELERATED_COMPENDIUM,
  FATE_CONDENSED_COMPENDIUM,
  DUNGEON_WORLD_COMPENDIUM,
  IRONSWORN_COMPENDIUM,
];

export function findCompendium(id: string): Compendium | undefined {
  return BUILT_IN_COMPENDIUMS.find((c) => c.id === id);
}

export function findCompendiumItem(compendiumId: string, itemId: string): CompendiumItem | undefined {
  return findCompendium(compendiumId)?.items.find((i) => i.id === itemId);
}

function countOf(item: CompendiumItem): number {
  return item.kind === "oracles" ? item.tables.length + item.combos.length + (item.odds ? 1 : 0) : item.entries.length;
}

/** A lista do que a mesa pode adicionar; o conteúdo de cada item é pedido à parte. */
export function compendiumCatalog(): CompendiumSummary[] {
  return BUILT_IN_COMPENDIUMS.map((c) => ({
    id: c.id,
    name: c.name,
    system: c.system,
    description: c.description,
    items: c.items.map((i) => ({ id: i.id, name: i.name, kind: i.kind, count: countOf(i) })),
  }));
}
