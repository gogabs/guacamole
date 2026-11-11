import { reference } from "./dw2_rules.ts";
import type { AssetEntry, AssetsItem } from "./types.ts";

/** Equipamento do Dungeon World 2: o que se escolhe para a ficha (com os usos) e as tabelas de apoio. */

type Gear = [name: string, text: string, uses?: number];

function gear(id: string, category: string, [name, text, uses]: Gear): AssetEntry {
  return {
    id: `${id}-${name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-")}`,
    category,
    name,
    terror: false,
    flavor: text,
    abilities: [],
    extras: uses ? [{ label: "Usos", meter: { max: uses, start: uses } }] : [],
  };
}

const ARMOR: Gear[] = [
  ["Armadura leve", "Custo 1. 3 usos. Desajeitada se FOR abaixo de 1. Marque um uso para ignorar até 1 de dano de um ataque.", 3],
  ["Armadura média", "Custo 2. 3 usos. Desajeitada se FOR abaixo de 2. Marque um uso para ignorar até 2 de dano de um ataque.", 3],
  ["Armadura pesada", "Custo 3. 3 usos. Desajeitada se FOR abaixo de 3. Marque um uso para ignorar até 3 de dano de um ataque.", 3],
  ["Escudo", "Custo 1. 1 uso. Marque um uso para ignorar todo o dano de um ataque. Trocar de escudo não renova os usos.", 1],
];

const MELEE: Gear[] = [
  ["Desarmado", "1 de dano, Mão, Leve. Custo 0."],
  ["Adaga", "1 de dano, Precisa, Letal, Mão, Médio, Leve. Custo 1."],
  ["Facas escondidas", "1 de dano, Precisa, Letal, Mão, Médio, Leve, Infinita. Custo 2."],
  ["Rapieira", "2 de dano, Perto, Precisa. Custo 1."],
  ["Espada ou machadinha", "2 de dano, Perto, Leve. Custo 1."],
  ["Chicote", "1 de dano, Precisa, Perto, Médio, Distintiva. Custo 1."],
  ["Soco-inglês", "1 de dano, Mão, Leve. Custo 1."],
  ["Martelo de guerra", "2 de dano, Mão, Contundente. Custo 1."],
  ["Mangual", "2 de dano, Perto, Desajeitada, Brutal, Contundente. Custo 1."],
  ["Lança curta", "2 de dano, Mão, Perto. Custo 1."],
  ["Cajado", "1 de dano, Mão, Perto, Duas mãos. Custo 1."],
  ["Martelo grande", "3 de dano, Perto, Desajeitada, Duas mãos, Contundente. Custo 1."],
  ["Lança longa", "2 de dano, Perto, Médio, Duas mãos. Custo 1."],
  ["Espada grande", "2 de dano, Perto, Duas mãos. Custo 1."],
  ["Machado de batalha", "3 de dano, Perto, Desajeitada, Duas mãos, Brutal. Custo 1."],
];

const RANGED: Gear[] = [
  ["Besta de mão", "1 de dano, Médio, Precisa, Munição, Leve, Recarga, Distintiva. Custo 2."],
  ["Funda", "1 de dano, Médio, Precisa, Recarga. Custo 1."],
  ["Feixe de dardos", "1 de dano, Perto, Médio, Infinita. Custo 2."],
  ["Arco", "2 de dano, Médio, Longe, Precisa, Munição, Duas mãos. Custo 2."],
  ["Besta", "2 de dano, Médio, Longe, Precisa, Perfurante, Duas mãos, Recarga, Munição. Custo 2."],
  ["Balista de mão", "3 de dano, Médio, Longe, Precisa, Perfurante, Contundente, Duas mãos, Recarga, Munição. Custo 2."],
  ["Arco grande", "3 de dano, Médio, Longe, Desajeitada, Perfurante, Duas mãos, Contundente, Munição. Custo 2."],
];

const GENERAL: Gear[] = [
  ["Equipamento de aventura", "Custo 2. Tochas, giz, varas, pregos, cordas, frigideira e afins. Ao vasculhar atrás de um item comum viável, gaste um uso e consiga o que precisa; pode ficar com ele.", 3],
  ["Sacola de livros", "Custo 2. Quem acha que eruditos são fracos nunca carregou uma biblioteca nas costas. Ao procurar um registro relevante, gaste um uso para achá-lo; pode ficar com ele.", 3],
  ["Bandoleira de frascos", "Custo 2. Frascos protegidos de derramar e quebrar, mas à mão. Ao sacar um, gaste um uso e escolha o tipo: Ácido (derrete substâncias orgânicas), Ofuscante (luzes fortes e barulhos altos), Flamejante (explode em chamas) ou Sagrado (purifica corrupção e mortos-vivos).", 3],
  ["Poção de cura", "Custo 3. Em geral um frasco de líquido ralo e vermelho. Ao beber a poção inteira, ela sai dos seus pertences e você cura de imediato metade dos PV máximos."],
  ["Banquete farto", "Custo 2. Um guerreiro aguenta o inferno se há uma boa refeição depois. Ao dividir esta refeição ao Montar Acampamento, todos os PCs curam tudo quando o acampamento termina."],
  ["Remédio", "Custo 2. Cataplasmas, ervas calmantes ou similares. Ao aplicar por alguns minutos, marque um uso e escolha para o paciente: limpar um mal comum, como doença ou veneno; ou dobrar o próximo valor de PV que ele restaurar.", 2],
  ["Kit de venenos", "Custo 2. Ervas, venenos, agulhas e antídotos. Ao tirar ou criar um veneno, gaste 1 uso para um comum, ou 2 para um sob medida com o Mestre. Erva-sangrenta: ao contato, o alvo causa 1 a menos de dano até o fim da cena. Raiz-dourada: ao consumir, confia por completo na próxima pessoa que vir até o fim da cena. Óleo de taggit: ao consumir, adormece de leve. Lágrimas de serpente: ao contato, o alvo sofre 1 de dano extra até o fim da cena.", 2],
  ["Suprimentos", "Custo 2. Comida, água, ataduras, qualquer coisa que alivie num momento de respiro. Ao Confortar ou Apoiar, ao responder as perguntas do movimento, gaste um uso para tratar um \"não\" como \"sim\".", 3],
  ["Kit de armadilhas", "Custo 2. Armadilha de urso, fio de tropeço, saco de abrolhos, bolinhas de gude ou similares. Quando você passa tempo montando com antecedência, vira um perigo e um entrave para quem entrar no alcance, em geral causando 2 de dano.", 2],
  ["Vara de pescar", "Custo 1. O que se usa para pescar importa menos que o que se sente. Ao pescar com alguém, pode usar Influenciar Decisão ou Perceber Intenções com SAB ou CAR, e com 12 ou mais escolha uma: pescar algo valioso, ganhando 1 de tesouro; ter um momento com a pessoa, limpando uma condição; testemunhar algo importante, que o Mestre conta."],
];

export const DW2_EQUIPMENT: AssetsItem = {
  id: "equipment",
  name: "Equipamento",
  kind: "assets",
  entries: [
    ...ARMOR.map((g) => gear("armor", "Armaduras", g)),
    ...MELEE.map((g) => gear("melee", "Armas de corpo a corpo", g)),
    ...RANGED.map((g) => gear("ranged", "Armas à distância", g)),
    ...GENERAL.map((g) => gear("general", "Equipamento geral", g)),
  ],
};

export const DW2_TAGS = reference("tags", "Etiquetas, preços e saque", [
  {
    group: "Etiquetas",
    title: "Alcance",
    text: "- Mão: útil quando dá para agarrar o alvo.\n- Perto: útil a poucos passos, perto o bastante para ler a expressão do outro.\n- Médio: útil perto o bastante para conversar, mesmo elevando a voz.\n- Longe: útil perto o bastante para ver com clareza ou ouvir um grito a plenos pulmões.",
  },
  {
    group: "Etiquetas",
    title: "Gerais",
    text: "- X de custo: custa X de tesouro.\n- X usos: pode ser usado X vezes antes de renovar.\n- X de dano: causa X de dano ao trocar dano.\n" +
      "- Munição: precisa de munição; por padrão você sempre tem, mas o Mestre pode dizer que acabou num movimento.\n- Área: atinge vários alvos próximos.\n" +
      "- Desajeitada: pesada, lenta ou difícil de manejar; desvantagem em DES enquanto a empunha.\n- Distintiva: som, aparência ou impressão óbvia e única ao usar.\n" +
      "- Contundente: golpes poderosos e esmagadores que derrubam alvos.\n- Infinita: não é um item, é um feixe de \"tantos que não dá para contar\"; o Mestre ainda pode dizer que acabou.\n" +
      "- Leve: usada com conforto numa mão ou nas duas, se tiver duas.\n- Brutal: golpes dolorosos e macabros que causam dor debilitante ou perda de membros.\n" +
      "- Perfurante: corta ou ultrapassa armadura e escudo grossos.\n- Precisa: exige mira rápida e cuidadosa para usar bem.\n- Recarga: não pode ser usada de novo sem tempo para recarregar, rearmar ou recarregar a energia.\n" +
      "- Duas mãos: exige as duas mãos para usar direito; em geral com mais dano ou alcance.\n- Letal: especialmente mortal em pontos vulneráveis; ao causar dano explorando uma vantagem, causa +1.",
  },
  {
    group: "Preços",
    title: "Bens e serviços de exemplo",
    text: "Por 1, 2 ou 3 de tesouro, respectivamente:\n" +
      "- Uma semana de hospedagem: quarto compartilhado numa estalagem simples; quartos separados numa estalagem luxuosa; ala de mansão ou palácio de nobre.\n" +
      "- Comprar ou construir: chalé de um cômodo; casa confortável de vários cômodos; grande propriedade ou mansão.\n" +
      "- Passagem guiada por uma área: inconveniente ou desagradável; perigosa ou implacável; mortal ou insondável.\n" +
      "- Uma noite de canto, dança ou companhia: alguém comum; alguém de prestígio ou inacessível; alguém da realeza, mágico ou divino.\n" +
      "- Acesso a uma organização: um clube ou associação comum; uma corte nobre ou guilda de prestígio; uma cabala secreta ou grupo lendário.\n" +
      "- Informação sobre: uma figura pública ou evento recente; uma figura privada ou história obscura; um mentor sombrio ou mistério antigo.\n" +
      "- Conserto de: equipamento comum ou uma casinha; equipamento primoroso ou a maioria dos itens mágicos, uma mansão; artefatos, itens mágicos antigos, um palácio ou fortaleza.\n" +
      "- Multa, recompensa ou suborno por: um crime pequeno, como bater carteira; crime significativo, como agressão ou incêndio; crime capital, como assassinato ou traição.\n" +
      "- Veículo: carroça simples ou canoa; animal de montaria, barco de seis pessoas ou carruagem blindada; montaria de guerra treinada e blindada ou belo navio pequeno.\n" +
      "- Serviços de: capanga comum, sentinela ou assistente; soldado bem treinado, erudito ou espião; mago de elite, conselheiro ou guarda-costas.\n" +
      "- Comida e bebida para: reunião com poucos amigos; festim animado; grande banquete.\n" +
      "- Roupa e estilo para: passar despercebido entre cidadãos comuns; impressionar cidadãos comuns ou se misturar à alta classe; impressionar a alta classe ou se misturar à realeza.\n" +
      "- Tratamento e cura de: ferimentos comuns e doenças simples; ferimentos mágicos e doenças debilitantes; maldições e outros males sombrios.\n" +
      "Equipamento em bom estado revende pelo custo base; danificado ou usado, no máximo metade, arredondada para baixo.",
  },
  {
    group: "Saque",
    title: "Eu Saqueio o Corpo",
    text: "Ao revistar os pertences de inimigos derrotados, o Mestre pode já saber o que há, ou usar esta tabela. Ele escolhe uma entrada, ou um de vocês rola 2d6 e soma o dano do inimigo. O Mestre escolhe então entre os itens do resultado. Se o NPC era especialmente rico ou pobre, role com vantagem ou desvantagem.\n" +
      "- 3: vara de pescar ou arma de corpo a corpo de custo 1, nova em folha.\n- 4: mercadorias ou ferramentas especializadas que valem 1 de tesouro.\n" +
      "- 5: armadura leve ou arma à distância de custo 1.\n- 6: comida suficiente para contar como Suprimentos ou Banquete farto.\n" +
      "- 7: armadura média ou arma de custo 2.\n- 8: Equipamento de aventura ou Kit de armadilhas.\n- 9: especiarias variadas ou joias cintilantes que valem 2 de tesouro.\n" +
      "- 10: um Achado Notável.\n- 11: ervas e químicos para Remédio ou Kit de venenos.\n- 12: Bandoleira de frascos ou Sacola de livros.\n- 13: Poção de cura.\n" +
      "- 14: moedas que valem 1 de tesouro e um Achado Notável.\n- 15: roupas extravagantes ou gemas lapidadas que valem 3 de tesouro.\n- 16 ou mais: um Achado Notável ou Item Mágico, e role de novo.",
  },
  {
    group: "Saque",
    title: "Achados Notáveis",
    text: "Role 1d6 ou escolha o tipo, e então invente o objeto a partir das ideias:\n" +
      "1. Artefato Cultural: Flor-da-Aurora, que abençoa a terra ao redor; Chave Gravada, que abre uma cripta antiga, cofre secreto ou túnel oculto; Canção Lendária, que amolece ou inspira qualquer coração; Livro Sagrado, texto religioso raro ou herético; Coroa Amaldiçoada, usada por um governante terrível; Espelho do Renascimento, em que quem olha pode virar outra pessoa.\n" +
      "2. Indivíduo Importante: Herdeiro Desaparecido; Companheiro Exótico, filhote ou ovo de criatura mítica; Vidente Profético; Guardião de Segredos; Último Sobrevivente de uma nação caída ou cabala antiga; Artesão Lendário de armas ou invenções incomparáveis.\n" +
      "3. Tecnologia Avançada: Máquina Voadora; Carruagem sem Cavalos; Comunicador, que envia mensagens ou traduz idiomas na hora; Coletor de Raios, que alimenta máquinas sem fim; Autômato Senciente; Banco de Dados do tamanho de um cubo pequeno.\n" +
      "4. Riquezas Incríveis: Tesouro de Moedas; Gema Cintilante; Obra-Prima, a última peça de um artista famoso; Lingote Raro, de metal muito forte ou de traços únicos; Restos Delicados, couro ou chifres de criatura antiga ou mágica; Letra de Dívida de alguém de grande riqueza ou poder.\n" +
      "5. Equipamento Renomado: Espada da Luz das Estrelas; Martelo Forjamundo, que remodela metal sem calor; Cinto da Resistência; Corda Viva, que torna triviais os precipícios mais perigosos; Arco da Águia, que acerta a qualquer distância; Corcel do Campeão, companheiro de toda a vida de quem ganha sua lealdade.\n" +
      "6. Bem Comunitário: Escritura de uma mansão familiar, castelo antigo ou palácio amaldiçoado; Convite para baile rico, festim alegre ou reunião secreta; Filiação a uma sociedade prestigiosa ou comunidade oculta; Trunfo, segredo de um Amigo ou fraqueza de um Inimigo; Título, barão de uma cidade ou membro de um conselho; Assistência de um servo especialista ou bando de mercenários.\n" +
      "Cada ideia traz uma pergunta no livro original para o Mestre criar complicações: por que é perigoso ou limitado, quem mais o procura, o que se perdeu para tê-lo.",
  },
]);
