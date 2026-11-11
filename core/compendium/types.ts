/**
 * Um compêndio é um pacote de referência de um sistema (regras, movimentos, oráculos, ativos...).
 * A mesa adiciona os que quiser; cada compêndio vira uma seção, e cada item da seção se comporta
 * conforme o seu `kind`.
 */

export interface ReferenceEntry {
  id: string;
  /** Agrupa as entradas na lista (ex.: "Combate"). */
  group: string;
  title: string;
  /** Uma linha que diz quando a entrada vale; lida na lista antes de abrir. */
  summary?: string;
  /** Texto simples; cada linha é um parágrafo ou um item ("- ..."). */
  text: string;
}

export interface AssetAbility {
  name: string;
  text: string;
  /** Já vem marcada ao pegar o ativo. */
  starts: boolean;
}

export interface AssetEntry {
  id: string;
  category: string;
  name: string;
  terror: boolean;
  flavor: string;
  abilities: AssetAbility[];
  /** Campos e medidores impressos no ativo (nome, saúde...). */
  extras: AssetExtra[];
}

/** Um campo de texto escolhido ao pegar o ativo, ou, com `meter`, um medidor que a ficha ajusta. */
export interface AssetExtra {
  label: string;
  meter?: { max: number; start: number };
}

export interface OracleRow {
  min: number;
  max: number;
  text: string;
}

export interface OracleTable {
  id: string;
  group: string;
  name: string;
  /** Só "d100" por enquanto. */
  dice: string;
  rows: OracleRow[];
}

/** Rola várias tabelas de uma vez e junta os resultados. */
export interface OracleCombo {
  id: string;
  name: string;
  tables: string[];
  join: string;
}

/** Pergunta de sim ou não: a probabilidade escolhida é o menor resultado que vale "sim". */
export interface OracleOdds {
  name: string;
  options: { label: string; threshold: number }[];
}

export interface ReferenceItem {
  id: string;
  name: string;
  kind: "reference";
  entries: ReferenceEntry[];
}

export interface AssetsItem {
  id: string;
  name: string;
  kind: "assets";
  entries: AssetEntry[];
}

export interface OraclesItem {
  id: string;
  name: string;
  kind: "oracles";
  tables: OracleTable[];
  combos: OracleCombo[];
  odds?: OracleOdds;
}

export type CompendiumItem = ReferenceItem | AssetsItem | OraclesItem;
export type CompendiumItemKind = CompendiumItem["kind"];

export interface Compendium {
  id: string;
  name: string;
  system: "fate" | "ironsworn" | "dungeon-world";
  description: string;
  /** Fonte e licença; mostrada no fim da seção. */
  attribution: string;
  items: CompendiumItem[];
}

/** O que a lista de compêndios disponíveis mostra, sem o conteúdo. */
export interface CompendiumSummary {
  id: string;
  name: string;
  system: Compendium["system"];
  description: string;
  items: { id: string; name: string; kind: CompendiumItemKind; count: number }[];
}
