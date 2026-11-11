import type { AssetAbility, AssetEntry, AssetExtra, AssetsItem } from "./types.ts";
import { reference } from "./dw2_rules.ts";

/**
 * As nove classes do Dungeon World 2 (Alfa Final): cada uma vira, nos playbooks, uma carta do movimento
 * inicial e uma carta por caminho; e, na referência, uma entrada com equipamento, atributos e origens.
 */

type Move = [name: string, text: string];

interface Path {
  name: string;
  /** O movimento ganho ao escolher o caminho. */
  start: Move;
  advanced: Move[];
  extras?: AssetExtra[];
}

interface PlayClass {
  id: string;
  name: string;
  pitch: string;
  start: Move;
  /** Informações impressas na ficha da classe, em linhas. */
  sheet: string[];
  extras?: AssetExtra[];
  paths: Path[];
}

const ability = ([name, text]: Move, starts: boolean): AssetAbility => ({ name, text, starts });

const meter = (label: string, max: number, start = 0): AssetExtra => ({ label, meter: { max, start } });
const field = (label: string): AssetExtra => ({ label });

const ADVANCEMENTS =
  "Ao subir de nível, escolha um:\n" +
  "- Ganhar um Caminho da sua classe (uma vez, quadrado único).\n" +
  "- +1 em qualquer atributo, até 2 (duas vezes).\n" +
  "- Ganhar um Conflito, se não tiver um (sem limite).\n" +
  "- Ganhar um movimento avançado de um dos seus Caminhos (sem limite).\n" +
  "- Trocar de classe (removido temporariamente em algumas versões).\n" +
  "Do nível 5 em diante, também: outro Caminho da classe; +1 em atributo (até 2); multiclasse, um Caminho de classe que não está em jogo; um Item Mágico.\n" +
  "Do nível 10 em diante, também: +1 em atributo (até 3); multiclasse; escolher um Artefato ou criar um com o Mestre, que dá uma pista de onde achar.\n" +
  "Ao resolver um Conflito, escolha uma recompensa da classe, entre ela e o Momento de Heroísmo: ao usá-lo você assume todo o controle da narrativa, descreve uma última façanha que muda o mundo ou os outros personagens e sai da narrativa como quiser (aposentadoria, morte...).";

const CLASSES: PlayClass[] = [
  {
    id: "barbarian",
    name: "Bárbaro",
    pitch:
      "Você veio dos confins do mundo atrás de glória, honra, vingança ou tesouro, e sabe o que há de melhor na vida e toma. Chamam você de primitivo e incivilizado, mas você sabe que o mundo de leis e etiqueta é frágil. Quando cair, você permanecerá.",
    start: [
      "Fúria!",
      "Quando você entra em fúria, marque Irritado. Ao se acalmar, pode marcar outra condição para limpar Irritado.\n" +
        "Enquanto estiver Irritado, você tem as penalidades e benefícios abaixo, a menos que esteja mutilado depois de Encarar a Morte e sobreviver:\n" +
        "- Sua armadura é sempre Desajeitada e você não pode gastar seus usos.\n" +
        "- No fim de cada cena, se você não atacou fisicamente alguém ou algo, marque uma condição.\n" +
        "- Você pode marcar uma condição para agir por um instante com força, velocidade ou resistência sobre-humanas. Se causar dano nisso, cause +1 de dano.\n" +
        "Com os Caminhos de Bárbaro: (Conquistador) você ignora as penalidades das condições enquanto persegue diretamente seus apetites; (Forasteiro) você assume a forma de um urso grande, lobo veloz ou águia voadora, escolhida a cada Fúria; (Sobrevivente) você tem vantagem ao Desafiar Perigos que pode ver de forma tangível.",
    ],
    sheet: [
      "PV máximos: 10.",
      "Atributos (escolha uma): FOR 2, DES 1, INT -1, SAB 1, CAR 0; ou FOR 1, DES -1, INT 0, SAB 2, CAR 1.",
      "Armas (escolha uma, ou crie outra com o Mestre): Espada longa ancestral (2 de dano, perto, leve) e Escudo (1 uso); Machado grande ensanguentado (3, perto, desajeitado, duas mãos, brutal); Martelos duplos (2 sozinho, 3 juntos, perto, contundente).",
      "Itens (escolha dois): Equipamento de aventura, Banquete farto, Suprimentos, Kit de armadilhas.",
      "Aparência (uma por linha): peles e couros, tatuagens intrincadas ou muitas cicatrizes; tesouro cultural, troféu impressionante ou artefato misterioso.",
      "Relacionamentos de exemplo: Feri ou abandonei esta pessoa num momento de fúria ou indulgência. Estou ensinando a ela sobre minha cultura, queira ou não. Ela é fraca e patética; vou torná-la forte. Ela viu minha terra natal mais recentemente que eu. Ela me mostrou um novo conforto destas terras, e quero mais.",
      "Origens: Eu sou um (anão, orc, minotauro, golias...). Minha terra natal é (monstros gigantes, ruínas perigosas, clima calamitoso). Meu povo me via como (líder forte, rebelde indisciplinado, fraco inútil). Eu parti por causa de (traição e exílio, invasão, sequestro ou teletransporte).",
      "Nomes: Gorm, Fafnir, Haepha, Qua, Thraxis, Sillius, Quebra-Inimigos.",
      "Recompensas de Conflito: Contra a Morte da Luz (com 0 PV Irritado, você só Encara a Morte no fim da cena, e só se ainda estiver com 0 PV) ou Momento de Heroísmo.",
    ],
    paths: [
      {
        name: "Sobrevivente",
        start: [
          "Músculos Poderosos",
          "Seu físico impressionante só é limitado pela armadura. Enquanto não usa armadura nem escudo, pode marcar um uso dos seus músculos para ignorar uma instância de dano. Ao Montar Acampamento com sucesso, apague um uso marcado.",
        ],
        advanced: [
          [
            "Destemido",
            "Você é imune a medo, terror e intimidação, mesmo sobrenaturais, e ignora as penalidades de Assustado. Também inspira os outros: ao Auxiliar um companheiro Assustado ou derrotar algo aterrorizante diante dele, ele limpa Assustado.",
          ],
          [
            "É Só Isso Que Você Tem?",
            "Depois de sofrer dano de um inimigo, pode marcar uma condição ou sofrer o dano de novo para fazer uma escolha de Manter Ocupado: impedi-lo, negando uma vantagem ou algo que ia fazer; distrair, impressionar, exaurir ou assustá-lo; ou enfraquecê-lo, reduzindo em 2 o próximo dano dele.",
          ],
          [
            "Unhas Vermelhas",
            "Ao marcar Ensanguentado, limpe uma condição. Enquanto Ensanguentado, aumente em 1 todo dano que causa. Ao fazer um Ataque Total contra um inimigo Ensanguentado, role com vantagem.",
          ],
          [
            "Quando Me Convém",
            "Ao Encarar a Morte, pode escolher também: Cuspir na Cara da Morte, recuperando todos os PV aqui e agora sem ficar mutilado. Depois, perde este movimento até ganhá-lo de novo como avanço. 2 usos.",
          ],
        ],
        extras: [meter("Usos de Músculos Poderosos", 2, 2)],
      },
      {
        name: "Conquistador",
        start: [
          "Apetite Insaciável",
          "Você tem uma necessidade grande e terrível que o leva a alturas e profundezas maiores. Diga qual é agora. Insatisfeito é uma condição extra deste Caminho, que se marca e limpa como as outras; enquanto marcada, você tem desvantagem em tudo que não busque a satisfação. Sempre que buscar satisfazer o apetite, pergunte ao Mestre como, e ele dirá, em geral com risco ou custo. Ao fazê-lo, limpe Insatisfeito. Exemplos: fama e glória, o orgulho dos ancestrais, prazeres mortais, poder sobre os outros, riqueza, a emoção do caos, destruição total.",
        ],
        advanced: [
          [
            "Dobrar Barras, Erguer Portões",
            "Quando você ataca fisicamente um obstáculo inanimado, role+FOR. Com 10 ou mais, você o destrói. Com 7 a 9, escolha uma: o esforço fere ou força você (1 de dano); atrai atenção indesejada; causa dano colateral. Com 6 ou menos, dá terrivelmente errado: marque 1 XP e o Mestre faz um movimento.",
          ],
          [
            "Vontade Irrefutável",
            "Ao Tomar o Controle, antes da rolagem, pode marcar uma condição para fazer uma escolha extra, mesmo com 6 ou menos.",
          ],
          [
            "Aterrorizante",
            "Ao Influenciar Decisão dominando ou manuseando-a à força, role+FOR em vez de +CAR e, se a pessoa voltar atrás depois, ganhe vantagem na próxima vez que agir contra ela.",
          ],
          [
            "Usurpador",
            "Ao Perceber Intenções de alguém mais poderoso que você (política, física, econômica...), pode sempre perguntar também: \"Como posso arruinar ou humilhar você da melhor forma?\" Ao conseguir, limpe uma condição.",
          ],
        ],
        extras: [field("Apetite")],
      },
      {
        name: "Forasteiro",
        start: [
          "Saudade de Casa",
          "Sua terra é longe, e seu coração ainda a deseja mesmo na aventura, mas você não pode voltar. Ao contar a alguém uma história da sua terra, marque e responda uma pergunta abaixo e limpe uma condição. Com as cinco marcadas, ganhe 1 XP e limpe todas.\n" +
            "- Que maravilha ou perigo torna sua terra única?\n- O que precisa mudar na sua terra para você voltar?\n" +
            "- Que problema da sua terra causa ondas até aqui?\n- Qual é sua lembrança mais querida da sua terra?\n- Que defeito ou fracasso da sua terra você odeia?",
        ],
        advanced: [
          [
            "Rito de Sacrifício",
            "Quando você sacrifica ritualmente algo importante aos espíritos (deuses, ancestrais, totem...), role+SAB. Com 10 ou mais, escolha as três; com 7 a 9, duas: ganhar uma bênção proporcional ao sacrifício (peça o que quer e o Mestre diz o que vem); perguntar ao Mestre algo sobre ações, local ou vulnerabilidades de um inimigo, e ele responde com a verdade; todos que participaram limpam uma condição. Com 6 ou menos, escolha uma, mas os espíritos fazem uma exigência e não aceitam novos sacrifícios até você cumpri-la.",
          ],
          [
            "Andarilho Experiente",
            "Ao chegar a um novo lugar civilizado, conte ao grupo uma tradição, ritual, crença ou prática local importante e como a aprendeu. A primeira vez que usar esse conhecimento numa rolagem, ganhe vantagem.",
          ],
          [
            "Verdade Feia",
            "Quando você atropela a etiqueta social para chamar algo pelo que realmente é, role+CAR. Com 7 ou mais, nomeie alguém presente que concorda com você e quer ajudar. Com 10 ou mais, limpe também uma condição. Com 6 ou menos, talvez se arrependa do que disse: marque 1 XP e o Mestre faz um movimento.",
          ],
          [
            "Tradição Oral",
            "Ao Confortar ou Apoiar ou Recordar Conhecimento contando uma história da sua terra, pode ignorar as perguntas do movimento e rolar+SAB.",
          ],
        ],
      },
    ],
  },
  {
    id: "bard",
    name: "Bardo",
    pitch:
      "Você inspira camponeses e reis, acalma a fera selvagem e leva o povo ao frenesi. Um artista comum retrata uma história, mas é preciso um bardo de verdade para vivê-la. Alguém tem de estar lá, lutando lado a lado com os futuros heróis. Quem melhor que você para contar a história?",
    start: [
      "Apresentar-se para uma Plateia",
      "Você entretém os outros com uma habilidade artística. É música, pintura, culinária ou outra coisa? Quando apresenta sua arte a uma plateia, role+CAR. Com 10 ou mais, escolha três opções abaixo; com 7 a 9, duas; com 6 ou menos, você sente que foi péssimo: escolha uma, mas marque uma condição. Cada opção só pode ser escolhida uma vez por apresentação.\n" +
        "- Outro personagem de jogador na plateia limpa uma condição.\n" +
        "- Outro personagem de jogador na plateia ganha vantagem na próxima rolagem.\n" +
        "- Um NPC na plateia tenta falar com você em particular.\n" +
        "- Na próxima vez que entrar numa luta, pode usar sua arte como arma, rolando+CAR em todos os movimentos de batalha.\n" +
        "Com os Caminhos de Bardo, também: (Dramaturgo) faça tudo girar em torno de você e ganhe 1 Pathos; (Socialite) escolha um NPC da plateia, que passa a Favorecer você; (Cronista) retrate a conclusão de um feito marcado e limpe-o.",
    ],
    sheet: [
      "PV máximos: 8.",
      "Atributos (escolha uma): FOR 1, DES 1, INT 0, SAB -1, CAR 2; ou FOR -1, DES 0, INT 1, SAB 1, CAR 2.",
      "Armas (escolha uma): Rapieira reluzente (2 de dano, perto, precisa); Espada longa decorada (2, perto) e Broquel (1 uso); Besta ornamentada (2, médio e longe, precisa, perfurante, duas mãos, recarga, munição).",
      "Itens (escolha dois): Equipamento de aventura, Banquete farto, Suprimentos, Sacola de livros.",
      "Aparência: figurino colorido, traje fantasioso ou couros mascarados; alaúde durável, panela enorme ou muitos pincéis.",
      "Relacionamentos de exemplo: Acha minha arte inútil; não resisto a provar que está errada. Sei que ela sabe um segredo poderoso sobre mim ou minha arte. É minha musa e inspira minhas melhores obras. Nunca trairia nem abandonaria, depois da última vez. É meu amor, ou foi, ou será... é complicado. Interrompeu minha melhor apresentação; hora da vingança.",
      "Origens: Eu sou um (gnomo, orc, kobold, tritão, fada...). Fui criado entre (luxo extravagante, devoção austera, camponeses). Minha primeira apresentação foi (tragicamente interrompida, grandiosamente celebrada, perigosamente subversiva). Minha aventura de verdade começou quando (fiz amizade com outro personagem, minha arte foi proibida, minha identidade foi roubada).",
      "Nomes: Baldric, Astrafel, Merida, Kosil, Lily, um nome marcante.",
      "Recompensas de Conflito: Mais Forte Que Qualquer Espada (ao tecer uma verdade ou segredo poderoso na apresentação, faça uma escolha extra em qualquer resultado, e pode escolher também: a verdade vem à tona e nada a detém; alguém da plateia recupera 3 PV) ou Momento de Heroísmo.",
    ],
    paths: [
      {
        name: "Dramaturgo",
        start: [
          "Todo Mundo Ama um Azarão",
          "Como protagonista óbvio do grupo, você sabe virar o jogo quando a coisa está feia, e isso se representa por Pathos. Ao Encerrar a Sessão, zere o Pathos e ganhe 1 para cada pergunta que respondeu \"não\" (máximo 3). Quando tirar 6 ou menos, pode marcar uma condição para ganhar 1 Pathos.\n" +
            "Ao procurar uma saída de uma situação ruim, pode gastar 1 Pathos para escolher uma opção; descreva como acontece e responda a pergunta, e o Mestre assume daí:\n" +
            "- Notar ou conhecer um novo NPC. O que dá para ver ou já sabe sobre ele?\n" +
            "- Descobrir um novo caminho por ou ao redor de um obstáculo. Que custo doloroso ou risco perigoso exige?\n" +
            "- Reconhecer alguém do passado, mesmo sem ter sido mencionado antes. O que sente por você?\n" +
            "- Atrair a atenção de todos por perto por um tempo. O que mais teme que façam com você?",
        ],
        advanced: [
          [
            "Hora do Meu Solo",
            "Ao Chegar ao Limite, você tem vantagem para Testar Sua Determinação. Com 10 ou mais, limpa também todas as condições não trancadas. Em qualquer resultado, marque 1 XP.",
          ],
          [
            "Duelo Climático",
            "Quando você luta um a um, depois de rolar qualquer movimento de batalha com escolhas, pode marcar uma condição para fazer uma escolha extra, em qualquer resultado.",
          ],
          [
            "Mais Estranho Que a Ficção",
            "Quando você conta uma história absurda em que ninguém em sã consciência acreditaria, verdade ou mentira, role+CAR. Com 10 ou mais, todos os NPCs por perto acreditam mesmo assim, até algo os convencer do contrário. Com 7 a 9, são enganados, mas não por muito tempo. Com 6 ou menos, mostram o que realmente pensam de você: marque 1 XP e o Mestre faz um movimento.",
          ],
          [
            "Passado Intrincado",
            "Você pode ter dois Conflitos ao mesmo tempo. Escolha um agora ou ao começar a próxima sessão.",
          ],
        ],
        extras: [meter("Pathos", 3, 0)],
      },
      {
        name: "Socialite",
        start: [
          "Inesquecível",
          "Quando você cumpre uma tarefa significativa para um NPC, ou tira 12 ou mais ao Influenciar Decisão, anote que ele agora Favorece você. Enquanto Favorece, ele pode tratar você especialmente bem ou agir passivamente a seu favor. Ao insultar, ferir ou decepcionar quem Favorece você, apague o Favor.\n" +
            "Ao cobrar um Favor, escolha uma opção; a pessoa tentará fazer aqui e agora. Se fizer, apague o Favor; se não fizer por qualquer motivo, o Favor fica e sua próxima rolagem contra ela tem vantagem.\n" +
            "- Nomeie algo que ela tem; ela entrega a você.\n- Diga que está em apuros; ela protege você.\n- Aponte um inimigo ou obstáculo; ela age contra ele.",
        ],
        advanced: [
          [
            "Cartas na Mesa",
            "Ao Perceber Intenções falando aberta e honestamente com alguém, pode rolar+CAR em vez de +SAB. Pode fazer uma pergunta a mais, mesmo com 6 ou menos, mas então ela fará uma pergunta a você. Se responder com a verdade, ela Favorece você, diga o que disser. Se esconder ou enganar de qualquer modo, não pode usar este movimento nela de novo e perde o Favor dela para sempre.",
          ],
          [
            "Cativante",
            "Quando você compartilha um momento íntimo ou encantador com um NPC, em geral com tempo e privacidade, ele passa a Favorecer você. Ao cobrar um favor, pode escolher duas opções em vez de uma; ele precisa fazer as duas para apagar o Favor, mas se fizer, nunca mais Favorecerá você.",
          ],
          [
            "Sem Precisar de Palavras",
            "Pode marcar uma condição para se comunicar mutuamente com qualquer ser senciente durante a cena, apesar de qualquer dificuldade.",
          ],
          [
            "Amigos em Lugares Estranhos",
            "Quando você lembra de alguém que pode ajudar e vai procurá-lo, role+CAR. Se deve um favor a ele (você decide), role com vantagem. Com 10 ou mais, você o encontra e ele pode ajudar. Com 7 a 9, ele está em apuros e não ajuda até resolverem. Com 6 ou menos, você só encontra traição ou tragédia: marque 1 XP e o Mestre faz um movimento.",
          ],
        ],
      },
      {
        name: "Cronista",
        start: [
          "A Matéria das Lendas",
          "Você registra esta aventura para as gerações futuras. Na primeira vez que qualquer personagem (inclusive você) cumprir um feito não marcado abaixo, marque-o; você limpa uma condição e o personagem que o fez (ou liderou o esforço) marca 1 XP. Ao marcar o último feito, limpe todos os feitos e condições (inclusive as trancadas).\n" +
            "- Fazer amizade com um antigo inimigo.\n- Desvendar os mistérios de uma civilização perdida.\n- Fazer um sacrifício custoso pelo bem maior.\n- Saquear um tesouro famoso.\n" +
            "- Ir a uma festa fabulosa.\n- Defender um lugar habitado de ameaças terríveis.\n- Derrotar um monstro poderoso e aterrorizante.\n- Depor um governante corrupto.",
        ],
        advanced: [
          [
            "Espalhar Folclore",
            "Quando você encontra pela primeira vez alguém ou algo sobre o qual ouviu histórias, canções ou lendas (você decide), conte ao Mestre algo interessante que ouviu, e então diga o que sente a respeito, marcando uma condição, ou o Mestre diz o que mais ouviu, o que complica.",
          ],
          [
            "Trabalho de Campo",
            "Quando você passa tempo aprendendo sobre um lugar próximo (em geral ao Aproveitar o Descanso), role+CAR se conversa com estranhos e ouve boatos, ou +INT se pesquisa arquivos e registros. Com 10 ou mais, escolha duas coisas novas que aprende; com 7 a 9, uma: esconde um tesouro valioso, provavelmente bem guardado; tem possíveis aliados ou trunfo contra um inimigo; tem uma entrada alternativa com risco ou custo próprio.",
          ],
          [
            "Eu Me Aventuro Aqui e Ali",
            "Ao ganhar este movimento, escolha o Movimento Inicial de uma classe que não está em jogo e anote. Ao liberar esses talentos ocultos, pode marcar uma condição para ter acesso ao movimento até o fim da cena.",
          ],
          [
            "Polímata",
            "Ao Recordar Conhecimento, pode ignorar as perguntas e rolar+INT. Se tiver um registro relevante, ganhe vantagem. Com 12 ou mais, pode responder em vez do Mestre.",
          ],
        ],
      },
    ],
  },
  {
    id: "cleric",
    name: "Clérigo",
    pitch:
      "Você vê o mundo como ele é: parte de algo maior, uma existência cheia de anjos e demônios, deuses e diabos, mortais e espíritos. Uns chamam você de fanático e outros de mentiroso, mas você leva essa verdade a todos. Nenhum mal é grave demais para você curar, nenhum fardo pesado demais para carregar.",
    start: [
      "Invocar Milagres",
      "Você tem uma ligação próxima com uma divindade que o capacita milagrosamente a espalhar seus ideais. Dê a ela um nome e pronomes, e escolha uma opção de cada (ou escreva a sua):\n" +
        "- Domínio: sol, mares, vento, feras, luz, música, fogo, pedra.\n- Adoradores: soldados, artesãos, amantes, eruditos, curandeiros.\n- Inimigos: mortos-vivos, lobos, criminosos, dragões, magos.\n" +
        "Quando você evoca o poder da divindade, role+SAB. Com 10 ou mais, escolha um milagre abaixo. Com 7 a 9, escolha um, mas marque uma condição, ou o Mestre acrescenta uma reviravolta ou o põe em risco. Com 6 ou menos, é distorcido ou insuficiente: marque 1 XP e o Mestre faz um movimento.\n" +
        "- Um aliado cura 3 PV e ignora Ensanguentado no próximo movimento.\n" +
        "- Supere um perigo, obstáculo ou ambiente ligado ao domínio da divindade; marque condições iguais à Magnitude.\n" +
        "Com os Caminhos de Clérigo, também: (Ungido) detectar inimigos próximos da divindade; (Ministro) interromper por alguns momentos críticos a violência próxima; (Pastor) abençoar e fortalecer um ponto forte dos seus seguidores.",
    ],
    sheet: [
      "PV máximos: 8.",
      "Atributos (escolha uma): FOR 1, DES 1, INT 0, SAB 2, CAR -1; ou FOR -1, DES 0, INT 1, SAB 2, CAR 1.",
      "Armas (escolha uma): Velho martelo de guerra (2 de dano, mão, contundente) e Escudo; Cajado inocente (1, mão, perto, duas mãos); Funda decorada (1, médio, precisa, recarga).",
      "Itens (escolha dois): Armadura leve, Bandoleira de frascos, Suprimentos, Remédio.",
      "Aparência: uniforme antigo, casaco de couro valioso ou vestes simples; amuleto abençoado, relicário roubado ou tatuagem animada.",
      "Relacionamentos de exemplo: Temos amizade próxima e nos protegemos. Está perdida de algum jeito; mostrarei um caminho melhor. Tem história com um inimigo jurado da minha divindade. Minha divindade me mostrou seu destino; devo ajudá-la a cumpri-lo. Costumo mediar ou consertar as coisas por ela. Lembra-me de como eu era antes de achar minha divindade.",
      "Origens: Eu sou um (halfling, anão, goblin, povo-pássaro...). Cresci em (um mosteiro isolado, um beco faminto, uma guerra sangrenta). Conectei-me com minha divindade quando (ela me apareceu numa visão, um seguidor me acolheu, ela me salvou milagrosamente). Senti o chamado da aventura quando (a divindade me deu uma missão, meus irmãos de fé se corromperam, minha fé foi perseguida).",
      "Nomes: Lenore, Penrose, Drummond, Freya, Sara, um nome sofrido.",
      "Recompensas de Conflito: Ressurreição (ao devolver alguém à vida, role+SAB; com 7 ou mais volta como era; com 7 a 9 você fica em dívida com a Morte e não usa o movimento até pagar; com 6 ou menos dá terrivelmente errado. Um ressuscitado que Encara a Morte não pode escolher Quebrado e Derrotado e tem desvantagem em Apostar com a Morte) ou Momento de Heroísmo.",
    ],
    paths: [
      {
        name: "Ministro",
        start: [
          "Rosto de Anjo",
          "Ninguém ataca você diretamente sem provocação, a menos que o tenha visto lutar ou tenha contas a acertar. Ao Influenciar Decisão, pode usar esta abordagem: se pede que se afaste da violência, role+SAB, mas a pessoa pode escapar agora ou mudar de ideia depois.",
        ],
        advanced: [
          [
            "Mariposa Diante da Chama Sagrada",
            "Quando você se coloca voluntariamente à mercê de um inimigo, role+SAB. Com 7 ou mais, ele se gaba e tagarela, e você pode fazer duas perguntas sobre ele ou seus superiores. Com 7 a 9, o servo atacará logo. Com 6 ou menos, o servo é muito mais astuto ou poderoso do que parece: marque 1 XP e o Mestre faz um movimento.",
          ],
          [
            "Luz Guia",
            "Ao Auxiliar um Companheiro, pode marcar uma condição a mais para dar Auxílio automaticamente durante o resto da cena, enquanto ficar perto e continuar ajudando. Quando um companheiro tira 12 ou mais com seu Auxílio, você limpa uma condição.",
          ],
          [
            "Corações e Mentes",
            "Ao Perceber Intenções, pode fazer também uma destas perguntas, mesmo com 6 ou menos: O que você realmente sente por mim? O que você não quer admitir (a mim, a outro, a si)? De quem ou do quê você mais cuida?",
          ],
          [
            "Mensagem",
            "Quando você envia uma mensagem a alguém distante, role+SAB. Com 10 ou mais, escolha três; com 7 a 9, duas: a mensagem chega na hora por magia ou milagre; ninguém intercepta nem ouve; ela contorna uma barreira de comunicação, como idioma, inconsciência ou até a morte; quem recebe pode responder do mesmo jeito. Com 6 ou menos, a mensagem pode ser distorcida ou perdida: marque 1 XP e o Mestre faz um movimento.",
          ],
        ],
      },
      {
        name: "Pastor",
        start: [
          "Discipulado",
          "Um punhado de seguidores NPCs dedicados tenta ouvir e obedecer você. Escolha agora duas forças deles; como Movimento Avançado do Caminho, pode ganhar as outras duas.\n" +
            "- Têm treino de combate e defendem você com ardor.\n- Cuidam de uma habilidade, ofício ou posição em seu nome.\n" +
            "- Sempre obedecem suas palavras sem sombra de dúvida.\n- São capazes sozinhos, mesmo sem supervisão.\n" +
            "Quando você manda os seguidores fazerem algo fora das suas forças, marque uma condição para eles fazerem com um senão ou custo, ou duas para fazerem direito. Do contrário, o Mestre faz um movimento.",
        ],
        advanced: [
          [
            "Teólogo",
            "Ao encontrar uma fé ou divindade que você conhece (você decide), pode fazer ao Mestre duas perguntas sobre ela, e ele responde com a verdade.",
          ],
          [
            "Ritos dos Fiéis",
            "Você tem o conhecimento e a autoridade para realizar os ritos abaixo. Depois de realizar um, marque uma condição.\n" +
              "- Expiação: obtenha discernimento divino sobre o que um malfeitor arrependido deve fazer para se redimir; pergunte ao Mestre.\n" +
              "- Consagrar: abençoe um objeto, pessoa ou lugar, protegendo-os de forças profanas enquanto estiver consagrado.\n" +
              "- Iniciar: acolha oficialmente alguém na fé. Passa a ser um dos seus seguidores.",
          ],
          [
            "Testemunhar",
            "Quando você proclama um julgamento ou crença a uma população, role+CAR. Com 10 ou mais, escolha três; com 7 a 9, duas: não atrai atenção indesejada (senão atrai); faça uma pergunta como se Percebesse Intenções coletivamente; eles trabalham juntos por algo (construir uma ponte, queimar uma mansão, achar um tesouro); um ouvinte à sua escolha se emociona e você tem vantagem na próxima vez que Influenciar a Decisão dele. Com 6 ou menos, um ouvinte age contra você: marque 1 XP e o Mestre faz um movimento.",
          ],
        ],
        extras: [field("Forças dos seguidores")],
      },
      {
        name: "Ungido",
        start: [
          "Bênção Sagrada",
          "Você foi capacitado por uma divindade; dê a ela um nome e pronomes. Se já é Clérigo, a divindade revela um novo aspecto de si. De qualquer modo, escolha uma opção de cada (ou escreva a sua):\n" +
            "- Domínio: sol, mares, vento, feras, luz, música, fogo, pedra.\n- Adoradores: soldados, artesãos, amantes, eruditos, curandeiros.\n- Inimigos: mortos-vivos, lobos, criminosos, dragões, magos.\n" +
            "Escolha um milagre do Movimento Inicial do Clérigo e anote. Você pode Invocar Milagres, mas só esse milagre. Se já pode Invocar Milagres, tem vantagem ao invocar esse.",
        ],
        advanced: [
          [
            "Repreender o Profano",
            "Quando você reza à sua divindade por proteção, role+SAB. Com 7 ou mais, nenhum inimigo da sua divindade pode se aproximar enquanto você continuar rezando (e não fizer mais nada). Com 10 ou mais, os inimigos da divindade também ficam atordoados ou fogem. Com 6 ou menos, a divindade se cala ou sua fé vacila: marque 1 XP e o Mestre faz um movimento.",
          ],
          [
            "Arúspice",
            "Quando você sacrifica ritualmente algo importante, faça à divindade uma pergunta sobre o sacrifício ou algo ligado a ele (donos, entes queridos, história...) e role+SAB. Com 7 ou mais, ela envia uma visão que responde. Com 10 ou mais, a visão é vívida e responde também a perguntas relacionadas. Com 6 ou menos, você recebe uma visão de desgraça: marque 1 XP e o Mestre faz um movimento.",
          ],
          [
            "Deus Ex Machina",
            "Ao Encarar a Morte, pode escolher também: Intervenção Divina. Sua divindade salva milagrosamente sua vida, bane um perigo, inimigo ou obstáculo e restaura metade dos seus PV. Você não fica mutilado. Depois perde este movimento até ganhá-lo de novo como avanço.",
          ],
          [
            "A Criação do Homem",
            "Sua ligação com a divindade vai além da adoração formal. Ganhe um Relacionamento com ela, com profundidade começando em 1, e o Vínculo da Divindade com ela.",
          ],
        ],
        extras: [field("Divindade")],
      },
    ],
  },
  {
    id: "druid",
    name: "Druida",
    pitch:
      "Você caminha entre bosques sagrados, em comunhão com espíritos mais velhos que as pedras. A verdadeira beleza está nos riachos e nas árvores antigas, e precisa ser preservada. Por isso você assume a forma de criaturas grandes e pequenas e defende o equilíbrio. Toda civilização desmorona, mas o ciclo da natureza é eterno.",
    start: [
      "Mudar de Forma",
      "Quando você se transforma numa fera que já viu, descreva sua nova forma, escolha uma adaptação abaixo e role+SAB. Com 7 ou mais, funciona e você ganha os benefícios da adaptação. Com 7 a 9, o Mestre diz o que compele seus instintos: siga-o agora ou marque uma condição para resistir.\n" +
        "- Forte e Resistente: +1 de dano causado, -1 de dano sofrido.\n" +
        "- Rápido e Ágil: seus ataques ganham as etiquetas Precisa e Letal.\n" +
        "- Móvel e Aclimatado: pode voar, nadar ou escavar com facilidade.\n" +
        "- Pequeno ou Camuflado: tem vantagem ao Esgueirar-se.\n" +
        "Com os Caminhos de Druida, também: (Coração Selvagem) Preênsil: pode usar equipamento transformado; (Voz do Mundo) Elemental: você é feito de água, fogo, ar etc.; (Observador das Estrelas) Simbólico: as pessoas o temem ou reverenciam de modo especial.\n" +
        "Com 6 ou menos, sua mudança é interrompida ou domina sua mente por um tempo: marque 1 XP e o Mestre faz um movimento.\n" +
        "Por padrão, transformado você tem as etiquetas 1 de dano e Mão, não usa equipamento e só se comunica com outros personagens de jogadores. Pode voltar ao normal quando tem o controle, mas sempre volta ao fim da cena.",
    ],
    sheet: [
      "PV máximos: 8.",
      "Atributos (escolha uma): FOR 1, DES 1, INT -1, SAB 2, CAR 0; ou FOR -1, DES 0, INT 1, SAB 2, CAR 1.",
      "Armas (escolha uma): Clava de madeira (2 de dano, perto, contundente); Cajado florido (1, mão, perto, duas mãos); Atiradeira de cipó (1, médio, precisa, recarga).",
      "Itens (escolha dois): Poção de cura, Kit de venenos, Suprimentos, Remédio.",
      "Aparência: vestes terrosas, couros feitos à mão ou vestimentas cobertas de folhas; muda órfã, ídolo entalhado ou coroa de chifres.",
      "Relacionamentos de exemplo: Os espíritos da natureza me deram um aviso sobre ela. Ela me mostrou uma vantagem intrigante da civilização. É cega à beleza da natureza; vou fazê-la ver. Já defendeu a natureza e tem meu respeito. Acha graça nas minhas formas; vou mostrar minha ferocidade. Sinto-me atraído por ela, mas viemos de lugares muito diferentes.",
      "Origens: Eu sou um (halfling, centauro, povo-árvore...). Cresci em (uma metrópole agitada, uma floresta encantada, uma caverna funda). Conectei-me com a natureza quando (me perdi na mata, um espírito começou a me ensinar, arrisquei-me pelo selvagem). Senti o chamado da aventura quando (os espíritos me testaram, uma corrupção se espalhou, meu lar foi \"civilizado\").",
      "Nomes: Hycarax, Elana, Weylan, Rose, Sigrial, um nome de animal.",
      "Recompensas de Conflito: Quimera (ao Mudar de Forma, pode marcar quantas condições quiser para ganhar o mesmo número de adaptações extras) ou Momento de Heroísmo.",
    ],
    paths: [
      {
        name: "Voz do Mundo",
        start: [
          "Ambientalista",
          "Você tem ligação próxima com os espíritos elementais do mundo (raízes, rochas, ventos, águas), que o veem como guardião, zelador e embaixador. Quando você pede ajuda a espíritos naturais, diga o que quer, marque condições iguais à Mag, responda e role com +1 por cada \"sim\":\n" +
            "- Isto restaura a harmonia ou avança um ciclo da natureza?\n- A ajuda usa uma característica ou entidade natural próxima?\n- Você está sem nenhum metal consigo?\n" +
            "Com 7 ou mais, os espíritos ajudam como pediu. Com 7 a 9, estão inquietos: marque uma condição para mantê-los focados, ou causam dano colateral. Com 6 ou menos, os espíritos reagem ou exigem um sacrifício: marque 1 XP e o Mestre faz um movimento.",
        ],
        advanced: [
          [
            "Relevo da Terra",
            "Quando você passa um tempo em comunhão com os espíritos, faça uma pergunta abaixo sobre a região em que está, ou marque uma condição para fazer todas; o Mestre responde com sinceridade: Algo aqui ameaça o mundo natural? Que pessoa ou lugar daqui pode nos ajudar? Que perigo ou inimigo daqui devemos conhecer?",
          ],
          [
            "Morte e Rebrota",
            "Quando você acaba com um inimigo significativo, ou na primeira vez de cada sessão em que marca Ensanguentado, ganhe 1 Equilíbrio (máximo 2). Pode gastar Equilíbrio como se fossem usos de Remédio.",
          ],
          [
            "De Volta ao Básico",
            "Quando você revela a um ou mais NPCs uma nova falha da civilização, limpe uma condição e role+CAR. Com 10 ou mais, escolha duas; com 7 a 9, uma: eles reconhecem o problema e começam a consertá-lo; protegem você ou a natureza de uma ameaça iminente; atacam ou sabotam um inimigo da natureza. Com 6 ou menos, você atrai a atenção de um inimigo: marque 1 XP e o Mestre faz um movimento.",
          ],
          [
            "Shillelagh",
            "Quando você maneja espíritos naturais como arma, aumente em 1 o dano que causa e reduza em 1 o dano que recebe.",
          ],
        ],
        extras: [meter("Equilíbrio", 2, 0)],
      },
      {
        name: "Observador das Estrelas",
        start: [
          "Sol e Lua",
          "Você tem ligação com os corpos celestes do seu céu, como o sol e a lua (ou luas). Sempre sabe a hora e a data, e nunca se perde enquanto vir o céu. Ao ar livre de dia, ignore as penalidades de Assustado. Ao ar livre à noite, ignore as de Inseguro.",
        ],
        advanced: [
          [
            "Previsor do Tempo",
            "Depois de Montar Acampamento com sucesso, escolha como está o tempo. Fica assim até alguém mudá-lo, você usar este movimento de novo ou partirem da região. Você e os companheiros ganham o benefício: Céu Limpo, limpe uma condição ao escolher; Nublado, ignore as penalidades de Exausto; Chuva, Neblina ou Neve, vantagem ao Esgueirar-se ao ar livre.",
          ],
          [
            "Profeta do Fim",
            "Quando você proclama a um inimigo seu destino iminente, role+SAB. Com 7 a 9, escolha uma; com 10 ou mais, duas: Dor, aumenta em 1 o dano que ele sofre na cena; Arrependimento, vantagem para Influenciar a Decisão dele na cena; Vulnerabilidade, o Mestre conta uma fraqueza que ele esconde. Com 6 ou menos, você só vê o sucesso dele: marque 1 XP e tenha desvantagem contra ele pelo resto da cena.",
          ],
          [
            "Augúrio",
            "Quando você lê o futuro escrito nas estrelas, pode marcar uma condição para focar a leitura num lugar ou pessoa específica, e rolar+SAB; o Mestre revela um evento importante e relacionado que acontecerá em breve. Com 10 ou mais, pode fazer uma pergunta de acompanhamento; o Mestre responde com a verdade e generosamente. Com 6 ou menos, o evento envolve o terrível destino de um aliado (PC ou NPC), mas você pode torcê-lo para ser sobre você. Quem sofre o destino terrível tem desvantagem em todas as rolagens durante o evento.",
          ],
          [
            "Cria do Nascer e do Pôr do Sol",
            "Ao ar livre ao amanhecer ou entardecer, ignore as penalidades de todas as condições e do Ensanguentado. Pode marcar uma condição para tratar uma cena como se ocorresse ao ar livre ao amanhecer ou entardecer. Como é?",
          ],
        ],
      },
      {
        name: "Coração Selvagem",
        start: [
          "Sussurrador de Animais",
          "Você se comunica com animais como se fossem pessoas. Ao Perceber Intenções de um animal, em qualquer resultado pode fazer uma pergunta extra, até com 6 ou menos. Ao Influenciar a Decisão de um animal, se sua abordagem combinar com os desejos ou instintos dele, role com vantagem.",
        ],
        advanced: [
          [
            "Chamado da Natureza",
            "Quando você pede ajuda à natureza, escolha um tipo de animal adequado ao ambiente e role+SAB. Com 7 ou mais, o animal chega e ajuda como NPC aliado na cena. Com 7 a 9, escolha uma opção; com 10 ou mais, duas: intimida ou distrai um inimigo ao chegar; chega um bando em vez de um só; não causa dano colateral nem tumulto; acompanha você por um tempo depois da cena. Com 6 ou menos, você atrai a ira ou a fome da natureza: marque 1 XP e o Mestre faz um movimento.",
          ],
          [
            "Criado por Lobos",
            "Escolha um tipo de animal (lobos, ursos, águias...). Eles tratam você como amigo por padrão e seus companheiros como aliados. Quando passa tempo com eles, escolha uma opção se estiver só, duas se com outro personagem: limpar uma condição; recuperar um uso gasto de um item; aprender sobre um perigo ou obstáculo próximo como se tivesse tirado 7 a 9 em Recordar Conhecimento.",
          ],
          [
            "Elo Primal",
            "Quando você marca um animal com sangue, lama ou sujeira, apague as marcas anteriores; então pode compartilhar seus sentidos como se fossem seus, não importa a distância.",
          ],
          [
            "Um Passarinho Me Contou",
            "Ao Desvendar Segredos ou Perceber Intenções interrogando animais próximos, pode rolar com CAR.",
          ],
        ],
        extras: [field("Animal escolhido")],
      },
    ],
  },
  {
    id: "fighter",
    name: "Guerreiro",
    pitch:
      "É um trabalho ingrato, viver dia a dia pela força do braço e por um triz. Você carrega suas cicatrizes com orgulho, afia a espada com precisão e veste a armadura com naturalidade. Que cada perigo se meça com você. No fim, você será o último de pé.",
    start: [
      "Estilos de Luta",
      "Você é especialmente bom com certas armas e posturas. Escolha uma agora. Ao ganhar um Caminho de Guerreiro, ganhe o estilo associado.\n" +
        "- Armas Pesadas: ignore Desajeitada nas armas. Pode usar armas de Duas Mãos com uma, mas causam -1 de dano.\n" +
        "- Postura Defensiva: usando uma única arma de corpo a corpo de uma mão, com escudo ou não, reduza em 1 o dano que sofre.\n" +
        "- Duas Armas: seus ataques são Letais enquanto empunha duas armas leves, ou Perfurantes se já forem Letais.\n" +
        "Estilos dos Caminhos: (Brigão) Gladiador: ao usar um movimento de batalha, acrescente à lista de escolhas \"Torne-se o centro das atenções\"; (Mestre de Armas) Obra-Prima: sua Arma Característica tem dois aprimoramentos a mais; (Veterano) Tática: ao usar um movimento de batalha, acrescente \"Faça-lhe uma pergunta como se Percebesse Intenções\".",
    ],
    sheet: [
      "PV máximos: 10.",
      "Atributos (escolha uma): FOR 2, DES 1, INT 0, SAB 1, CAR -1; ou FOR 1, DES 2, INT -1, SAB 0, CAR 1.",
      "Armas (escolha uma): Lança curta inscrita (2 de dano, mão, perto) e escudo; Machado grande intimidador (3, perto, duas mãos, brutal); Cimitarras gêmeas (1 sozinha, 2 juntas, perto, leve, precisa).",
      "Armadura (escolha uma): Média (3 usos, ignora até 2 de dano, Desajeitada se FOR<2) ou Leve (3 usos, ignora 1, Desajeitada se FOR<1).",
      "Item (escolha um): Feixe de dardos (1 de dano, perto, médio, infinito), Suprimentos ou Remédio.",
      "Aparência: peitoral polido, couro cravejado ou cota de malha gasta; cicatriz perversa, elmo icônico ou capa esvoaçante.",
      "Relacionamentos de exemplo: Não sabe lutar direito; vou ensiná-la. Somos rivais; um dia reconhecerá minha superioridade. Estou apaixonado, mas talvez não seja correspondido. É indefesa e é meu trabalho protegê-la. Viu-me matar alguém importante. Deve-me a vida, admita ou não.",
      "Origens: Eu sou um (elfo, povo-dragão, centauro, golem...). Aprendi a lutar em (uma arena de gladiadores, uma guerra brutal, um centro de treino renomado). Fiz meu nome como (guarda-costas de uma figura importante, espada de aluguel poderosa, oficial de treinamento respeitado). Comecei a aventurar depois que (um companheiro me traiu, um inimigo terrível me derrotou, um pesadelo me assombrou).",
      "Nomes: Hawk, Finnegan, Cadeus, Lenna, Brianne, Tas, um nome antigo.",
      "Recompensas de Conflito: Intocável (ao fazer um Ataque Total, com 12 ou mais, você também evita todo o dano do inimigo) ou Momento de Heroísmo.",
    ],
    paths: [
      {
        name: "Veterano",
        start: [
          "Trabalho em Dupla",
          "Ao Auxiliar um Companheiro ou receber Auxílio, e um dos dois sofrer dano, podem dividir o dano entre vocês como quiserem. Ambos podem usar armadura, escudos, movimentos e afins para reduzir esse dano.",
        ],
        advanced: [
          [
            "Médico de Campo",
            "Ganhe agora um item Remédio. Ao usar Remédio, leva só instantes em vez de minutos, e pode escolher \"Ele restaura 3 PV\" em vez de outra opção.",
          ],
          [
            "Treino Antimagia",
            "Ao Desafiar um perigo mágico interrompendo sua criação à força, role com vantagem e, com 12 ou mais, escolha 0. Ao usar um movimento de batalha (com escolhas) contra um inimigo que luta com magia, com 7 ou mais pode marcar uma condição para fazer uma escolha adicional.",
          ],
          [
            "Velhos Amigos e Inimigos",
            "Quando você vai atrás de alguém que conhece de uma batalha passada, amigo ou inimigo, escolha uma opção da lista, ou duas se deve algo a ele ou o põe em risco (você decide): ele aceita ajudar num conflito atual; oferece orientação, conselho ou abrigo por um tempo; revela um segredo ou oportunidade significativos.",
          ],
          [
            "Instintos Apurados",
            "Quando você tem um mau pressentimento sobre uma situação à frente (você decide), pergunte ao Mestre como evitá-la ou se preparar, e ele dará um conselho; limpe uma condição se o seguir.",
          ],
        ],
      },
      {
        name: "Brigão",
        start: [
          "Duro Como Bota Velha",
          "Ignore todas as penalidades de estar Ensanguentado nos movimentos de batalha.",
        ],
        advanced: [
          [
            "Vocês Só Me Atrasam",
            "Ao Manter Ocupado sem ajuda nem aliados, role com vantagem e, com 12 ou mais, faça uma escolha extra e evite o revide (em vez de uma ou outra).",
          ],
          [
            "Segundo Fôlego",
            "Quando você aperta os dentes e se força através da dor, marque o uso de Segundo Fôlego, restaure metade dos seus PV máximos e limpe Ensanguentado e outra condição. Depois de Montar Acampamento com sucesso, renove o uso. 1 uso.",
          ],
          [
            "Olho para a Destruição",
            "Quando você decide destruir algo (prédio, obstáculo, artefato mágico...), diga a intenção ao Mestre. É sempre possível, mas ele dará de 1 a 4 exigências, ligadas por \"e\" ou \"ou\": vai levar horas, dias ou semanas; será fácil, difícil ou impossível de consertar; primeiro você precisa de X; alguém vai se vingar; alguém ou algo tentará proteger ou reivindicar; haverá dano colateral inevitável; você precisará de ajuda de X; vai gastar ou desgastar X.",
          ],
          [
            "Não Se Brinca Comigo",
            "Quando você para de se conter, pode marcar quantas condições quiser. Para cada uma, escolha Área, Contundente, Brutal, Precisa ou Letal. Acrescente todas as etiquetas escolhidas aos seus movimentos de batalha até o fim da cena.",
          ],
        ],
        extras: [meter("Segundo Fôlego", 1, 1)],
      },
      {
        name: "Mestre de Armas",
        start: [
          "Arma Característica",
          "Além de suas armas e armaduras normais, você empunha um instrumento único de destruição. Primeiro escolha a base:\n" +
            "- Par Pequeno: 1 de dano sozinha, 2 juntas, mão, leve.\n- Média e versátil: 2 de dano, perto.\n- Grande e poderosa: 3 de dano, perto, duas mãos, desajeitada.\n- À distância: Precisa, Perto, Munição, Recarga, talvez Distintiva.\n" +
            "Depois escolha dois aprimoramentos: é Perfurante; é inquebrável; tem uma etiqueta de alcance extra; detecta algo específico (sangue, segredos...); é Brutal ou Poderosa; é Precisa; é Letal; perde Recarga ou Distintiva.\n" +
            "Ao Aproveitar o Descanso, pode \"Gastar 1 de tesouro, separar itens antes enxertados, e então encantar sua Arma Característica enxertando um artefato ou item mágico. O item vira parte da arma, que ganha suas propriedades, movimentos e etiquetas sensatas\".",
        ],
        advanced: [
          [
            "Baluarte",
            "Sua armadura e seus escudos têm um uso extra cada. Pode marcar um uso para afetar alguém perto de você em vez de si.",
          ],
          [
            "Armígero",
            "Reduza em 1 a exigência de FOR da armadura para não ser Desajeitada. Ao Montar Acampamento com sucesso, limpe um uso de armadura.",
          ],
          [
            "Arsenal Ambulante",
            "Ganhe agora um Equipamento de aventura. Pode usá-lo para sacar armas comuns: armas leves custam 1 uso, de Duas Mãos 3 usos, outras 2 usos.",
          ],
          [
            "Quebrar a Lâmina",
            "Quando você usa uma arma para causar dano a um inimigo e ela não é Inquebrável, pode quebrá-la sem conserto para aumentar em 1 o dano causado. Ao Montar Acampamento, pode consertar sua Arma Característica, ou um item comum, quebrado sem uso.",
          ],
        ],
        extras: [meter("Usos de armadura", 3, 3), meter("Usos de escudo", 1, 1)],
      },
    ],
  },
  {
    id: "paladin",
    name: "Paladino",
    pitch:
      "Você é a espada da retidão, que trilha o caminho estreito e ilumina o caminho de quem quiser seguir. Protetor, curandeiro, juiz, executor: você é tudo isso e mais. Venham os inocentes, que você os abrigará dos problemas. Que os culpados se encolham nos recantos escuros, pois você vem, e eles não terão clemência.",
    start: [
      "Juramentos Virtuosos",
      "Você jurou aderir a um código moral estrito. Cada juramento o fortalece enquanto for cumprido. Escolha dois agora:\n" +
        "- Retribuição: nenhum crime fica sem punição. Ao marcar Ensanguentado, seu próximo movimento de batalha ignora isso e tem vantagem.\n" +
        "- Proteção: defenda os indefesos. Enquanto defende outro, ele não será alvo e sofre 2 a menos de dano.\n" +
        "- Caridade: erga os necessitados e destituídos. Ao tocar alguém, pode marcar uma condição para restaurar 2 PV a ele.\n" +
        "- Temperança: abstenha-se de prazeres mortais e finuras. Você é imune a todos os males, como venenos, doenças e maldições.\n" +
        "- Coragem: aja com ousadia e integridade. Ao Desafiar o Perigo com honra, com 10 ou mais escolha 0 (em vez de 1).\n" +
        "- Liberdade: acabe com o cativeiro injusto. Ao tocar um ser preso ou amarrado, pode marcar uma condição para libertá-lo na hora.\n" +
        "Ao ganhar um Caminho de Paladino, ganha um juramento adicional. Ao quebrar um juramento, marque uma condição e perca o acesso a ele até expiar; o Mestre diz como.",
    ],
    sheet: [
      "PV máximos: 10.",
      "Atributos (escolha uma): FOR 2, DES -1, INT 0, SAB 1, CAR 1; ou FOR 1, DES 0, INT 1, SAB 2, CAR -1.",
      "Armas (escolha uma): Espada dourada (2 de dano, mão, perto); Martelo grande reluzente (3, perto, duas mãos, contundente); Besta com virotes de ponta de prata (2, médio e longe, precisa, perfurante, duas mãos, recarga, munição).",
      "Armadura (escolha uma): Média (3 usos, ignora até 2, Desajeitada se FOR<2) ou Leve (3 usos, ignora 1, Desajeitada se FOR<1).",
      "Item (escolha um): Banquete farto, Equipamento de aventura ou Escudo.",
      "Aparência: armadura de placas reluzente, capa discreta ou correntes surradas; escudo enorme, estandarte icônico ou cicatriz bonita.",
      "Relacionamentos de exemplo: Está tentando me fazer quebrar os juramentos, sabendo ou não. Acha-me um chato; vou mostrar! Foi meu inimigo no passado; será que mudou? Deve estar escondendo algo; vou descobrir. Juramentos à parte, é exemplo de retidão heroica. Salvou-me de um destino terrível, e jurei retribuir.",
      "Origens: Eu sou um (humano, halfling, draconato...). Na minha vida antiga eu era (um criminoso desesperado, um camponês humilde, um nobre egoísta). Jurei meus primeiros juramentos a (expiar meu passado, perseguir um ideal, entrar numa organização). Fui chamado à aventura depois que (meus juramentos me levaram a uma missão, meu lar caiu na corrupção, uma vez quebrei meus votos).",
      "Nomes: Thaddeus, Augustine, Octavia, Brom, Kyra, um nome nobre.",
      "Recompensas de Conflito: Não Há Correntes em Mim (ao quebrar um Juramento de propósito, em vez de perder o benefício você o altera para caber na ação, virtuosa ou não; depois disso não pode mais tomar Caminhos ou Movimentos Avançados de Paladino ao subir de nível) ou Momento de Heroísmo.",
    ],
    paths: [
      {
        name: "Cavaleiro",
        start: [
          "Missão",
          "Quando você se dedica a uma missão, descreva qual é e como é a dedicação. Se já tem uma missão inacabada, marque uma condição e apague-a. Então escolha uma bênção abaixo e o Mestre escolhe mais uma. Enquanto for fiel à missão, as bênçãos permanecem.\n" +
            "- Você não precisa de comida, água nem sono.\n- Sua voz transcende o idioma.\n- Sente a presença de uma criatura ou tipo de criatura específico.\n" +
            "- Sente a direção do seu objetivo.\n- É imune a um tipo específico de dano (fogo, queda, flechas...).\n- Recebe um símbolo da missão: quem o vê e concorda ajuda você.\n" +
            "Ao Encerrar a Sessão, ganhe 1 XP se fez progresso significativo na missão sem concluí-la. Ao concluí-la, perde de imediato a bênção, ganha 2 XP, cura até metade dos PV máximos e limpa uma condição, mesmo trancada.",
        ],
        advanced: [
          [
            "Eu Sou o Seu Escudo",
            "Ao Manter Ocupado engajando de frente em batalha, reduza em 2 o dano que sofre dele.",
          ],
          [
            "Atirar a Luva",
            "Quando você exige um duelo em resposta a insulto, invasão ou inimizade antiga, o oponente não pode recusar, embora possa usar um substituto, propor condições ou acrescentar complicações. Além disso, sempre que começar tal luta, limpe duas condições.",
          ],
          [
            "Sacrifício Valoroso",
            "Quando você tenta receber um dano destinado a outro, se ele está Perto ou mais próximo e o ataque não é de Área, você recebe o dano em vez dele. Do contrário, o Mestre pode pedir antes que você Desafie o Perigo para alcançá-lo. De qualquer modo, se for um personagem de jogador, ele ganha 1 de profundidade com você.",
          ],
          [
            "A Maior Virtude",
            "Quando você abandona uma missão para ajudar outro personagem (ou, como Paladino, quebra um Juramento por ele), ganhe 1 de profundidade com ele e vantagem em todas as rolagens pelo resto da cena. Você ainda perde os benefícios da Missão.",
          ],
        ],
        extras: [field("Missão")],
      },
      {
        name: "Inquisidor",
        start: [
          "Comando Reto",
          "Por um poder terreno ou celestial, você recebeu autoridade para agir como juiz, júri e executor. Quando dá uma ordem a alguém com base na sua autoridade, role+CAR. Se disser os detalhes de um mal que caça, pode rolar+SAB. Com 7 ou mais, escolha uma opção, e então ele decide se foge, ataca ou obedece. Com 10 ou mais, faça uma escolha adicional:\n" +
            "- Se ele não obedecer, ganhe vantagem na próxima rolagem.\n- Ele revela uma informação relevante a você.\n- Ele não pode fugir.\n" +
            "Com 6 ou menos, alguém solapa ou embosca você: marque 1 XP e o Mestre faz um movimento.",
        ],
        advanced: [
          [
            "Punir o Mal",
            "Uma vez por sessão, quando você condena alguém além de toda esperança, redenção ou salvação, cause +1 de dano a ele até o fim da cena.",
          ],
          [
            "Cão da Justiça",
            "Ao Desvendar Segredos ou Perceber Intenções em busca de um fora da lei, criatura maligna ou inimigo jurado, faça uma pergunta abaixo além dos resultados normais; o Mestre sempre responde com a verdade, mesmo com 6 ou menos: Onde ele está? Como é mais vulnerável? O que planeja? Quem está perto de se voltar contra ele?",
          ],
          [
            "Marca do Julgamento",
            "Quando você marca uma pessoa ou criatura maligna, física ou metaforicamente, em geral levando tempo e com ela indefesa, role+SAB. Com 7 ou mais, escolha uma até ela mudar para melhor. Com 10 ou mais, faça uma escolha extra. Com 6 ou menos, escolha uma, mas a marca some com o tempo: você sempre a localiza com facilidade; todos os civilizados a tratam como criminosa ou pária; ela perde um poder ou habilidade importante que tinha.",
          ],
          [
            "Visão Verdadeira",
            "Seus sentidos ignoram a escuridão, perfuram ilusões e detectam mentiras.",
          ],
        ],
      },
      {
        name: "Exemplar",
        start: [
          "\"Mas Não É Este o Dia!\"",
          "Quando você faz um discurso inspirador aos companheiros e aliados, role+CAR, com desvantagem se estiver em meio a algo barulhento, perigoso ou aterrorizante. Com 10 ou mais, reponha a Moral a 3. Com 7 a 9, a 2. Com 6 ou menos, o discurso é interrompido ou solapado: reponha a Moral a 0, marque 1 XP e o Mestre faz um movimento.\n" +
            "Quando você ou um PC próximo for marcar uma condição, pode gastar 1 de Moral em vez disso.",
        ],
        advanced: [
          [
            "Liderar pelo Exemplo",
            "Sempre que tirar 12 ou mais, ganhe 1 de Moral.",
          ],
          [
            "Mudança de Coração",
            "Quando você implora a um NPC que realmente mude para melhor, se ele estiver aberto a isso (decisão do Mestre), role+CAR. Com 10 ou mais, ele inicia de verdade a jornada para ser sua melhor versão. Com 7 a 9, ele escolhe uma: suas palavras o assombram e distraem, dando a você e a cada PC vantagem nas próximas rolagens contra ele; suas palavras tocam parte dele e, só desta vez, ele oferece clemência, um segredo ou uma oportunidade; ele revela um forte motivo pelo qual não pode mudar (se você o remover, trate como 10 ou mais). Com 6 ou menos, ele endurece o coração contra você: marque 1 XP e o Mestre faz um movimento. Em qualquer resultado, não pode usar este movimento nele de novo.",
          ],
          [
            "Uni-los",
            "Quando você tenta se juntar ou se aliar a uma facção que não é inimiga direta, ela conta um grande problema ou objetivo que enfrenta. Se você ajudar a resolvê-lo, ganha a lealdade dela, e ela aceita trabalhar com qualquer um, até inimigos, desde que você lidere o esforço.",
          ],
          [
            "Agora É a Sua Vez",
            "Ao Encarar a Morte, pode escolher também: Sucessor. Nomeie um personagem, diga por que acredita nele e então morra. Se ele aceitar suas palavras, ganha este Caminho de graça, além dos limites normais de Caminhos.",
          ],
        ],
        extras: [meter("Moral", 3, 0)],
      },
    ],
  },
  {
    id: "ranger",
    name: "Patrulheiro",
    pitch:
      "Você é o guia e o caçador, a criatura que ronda a fronteira entre homem e fera, entre segurança e perigo. Fez dos caminhos secretos suas estradas e dos lugares ocultos seu refúgio. Então prepare a arma, confira as rações e aperte as botas: você vai aonde ninguém mais ousa.",
    start: [
      "Caçar a Presa",
      "Quando você se concentra em caçar um indivíduo, ele vira sua Presa. Anote seu nome ou apelido. Se já tinha uma Presa, marque uma condição e limpe a antiga. Você tem estes benefícios ao lidar com a Presa:\n" +
        "- Em perseguição direta, como se ela fugisse, se escondesse ou estivesse longe, role com vantagem.\n" +
        "- Ao Recordar Conhecimento sobre ela, ganhe +1 na rolagem.\n" +
        "- Uma vez por cena, ao Obter Vantagem Tática contra ela, com 7 ou mais escolha duas em vez de uma.\n" +
        "Com o Caminho correspondente, ganha também: (Guardião) ao usar um Kit de Armadilhas contra ela, causa +1 de dano e não atrapalha nem põe em risco você ou aliados; (Mestre das Feras) quando seu companheiro ajuda você a Desvendar Segredos ou Perceber Intenções sobre ela, trate 7 a 9 como 10 ou mais; (Olho de Águia) ao Obter Vantagem Tática contra ela, com 10 ou mais escolha também uma de Manter Ocupado.\n" +
        "Ao derrotá-la, limpe uma condição e limpe sua Presa.",
    ],
    sheet: [
      "PV máximos: 8.",
      "Atributos (escolha uma): FOR 1, DES 1, INT 2, SAB -1, CAR 0; ou FOR -1, DES 2, INT 1, SAB 0, CAR 1.",
      "Armas (escolha uma): Arco composto (2 de dano, médio e longe, precisa, munição, duas mãos); Cajado confiável (1, mão, perto, duas mãos) e Funda (1, médio, precisa, recarga); Machadinhas duplas (2 sozinha, 3 juntas, perto, leve).",
      "Itens (escolha dois): Equipamento de aventura, Armadura leve, Remédio, Kit de armadilhas.",
      "Aparência: capa com capuz, peles quentes ou couros resistentes; troféu monstruoso, cicatrizes marcantes ou camuflagem natural.",
      "Relacionamentos de exemplo: Não conhece a sutileza e se recusa a aprender. Sei algumas coisas melhor que ela, mesmo que não suporte. Ajudei-a de um aperto uma vez e ela nunca agradeceu. Derrotamos juntos um monstro perigoso; somos família. Mostra potencial com a mata; ensinarei o que puder. Vou vigiá-la de perto, caso traga ou ache problema.",
      "Origens: Eu sou um (elfo, anão, povo-lagarto, miconídeo...). Passei a juventude entre (florestas de árvores gigantes, desertos cheios de ruínas, ilhas de tempestade eterna). Ficaram me conhecendo como (guia errante, caçador de monstros experiente, herborista coletor). Comecei a aventurar depois que (minhas terras ficaram civilizadas demais, um velho inimigo ressurgiu, infringi uma lei importante).",
      "Nomes: Throndir, Ysolt, Dianna, Celion, Eloise, Gendrig, um apelido.",
      "Recompensas de Conflito: Grande Caçada (ao Caçar a Presa, pode escolher um grupo de indivíduos ligados como Presa, e só conta como derrotada quando todos forem derrotados) ou Momento de Heroísmo.",
    ],
    extras: [field("Presa")],
    paths: [
      {
        name: "Guardião",
        start: [
          "Reconhecimento Prévio",
          "Quando você examina uma área perigosa longe dos companheiros, pule até a volta ao acampamento. O Mestre descreve o que viu e você rola+DES. Com 10 ou mais, escolha três; com 7 a 9, duas; com 6 ou menos, uma, mas algo perigoso seguiu você até o acampamento: marque 1 XP e o Mestre faz um movimento.\n" +
            "- Você aprendeu algo: faça ao Mestre uma pergunta sobre o que viu (pode escolher várias vezes).\n" +
            "- Você trouxe algo útil; diga o quê, e o Mestre pode dizer que era difícil demais de carregar sozinho.\n" +
            "- Você armou uma armadilha na área, como se gastasse um uso de Kit de Armadilhas.\n" +
            "- Você descobriu um possível aliado, oportunidade ou fraqueza; o Mestre diz qual.",
        ],
        advanced: [
          [
            "Coletor",
            "Quando você busca recursos numa paisagem natural, role+INT. Com 7 ou mais, ganhe 2 Usos, divididos entre Equipamento de aventura, Remédio e Suprimentos. Com 7 a 9, o terreno é árido ou difícil: marque uma condição ou reduza em 1 os Usos ganhos. Com 6 ou menos, você acha algo perigoso ou é achado: marque 1 XP e o Mestre faz um movimento.",
          ],
          [
            "Enciclopédia Natural",
            "Ao Recordar Conhecimento sobre planta, fera ou monstro, com 7 ou mais faça uma pergunta adicional. Se ele luta, o Mestre também diz seus PV e dano.",
          ],
          [
            "Catador",
            "Ao Desvendar Segredos, em qualquer resultado pode perguntar também: \"Há valores aqui que eu não conheço?\" Se sim, ganhe vantagem na próxima rolagem para persegui-los.",
          ],
          [
            "Guia de Trilha",
            "Ao Empreender Jornada, se for o líder, limpe duas condições. Se outro PC for o líder, ganhe 1 de profundidade com ele.",
          ],
        ],
      },
      {
        name: "Mestre das Feras",
        start: [
          "Companheiro Animal",
          "Você trabalha de perto com uma fera natural de porte médio ou menor, como lobo, urso, raposa, corvo. Diga ao grupo quem é, como é e como se uniram. Escolha duas Qualidades dele: Voador, Aquático, Grande, Furtivo, Forte, Escavador, Blindado, Intimidante, Inteligente, Encantador. E um Defeito: Arrogante, Brutal, Caótico, Distraído, Frágil, Ganancioso, Íntegro, Rebelde.\n" +
            "Quando o companheiro está com você, em geral você controla e descreve as ações dele; quando não está, o Mestre controla. De qualquer modo, ele age segundo suas Qualidades e às vezes o Defeito.\n" +
            "Quando o companheiro ajuda, diga como e que Qualidades são relevantes (decisão do Mestre), e escolha uma opção para cada: cria uma oportunidade ou supera um pequeno obstáculo; dá vantagem numa rolagem associada; o Defeito não cria exigência nem complicação; segue disposto a ajudar de novo na cena.\n" +
            "Ele não tem PV. Quando se fere, marque uma condição ou diga como ele sai da cena. Uma vez, como Movimento Avançado do Caminho, ganhe duas Qualidades a mais.",
        ],
        advanced: [
          [
            "Independente",
            "Quando você manda o companheiro agir sozinho, mantém o controle dele e ele tem acesso (razoável) aos mesmos movimentos que você. Se rolar, o atributo dele é igual às Qualidades relevantes (máx. 3), -1 se o Defeito for relevante.",
          ],
          [
            "Missão de Lealdade",
            "Depois de lidar com o Defeito do companheiro, ganhe 1 de Lealdade (máx. 3). Pode gastar Lealdade para tratar uma Qualidade como relevante quando normalmente não seria.",
          ],
          [
            "Salvador",
            "Ao Encarar a Morte, pode escolher também: Resgatado. Seu companheiro salva você, mas fica incapaz de ajudar até você Montar Acampamento. Restaure seus PV a 1.",
          ],
        ],
        extras: [meter("Lealdade", 3, 0), field("Qualidades e defeito")],
      },
      {
        name: "Olho de Águia",
        start: [
          "Tiro Certeiro",
          "Quando você entra numa batalha ou Obtém Vantagem Tática (em qualquer rolagem), ganhe 1 de Perspicácia até o fim da batalha. Com uma arma à distância, pode gastar Perspicácia 1 por 1 para reforçar seu próximo movimento de batalha:\n" +
            "- Ganha Perfurante e ignora cobertura e camuflagem.\n- Fica Ácido, Ofuscante, Flamejante ou Sagrado, como na Bandoleira de Frascos.\n- É rápido e furtivo, perdendo Distintivo e Recarga.",
        ],
        advanced: [
          [
            "Caçador de Caça Grande",
            "Sempre há algum perigo por perto para resolver. Quando você declara que há uma criatura feroz ou monstro na área, responda três das perguntas abaixo, e o Mestre responde às outras três em segredo: Qual o tamanho? Quantos são? Onde fica o covil? Quais as defesas? O que pode fazer? Que saque pode ter? Ao mostrar às autoridades a prova de que a ameaça foi resolvida, ganhe 3 de tesouro.",
          ],
          [
            "Fogo de Cobertura",
            "Ganhe 1 de Perspicácia adicional ao entrar numa batalha. Ao Auxiliar um Companheiro em batalha, pode gastar Perspicácia em vez de marcar uma condição.",
          ],
          [
            "Atirador de Elite",
            "Ao usar uma arma à distância para Manter Ocupado, pode escolher também \"troque dano com ele\". Ao trocar dano de grande distância, terreno elevado, posição fortificada ou similar, reduza em 1 o dano que causa e em 3 o que sofre.",
          ],
          [
            "Apagar o Sol",
            "Ao tirar 10 ou mais para Obter Vantagem Tática, ganhe 1 de Perspicácia adicional. Em batalha, pode gastar Perspicácia para reforçar movimentos de batalha também assim: ganha a etiqueta Área; ganha uma etiqueta de alcance adicional (Mão, Perto, Médio, Longe); danifica ou destrói parte do ambiente.",
          ],
        ],
        extras: [meter("Perspicácia", 4, 0)],
      },
    ],
  },
  {
    id: "rogue",
    name: "Ladino",
    pitch:
      "Você dança entre sombras e telhados, manejando astúcia e esperteza com a mesma destreza que a faca. Que os ricos temam seu nome em suas mansões trancadas. Que seus lacaios desajeitados o procurem às cegas. Você já veio, já se foi, pegou o que queria e partiu para o próximo alvo. Afinal, há tanta riqueza no mundo esperando para ser tomada.",
    start: [
      "Um Conjunto Particular de Habilidades",
      "Quando você se Esgueira ou Desafia o Perigo empregando uma habilidade astuta, com 7 ou mais faça uma escolha a menos.\n" +
        "Você começa com a habilidade astuta: Truques do Ofício: arrombar fechaduras, bater carteiras, enganar.\n" +
        "Ao ganhar um Caminho de Ladino, ganha as habilidades associadas: (Assassino) Acrobacia: escalar, dar saltos, caber em apertos; (Patife) Roubo: trapacear, distrair, achar ou desarmar armadilhas; (Mentor) Espionagem: chantagem, disfarce, escrever em código.\n" +
        "Ao ganhar um Caminho de outra classe, escreva com o Mestre novas habilidades astutas que combinem com ele.",
    ],
    sheet: [
      "PV máximos: 6.",
      "Atributos (escolha uma): FOR 1, DES 2, INT 0, SAB 1, CAR -1; ou FOR -1, DES 1, INT 2, SAB 0, CAR 1.",
      "Armas (escolha uma): Arco dobrável (2 de dano, médio e longe, precisa, munição, duas mãos); Facas escondidas (1, precisa, letal, mão, médio, leve, infinita); Chicote confiável (1, precisa, perto, médio, distintiva).",
      "Itens (escolha dois): Equipamento de aventura, Armadura leve, Bandoleira de frascos, Kit de venenos.",
      "Aparência: capa escura, traje elegante ou rosto e roupas esquecíveis; joia sentimental, amuleto da sorte ou lista de alvos.",
      "Relacionamentos de exemplo: Cometeu um grande crime comigo. Acha-me escória, e o sentimento é mútuo. Somos família: brigamos e nos cuidamos como ninguém. Uma vez roubei algo dela, ou pior. Ainda me deve pelo que fiz por ela.",
      "Origens: Eu sou um (halfling, povo-gato, metamorfo, gosmoide...). Fui criado numa vida de (nobreza responsável, devoção obsessiva, vício indulgente). Entrei no submundo quando (roubei um tesouro valioso, um chefão me recrutou, fui incriminado por uma atrocidade). Comecei a aventurar depois que (meu melhor amigo desapareceu, alguém me inspirou a fazer o bem, descobri uma grande conspiração).",
      "Nomes: Dominic, Kiera, Lila, Cicatriz, Riley, Corvo, Marlow, um nome esperto.",
      "Recompensas de Conflito: Profissional Habilidoso (pode marcar uma condição para escolher qualquer habilidade viável e tratá-la como habilidade astuta na cena) ou Momento de Heroísmo.",
    ],
    paths: [
      {
        name: "Patife",
        start: [
          "Eu Faço Minha Própria Sorte",
          "Ao começar a sessão, role um d6 como seu Dado da Sorte e guarde o resultado. Durante o jogo, depois de rolar, pode trocar um dado pelo Dado da Sorte. O dado que sai vira o novo Dado da Sorte.",
        ],
        advanced: [
          [
            "Rápido no Gatilho",
            "Quando o Mestre ou outro jogador vai fazer um movimento, pode pedir licença e marcar uma condição para interrompê-lo e agir antes. Na primeira vez por sessão não precisa marcar condição.",
          ],
          [
            "Calhorda Egoísta",
            "Quando você põe seus interesses acima dos dos aliados, pode Auxiliar a si mesmo como se fosse um companheiro, e pode gastar profundidade com companheiros para ganhar o mesmo número de benefícios de Auxílio extras.",
          ],
          [
            "Carta na Manga",
            "Quando você trapaceia num jogo de azar, role+DES. Com 10 ou mais, decide o resultado do jogo. Com 7 a 9, ainda decide, mas escolha uma: alguém tenta tomar seus ganhos, justa ou injustamente; alguém passa a vigiar você de perto; alguém acusa você de trapacear (que audácia!).",
          ],
          [
            "Contatos do Submundo",
            "Quando você espalha no submundo que procura algo (itens, informação, acesso a um lugar ou pessoa...), role+CAR. Em qualquer resultado, alguém volta com uma pista. Com 10 ou mais, escolha uma complicação; com 7 a 9, duas: em vez da coisa, você recebe uma ótima oportunidade; aja agora ou ela passa; quem tem a coisa não conhece nem gosta de você, e é preciso lidar com ele; você ficará devendo muito a alguém (até pagar, tem desvantagem neste movimento e não pode escolher isso de novo). Com 6 ou menos, a pista pode ser falsa, armadilha ou já reivindicada por um inimigo: o Mestre faz um movimento e você marca 1 XP.",
          ],
        ],
        extras: [field("Dado da Sorte")],
      },
      {
        name: "Mentor",
        start: [
          "Flashback",
          "Quando você declara retroativamente como se preparou com antecedência para algo, marque condições conforme o Mestre determina, pela diretriz abaixo. Como consequência, durante um flashback o Mestre pode impor condições extras.\n" +
            "- 1 condição: ação comum, oportunidade fácil, sem rolagens, há pouco tempo.\n" +
            "- 2 condições: ação complexa, oportunidade improvável, uma rolagem, algum tempo atrás.\n" +
            "- 3 condições: ação elaborada, oportunidade especial, várias rolagens, muito tempo atrás.",
        ],
        advanced: [
          [
            "Planos Dentro de Planos",
            "Quando você diz que uma situação terrível ainda está \"saindo conforme o plano\", crie uma reviravolta positiva significativa (um inimigo do seu lado, reforços ocultos, equipamento contrabandeado, uma armadilha...). Você ainda está em apuros, mas bem menos do que parecia. Então não pode usar este movimento de novo até Subir de Nível.",
          ],
          [
            "Pronto para Tudo",
            "Ao começar a sessão, reponha o Preparo igual ao seu maior atributo. Ao fazer um Flashback, pode gastar 1 de Preparo em vez de marcar uma condição.",
          ],
          [
            "Sabotador",
            "Quando você revela que sabotou antes um prédio, mecanismo ou veículo, bem na hora em que fica relevante, em vez de um Flashback pode rolar+DES. Com 10 ou mais, explode com estrondo, criando a oportunidade perfeita. Com 7 a 9, a oportunidade é passageira: aja agora ou ela some. Com 6 ou menos, há dano colateral ou efeitos colaterais: o Mestre faz um movimento e você marca 1 XP.",
          ],
          [
            "Cinto de Utilidades",
            "Pode marcar uma condição (ou gastar Preparo, se tiver) para produzir uma arma disfarçável ou item comum (como do Equipamento de aventura) do nada.",
          ],
        ],
        extras: [meter("Preparo", 3, 0)],
      },
      {
        name: "Assassino",
        start: [
          "Ataque Furtivo",
          "Ao fazer um Ataque Total, se o inimigo estava distraído ou desprevenido, com 7 ou mais você causa seu dano sem receber nenhum em troca.",
        ],
        advanced: [
          [
            "Sentido de Perigo",
            "Ao Desafiar o Perigo contra uma armadilha ou emboscada, ganhe vantagem se for a primeira vez na cena e, com 12 ou mais, escolha 0.",
          ],
          [
            "Envenenador",
            "Pode marcar uma condição ou um uso de Kit de Venenos para criar na hora um frasco de veneno caseiro; diga o que faz e escolha duas opções. Pode marcar condições adicionais para fazer uma escolha extra cada: é entregue por toque (senão, por ingestão); é indetectável; faz efeito exatamente quando você quer; é tão forte quanto você quer.",
          ],
          [
            "Arte das Sombras",
            "Quando você pede ajuda às sombras, role+DES. Com 10 ou mais, escolha dois efeitos; com 7 a 9, um. Duram até o fim da cena: você maneja sombras como lâminas perfurantes; passa entre sombras num piscar de olhos; encolhe, cresce e remodela sombras próximas. Com 6 ou menos, as sombras ficam famintas e inquietas: marque 1 XP e o Mestre faz um movimento.",
          ],
          [
            "Ato de Desaparecimento",
            "Quando você tem certeza de que ninguém presta atenção direta em você, pode sumir da cena por completo, só voltando à narrativa quando a cena terminar. Se estiver em apuros, pergunte ao Mestre o que deve fazer para sumir, e ele dará de 1 a 3 exigências: deixar algo importante para trás; sofrer uma condição no processo; ao reaparecer, virá com problema; primeiro arriscar, enganar ou roubar algo.",
          ],
        ],
      },
    ],
  },
  {
    id: "wizard",
    name: "Mago",
    pitch:
      "Você tece o próprio tecido da realidade, vincula o caos à ordem e manifesta sua vontade no mundo. Enquanto uns esperam chuva, você conjura nuvens de tempestade. Enquanto outros viajam semanas entre cidades, você passa entre mundos num piscar de olhos. Uns podem temer e odiar seus dons, mas não sabem que magia realmente existe.",
    start: [
      "Tecer um Feitiço",
      "Você estudou as escolas fundamentais da magia. Cada escola tem um Sujeito (o que você pode mudar) e um Verbo (como pode mudar). Ao ganhar um Caminho de Mago, ganhe uma nova Escola e aprenda seu Sujeito e Verbo. Depois de Montar Acampamento, recupere Sujeitos e Verbos esquecidos. Escolha duas escolas agora:\n" +
        "- Abjuração. Sujeito: a própria magia. Verbo: Desfazer.\n- Conjuração. Sujeito: objetos ou forasteiros. Verbo: Invocar.\n- Adivinhação. Sujeito: visões. Verbo: Discernir.\n" +
        "- Encantamento. Sujeito: seres sencientes. Verbo: Enfeitiçar.\n- Evocação. Sujeito: energias elementares. Verbo: Canalizar.\n- Ilusão. Sujeito: imagens ou sons. Verbo: Disfarçar.\n" +
        "- Necromancia. Sujeito: não-vida. Verbo: Conceder.\n- Transmutação. Sujeito: matéria. Verbo: Alterar Brevemente.\n" +
        "Quando você combina um Sujeito e um Verbo que conhece num feitiço, sejam da mesma escola ou não, diga o que quer que aconteça, marque condições iguais à Magnitude (decidida pelo Mestre) e role+INT. Com 7 ou mais, o feitiço funciona. Com 7 a 9, o Mestre acrescenta uma reviravolta ou você esquece um Sujeito ou Verbo que usou, à sua escolha. Com 6 ou menos, é interrompido ou sai do controle: marque 1 XP e o Mestre faz um movimento.",
    ],
    sheet: [
      "PV máximos: 6.",
      "Atributos (escolha uma): FOR -1, DES 0, INT 2, SAB 1, CAR 1; ou FOR 1, DES 1, INT 2, SAB 0, CAR -1.",
      "Armas (escolha uma): Adaga encantada (1 de dano, precisa, mão, médio, perfurante, leve); Cajado brilhante (1, mão, perto, duas mãos, distintivo); Besta simples (2, médio e longe, precisa, perfurante, duas mãos, recarga, munição).",
      "Itens (escolha dois): Equipamento de aventura, Sacola de livros, Bandoleira de frascos, Suprimentos.",
      "Aparência: vestes astrais, capa discreta ou chapéu místico; bolsa de componentes, orbe celeste ou tomo rúnico pesado.",
      "Relacionamentos de exemplo: Tem talento mágico latente; vou guiá-lo e nutri-lo. Quero compensar a vez em que o atingi com um feitiço descontrolado. Compartilhamos um interesse de nicho e passamos horas falando ou trabalhando nele. Está escondendo um segredo de mim; tenho certeza. Acho que não se impressiona com minha magia; vou mudar isso. Está muito mal informado sobre o mundo; vou ensiná-lo.",
      "Origens: Eu sou um (elfo, goblin, orc, golem...). Fui criado numa vida de (trabalho braçal, comércio itinerante, estudo dedicado). Comecei a estudar magia depois que (roubei um grimório, impressionei um mestre, entrei numa academia). Levei meus estudos para a estrada (após um experimento desastroso, como parte do teste final, em busca de um segredo mágico).",
      "Nomes: Galadir, Mortimer, Xeno, Draft, Steburis, um nome complexo.",
      "Recompensas de Conflito: Arquimago (ao ganhar este movimento e ao Aproveitar o Descanso gastando 1 de tesouro, pode reescrever um Sujeito ou Verbo para algo mais adequado aos seus interesses ou à escola; o Mestre decide) ou Momento de Heroísmo.",
    ],
    extras: [field("Sujeitos e verbos conhecidos")],
    paths: [
      {
        name: "Adepto",
        start: [
          "Palavras de Poder",
          "Você estudou forças que reescrevem a própria realidade. Escolha um Sujeito (o que pode mudar) e um Verbo (como pode mudar), que você combina como ao Tecer um Feitiço (o Movimento Inicial do Mago). Depois de Montar Acampamento, recupere Sujeitos e Verbos esquecidos. Se for Mago, pode combinar essas palavras com as das escolas estudadas.\n" +
            "Sujeitos: Ar, Terra, Fogo, Luz, Natureza, Água. Verbos: Absorver, Animar, Criar, Destruir, Remodelar.",
        ],
        advanced: [
          [
            "Feitiço Característico",
            "Ao ganhar este movimento, escolha um efeito mágico específico (um feitiço) que já criou e anote. Você vira especialista nesse feitiço: ao lançá-lo, trate sua Mag como 1 a menos para marcar condições. Se já era Mag 0, ganhe vantagem na rolagem. Você também passa a ser associado a ele: quem o conhece sabe de sua habilidade, procuram você por ele e os inimigos podem preparar defesas contra ele.",
          ],
          [
            "Espadachim Arcano",
            "Armadura leve nunca é Desajeitada para você. Enquanto usa magia ao lado de uma arma que não é de duas mãos, cause +1 de dano com ela.",
          ],
          [
            "Meus Amigos São Meu Poder",
            "Quando você recebe Auxílio ao Realizar um Ritual (veja Rituais), acrescente \"ignore uma exigência do Ritual\" à lista de escolhas de Auxílio.",
          ],
          [
            "Familiar",
            "Você tem uma criatura companheira pequena e quase inofensiva, ligada a você por magia. Quem é? Como é? Como age? Em geral age como extensão sua, mas como um movimento o Mestre pode fazê-la agir por conta própria. Você se comunica por telepatia com ela e pode se concentrar para perceber através dos sentidos dela. Quando o familiar se fere, marque uma condição.",
          ],
        ],
        extras: [field("Sujeito e verbo"), field("Feitiço característico")],
      },
      {
        name: "Estudioso",
        start: [
          "Mestre do Saber",
          "Você estudou muito e virou especialista em poucos tópicos. Escolha dois agora; como Movimento Avançado do Caminho, pode virar especialista em mais dois, até quatro. Ao Recordar Conhecimento sobre um tópico em que é especialista:\n" +
            "- Depois de responder às perguntas, pode rolar+INT em vez de +perguntas. Se o fizer, ignore as penalidades de Irritado na rolagem.\n" +
            "- Trate 7 a 9 como 10 ou mais, e 10 ou mais como 12 ou mais.\n" +
            "- Com 12 ou mais, se compartilhar o conhecimento em detalhe com um aliado, você e ele ganham vantagem na primeira vez em que agirem com base nele (em vez de só um).\n" +
            "Tópicos: Feitiços e Magias; Mortos e Mortos-Vivos; Nações e Política; Monstros Antinaturais; As Esferas Planares; Velhos Heróis e Relíquias; Deuses e Seus Servos; Flora e Fauna Naturais.",
        ],
        advanced: [
          [
            "Conselho de Sábio",
            "Quando você dá a alguém um conselho lógico e razoável sobre o que fazer, marque uma condição para Confortar ou Apoiar com vantagem. Se ele seguir o conselho, tem vantagem na primeira vez que rolar.",
          ],
          [
            "Estudos Paralelos",
            "Ao Recordar Conhecimento, pode marcar uma condição para tratar o assunto como se estivesse entre seus tópicos de especialista (veja Mestre do Saber), seja qual for.",
          ],
          [
            "Percepção Extrassensorial",
            "Quando você se conecta magicamente pela primeira vez com um objeto importante, role+INT e faça ao Mestre perguntas sobre sua história, origem, funções, propriedades etc. Com 10 ou mais, faça três; com 7 a 9, duas; com 6 ou menos, uma, mas o objeto amaldiçoa ou assombra você até acalmá-lo; o Mestre diz como.",
          ],
        ],
        extras: [field("Tópicos de especialista")],
      },
      {
        name: "Quebra-Feitiços",
        start: [
          "Assimilar",
          "Quando você anula ou destrói algo mágico, pode marcar uma condição para absorver e guardar a magia para depois. Ela pode ser liberada ao Desafiar o Perigo, e depois se dissipa. Se liberá-la logo depois de absorvê-la, role com vantagem e, com 12 ou mais, escolha 0. Só pode guardar um efeito mágico por vez.",
        ],
        advanced: [
          [
            "Detectar Magia",
            "Quando você abre os sentidos ao reino mágico, o Mestre diz que magia próxima você sente. Então pode marcar uma condição para fazer todas estas perguntas sobre uma fonte de magia que sente: Que tipo(s) de magia é? Onde ela fica com precisão? O que há de perigoso nela?",
          ],
          [
            "Contrafeitiço",
            "Ao Desafiar um perigo mágico usando magia sua, role com um atributo associado à fonte da sua magia (INT para feitiços de Mago, SAB para milagres de Clérigo etc.). Com 12 ou mais, escolha 0.",
          ],
          [
            "Armadura Arcana",
            "Quando você sofre dano mágico, reduza em 1. Pode marcar condições para reduzir mais 1 por condição marcada.",
          ],
          [
            "Campo Antimagia",
            "Quando você cria uma área de antimagia, marque uma condição e role+INT. Com 7 ou mais, toda a magia perto de você (inclusive a sua) é suprimida até você parar de mantê-la ou a cena acabar, o que vier primeiro. Com 7 a 9, escolha uma: é muito menor ou muito maior do que pretendia; você não pode fazer mais nada enquanto a mantém; a magia nela é muito reduzida, mas não totalmente suprimida. Com 6 ou menos, o campo é sobrecarregado ou sabotado: marque 1 XP e o Mestre faz um movimento.",
          ],
        ],
        extras: [field("Magia guardada")],
      },
    ],
  },
];

/** O movimento inicial da classe e cada caminho, como cartas escolhíveis para a ficha. */
export const DW2_PLAYBOOKS: AssetsItem = {
  id: "playbooks",
  name: "Movimentos de classe e caminhos",
  kind: "assets",
  entries: CLASSES.flatMap((playClass): AssetEntry[] => [
    {
      id: `${playClass.id}-class`,
      category: playClass.name,
      name: `${playClass.name}: ${playClass.start[0]}`,
      terror: false,
      flavor: `Movimento inicial de ${playClass.name}.`,
      abilities: [ability(playClass.start, true)],
      extras: playClass.extras ?? [],
    },
    ...playClass.paths.map((path): AssetEntry => ({
      id: `${playClass.id}-${path.name.toLowerCase().replaceAll(" ", "-").normalize("NFD").replace(/[̀-ͯ]/g, "")}`,
      category: playClass.name,
      name: `Caminho ${path.name}`,
      terror: false,
      flavor: `Caminho de ${playClass.name}. O movimento inicial já vem marcado; marque os avançados ao aprendê-los.`,
      abilities: [ability(path.start, true), ...path.advanced.map((move) => ability(move, false))],
      extras: path.extras ?? [],
    })),
  ]),
};

/** Uma entrada por classe, com o que está impresso na ficha dela. */
export const DW2_CLASSES = reference("classes", "Classes", [
  ...CLASSES.map((playClass) => ({
    group: "Classes",
    title: playClass.name,
    summary: playClass.pitch.split(". ")[0] + ".",
    text: `${playClass.pitch}\n${playClass.sheet.join("\n")}\nCaminhos: ${playClass.paths.map((p) => p.name).join(", ")}.`,
  })),
  {
    group: "Avanços",
    title: "Avanços de todas as classes",
    summary: "O que escolher ao subir de nível.",
    text: ADVANCEMENTS,
  },
]);

