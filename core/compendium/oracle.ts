import { ROLL_SEPARATOR } from "../dice.ts";
import { type Rng, rollDie } from "../rng.ts";
import type { OraclesItem, OracleTable } from "./types.ts";

export class OracleError extends Error {}

/** Na mesa, o 100 aparece como "00", como no dado de dezenas. */
export function d100Label(value: number): string {
  return value === 100 ? "00" : String(value);
}

function pickRow(table: OracleTable, value: number): string {
  const row = table.rows.find((r) => value >= r.min && value <= r.max);
  if (!row) throw new OracleError(`A tabela ${table.name} não cobre o resultado ${value}.`);
  return row.text;
}

function findTable(item: OraclesItem, tableId: string): OracleTable {
  const table = item.tables.find((t) => t.id === tableId);
  if (!table) throw new OracleError("Tabela de oráculo desconhecida.");
  return table;
}

export type OracleTarget =
  | { type: "table"; tableId: string }
  | { type: "combo"; comboId: string }
  | { type: "odds"; threshold: number };

/** Resolve uma rolagem de oráculo e devolve o texto que entra no histórico da mesa. */
export function rollOracle(item: OraclesItem, target: OracleTarget, rng: Rng): string {
  if (target.type === "table") {
    const table = findTable(item, target.tableId);
    const value = rollDie(rng, 100);
    return `${pickRow(table, value)}${ROLL_SEPARATOR}${table.name}, d100 ${d100Label(value)}`;
  }

  if (target.type === "combo") {
    const combo = item.combos.find((c) => c.id === target.comboId);
    if (!combo) throw new OracleError("Combinação de oráculos desconhecida.");
    const parts: string[] = [];
    const values: string[] = [];
    for (const tableId of combo.tables) {
      const value = rollDie(rng, 100);
      parts.push(pickRow(findTable(item, tableId), value).trim());
      values.push(d100Label(value));
    }
    let result = parts.join(combo.join);
    if (combo.join === "") result = result.charAt(0).toUpperCase() + result.slice(1).toLowerCase();
    return `${result}${ROLL_SEPARATOR}${combo.name}, d100 ${values.join(" e ")}`;
  }

  const odds = item.odds;
  const option = odds?.options.find((o) => o.threshold === target.threshold);
  if (!odds || !option) throw new OracleError("Probabilidade desconhecida.");
  const value = rollDie(rng, 100);
  const yes = value >= option.threshold;
  // Dois números iguais (11, 22 ... 99, 00) são uma coincidência: um resultado extremo.
  const match = value === 100 || value % 11 === 0;
  return `${yes ? "Sim" : "Não"}${match ? ", coincidência" : ""}${ROLL_SEPARATOR}` +
    `${odds.name}, ${option.label.toLowerCase()}, d100 ${d100Label(value)}`;
}
