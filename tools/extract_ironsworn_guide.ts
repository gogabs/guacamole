// Gera content/ironsworn.json a partir do HTML do "Guia de Mesa Ironsworn" (artefato salvo em disco).
// Uso: deno run --allow-read --allow-write tools/extract_ironsworn_guide.ts <guia.html> content/ironsworn.json
//
// O guia é regular o bastante para ler com expressões regulares; o resultado é o formato de
// core/compendium/types.ts. Rodar de novo regenera o arquivo inteiro.

const [source, target] = Deno.args;
if (!source || !target) {
  console.error("Uso: extract_ironsworn_guide.ts <guia.html> <saida.json>");
  Deno.exit(1);
}
const html = await Deno.readTextFile(source);

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

function decode(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m);
}

/** HTML do guia para texto simples: parágrafos viram linhas e itens de lista viram "- ". */
function toText(fragment: string): string {
  const text = fragment
    .replace(/<li[^>]*>/g, "\n- ")
    .replace(/<\/(p|ul|ol|div|h\d)>/g, "\n")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, "");
  return decode(text)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

const inline = (fragment: string) => toText(fragment).replace(/\s*\n\s*/g, " ");

function slice(from: string, to?: string): string {
  const start = html.indexOf(from);
  if (start < 0) throw new Error(`Não achei ${from}`);
  const end = to ? html.indexOf(to, start) : html.length;
  return html.slice(start, end);
}

const pMoves = slice('id="p-moves"', 'id="p-oracles"');
const pOracles = slice('id="p-oracles"', 'id="p-assets"');
const pAssets = slice('id="p-assets"', 'id="p-gloss"');
const pGloss = slice('id="p-gloss"', 'id="p-about"');

// --- Movimentos -------------------------------------------------------------------------------

interface Entry {
  id: string;
  group: string;
  title: string;
  /** Linha curta que resume quando o texto vale (movimentos). */
  summary?: string;
  text: string;
}

const STAT_LABEL = /^\+/;

const moves: Entry[] = [];
const moveGroups = pMoves.split('<section class="group"').slice(1);
for (const block of moveGroups) {
  const group = inline(block.match(/<h2>([^<]*)<\/h2>/)![1]);
  const cleaned = block.replace(/<section class="otable inline"[\s\S]*?<\/section>/g, "");
  for (const part of cleaned.split('<details class="move"').slice(1)) {
    const id = part.match(/id="mv-([^"]+)"/)![1];
    const title = inline(part.match(/<span class="mname">([\s\S]*?)<\/span>/)![1]);
    const trigger = inline(part.match(/<span class="trig">([\s\S]*?)<\/span>/)?.[1] ?? "");
    const stats = [...part.matchAll(/<span class="chip stat">([^<]*)<\/span>/g)].map((m) => m[1]);
    const progress = part.includes('<span class="chip prog">');
    const body = part.match(/<div class="mbody">([\s\S]*?)<\/div><\/details>/)![1];
    const tables = [...block.matchAll(new RegExp(`data-table="classic/oracles/moves/${id}"`, "g"))].length > 0;
    let text = toText(body);
    if (tables) text += `\nHá uma tabela de oráculo para este movimento, em Oráculos.`;
    const how = progress ? "movimento de progresso" : stats.filter((s) => STAT_LABEL.test(s)).join(" ou ");
    moves.push({
      id,
      group,
      title,
      summary: how ? `${trigger}. Rola ${how}.` : `${trigger}.`,
      text,
    });
  }
}

// --- Oráculos -----------------------------------------------------------------------------------

interface Row {
  min: number;
  max: number;
  text: string;
}
interface Table {
  id: string;
  group: string;
  name: string;
  dice: string;
  rows: Row[];
}

const tables: Table[] = [];
const oracleGroups = pOracles.split('<section class="group"').slice(1);
for (const block of oracleGroups) {
  const group = inline(block.match(/<h2>([^<]*)<\/h2>/)![1]);
  const sections = block.split(/<section class="otable[^"]*"/).slice(1);
  for (const part of sections) {
    const id = part.match(/data-table="classic\/oracles\/([^"]+)"/)?.[1];
    if (!id) continue;
    const name = inline(part.match(/<h[45]>([^<]*)<\/h[45]>/)![1]);
    const dice = part.match(/<span class="dice">([^<]*)<\/span>/)![1];
    const rows = [...part.matchAll(/<tr data-min="(\d+)" data-max="(\d+)"><th[^>]*>[^<]*<\/th><td>([\s\S]*?)<\/td><\/tr>/g)]
      .map((m) => ({ min: Number(m[1]), max: Number(m[2]), text: inline(m[3]) }));
    if (rows.length === 0) throw new Error(`Tabela sem linhas: ${id}`);
    tables.push({ id: id.replaceAll("/", "."), group, name, dice, rows });
  }
}

const tableId = (path: string) => path.replaceAll("/", ".");

// --- Ativos -------------------------------------------------------------------------------------

const CATEGORY: Record<string, string> = {
  companion: "Companheiro",
  path: "Caminho",
  combat_talent: "Talento de combate",
  ritual: "Ritual",
};

interface Asset {
  id: string;
  category: string;
  name: string;
  terror: boolean;
  /** Frase de abertura do ativo. */
  flavor: string;
  abilities: { name: string; text: string; starts: boolean }[];
  /** Campos e medidores impressos na carta (nome, saúde...). */
  extras: { label: string; meter?: { max: number; start: number } }[];
}

/** "Saúde 4" é um medidor que começa cheio; "Essência 6, começa em 0" começa vazio. */
function parseExtra(kind: string, raw: string): Asset["extras"][number] {
  const meter = kind === "meter" ? raw.match(/^(.*?)\s+(\d+)(?:,\s*começa em (\d+))?$/) : null;
  if (!meter) return { label: raw };
  const max = Number(meter[2]);
  return { label: meter[1], meter: { max, start: meter[3] === undefined ? max : Number(meter[3]) } };
}

const assets: Asset[] = [];
for (const part of pAssets.split('<article class="asset"').slice(1)) {
  const id = part.match(/id="as-([^"]+)"/)![1];
  const cat = part.match(/data-cat="([^"]+)"/)![1];
  const name = inline(part.match(/<h3>([\s\S]*?)<\/h3>/)![1]);
  const flavor = inline(part.match(/<p class="req">([\s\S]*?)<\/p>/)?.[1] ?? part.match(/<p class="flavor">([\s\S]*?)<\/p>/)?.[1] ?? "");
  const abilities = [...part.matchAll(/<li class="([^"]*)"><span class="dot">[^<]*<\/span><div>([\s\S]*?)<\/div><\/li>/g)]
    .map((m) => {
      const body = m[2];
      const label = body.match(/<strong class="an">([\s\S]*?)<\/strong>/);
      const rest = label ? body.replace(label[0], "") : body;
      return { name: label ? inline(label[1]).replace(/\.$/, "") : "", text: toText(rest), starts: m[1].includes("on") };
    });
  const extras = [...part.matchAll(/<span class="(field|meter)">([^<]*)<\/span>/g)].map((m) => parseExtra(m[1], decode(m[2])));
  assets.push({
    id,
    category: CATEGORY[cat] ?? cat,
    name,
    terror: part.includes('class="stamp"'),
    flavor,
    abilities,
    extras,
  });
}

// --- Glossário ------------------------------------------------------------------------------------

const glossary: Entry[] = [];
for (const block of pGloss.split('<section class="group"').slice(1)) {
  const group = inline(block.match(/<h2>([^<]*)<\/h2>/)![1]);
  const body = block.slice(block.indexOf("<tbody>"));
  for (const m of body.matchAll(/<tr[^>]*><th[^>]*>([\s\S]*?)<\/th><td>([\s\S]*?)<\/td>(?:<td>([\s\S]*?)<\/td>)?<\/tr>/g)) {
    const title = inline(m[1]);
    const original = inline(m[2]);
    const note = inline(m[3] ?? "");
    glossary.push({
      id: `${glossary.length + 1}`,
      group,
      title,
      text: [original ? `Original: ${original}.` : "", note ? `${note[0].toUpperCase()}${note.slice(1)}.` : ""]
        .filter(Boolean).join(" ") || title,
    });
  }
}

// --- Saída ----------------------------------------------------------------------------------------

const compendium = {
  id: "ironsworn",
  name: "Ironsworn",
  system: "ironsworn",
  description: "Movimentos, oráculos, ativos e glossário do Ironsworn clássico, em português.",
  attribution:
    "Ironsworn, de Shawn Tomkin. Texto-base e estrutura do Datasworn, de rsek, licenciado sob CC BY 4.0. " +
    "Tradução e organização do Guia de Mesa Ironsworn. Material de fã, não oficial.",
  items: [
    { id: "moves", name: "Movimentos", kind: "reference", entries: moves },
    {
      id: "oracles",
      name: "Oráculos",
      kind: "oracles",
      tables,
      combos: [
        {
          id: "action_theme",
          name: "Ação e tema",
          tables: [tableId("action_and_theme/action"), tableId("action_and_theme/theme")],
          join: " + ",
        },
        {
          id: "settlement_name",
          name: "Nome de povoado (gerador rápido)",
          tables: [tableId("settlement/quick_name/prefix"), tableId("settlement/quick_name/suffix")],
          join: "",
        },
      ],
      odds: {
        name: "Pergunta de sim ou não",
        options: [
          { label: "Quase certo", threshold: 11 },
          { label: "Provável", threshold: 26 },
          { label: "50/50", threshold: 51 },
          { label: "Improvável", threshold: 76 },
          { label: "Pouca chance", threshold: 91 },
        ],
      },
    },
    { id: "assets", name: "Ativos", kind: "assets", entries: assets },
    { id: "glossary", name: "Glossário", kind: "reference", entries: glossary },
  ],
};

await Deno.writeTextFile(target, JSON.stringify(compendium, null, 1) + "\n");
console.log(
  `movimentos ${moves.length}, tabelas ${tables.length}, ativos ${assets.length}, glossário ${glossary.length}`,
);
