import type { ReferenceEntry, ReferenceItem } from "./types.ts";

/**
 * Regras e movimentos do Dungeon World 2 (Alfa Final), traduzidos e resumidos para este app.
 * Siglas em português: FOR, DES, INT, SAB e CAR.
 */

function entry(group: string, title: string, text: string, summary?: string): Omit<ReferenceEntry, "id"> {
  return { group, title, text, summary };
}

export function reference(id: string, name: string, entries: Omit<ReferenceEntry, "id">[]): ReferenceItem {
  return {
    id,
    name,
    kind: "reference",
    entries: entries.map((e, i) => ({ id: `${id}-${i + 1}`, ...e })),
  };
}

export const DW2_RULES = reference("rules", "Regras", [
  entry(
    "Jogando",
    "A conversa",
    "O jogo é uma conversa em um espaço imaginado em comum, a ficção.\n" +
      "1. O Mestre apresenta uma situação dramática e, em geral, pergunta: O que você faz?\n" +
      "2. Os jogadores descrevem a resposta dos personagens.\n" +
      "3. O grupo vê se algum movimento é acionado: a maioria começa com um gatilho, como \"Quando você tenta tirar algo de um inimigo...\".\n" +
      "4. Se for, resolvem o movimento, quase sempre rolando dados. O resultado muda a ficção.\n" +
      "5. O Mestre descreve o que muda e apresenta a próxima situação. Sem movimento acionado, ele decide o que acontece pela situação e pelos seus princípios.",
    "Mestre descreve, jogadores respondem, movimentos resolvem, e a ficção muda.",
  ),
  entry(
    "Jogando",
    "Jogue para descobrir",
    "Ninguém, nem jogador nem Mestre, sabe com certeza o que vai acontecer. Confie nas regras, nos princípios e nos dados para levar a história adiante, em vez de planejar finais.",
  ),
  entry(
    "Jogando",
    "Melhores práticas dos jogadores",
    "- Conecte-se ao mundo: ligue o passado do personagem a lugares, pessoas e eventos. Nunca se dê bem com todos, nunca com ninguém.\n" +
      "- Explore os personagens: mostre pensamentos, sentimentos e motivações, e faça perguntas aos outros.\n" +
      "- Jogue em equipe: mesmo quando os personagens brigam, vocês estão no mesmo time. Combine antes de ferir ou mudar o personagem de outra pessoa, e dê espaço a quem fala menos.\n" +
      "- Busque riscos: personagens brilham no fio da navalha. Mantenha planos e preparativos fora de cena ou em flashbacks.\n" +
      "- Abrace a adversidade: falhar não é o fim, é um novo começo. Seu personagem só morre se você arriscar ou escolher (veja Encarar a Morte).",
  ),
  entry(
    "Jogando",
    "Cenas",
    "O jogo se organiza em cenas: momentos de tensão, conflito ou incerteza. O Mestre costuma montá-las, mas todos podem propor, sobretudo para Montar Acampamento e Aproveitar o Descanso.\n" +
      "Pule o que é chato. Às vezes uma cena começa no meio da ação (in medias res): não pare para planejar, pense no que o personagem faria e siga em frente.",
  ),
  entry(
    "Jogando",
    "Posição na ficção",
    "O que é razoável depende do que já foi estabelecido: habilidades, equipamento e a situação. Uma pixie minúscula não maneja um machado enorme, a não ser que haja explicação. Todos cuidam disso, e o grupo esclarece como cada personagem está posicionado.",
  ),
  entry(
    "Jogando",
    "Movimentos",
    "Um movimento é uma regra independente que diz o que acontece quando uma ação específica é feita. Muitos começam com \"Quando você...\" (o gatilho).\n" +
      "Alguns dizem \"Uma vez por sessão\": só vale na primeira vez que o gatilho acontece em cada sessão, por personagem.\n" +
      "Há movimentos para todos (aventura, personagem e batalha) e outros só de uma classe, caminho, vínculo ou conflito. Os movimentos do Mestre funcionam diferente: listam o tipo de consequência que combina com o jogo.",
  ),
  entry(
    "Atributos e dados",
    "Atributos",
    "- Força (FOR): poder físico e resistência. Lutar de perto, empurrar, segurar, aguentar.\n" +
      "- Destreza (DES): rapidez, reflexos e agilidade. Esquivar, correr, esgueirar-se.\n" +
      "- Inteligência (INT): percepção e cálculo. Aprender, deduzir, planejar. Não serve para lembrar coisas.\n" +
      "- Sabedoria (SAB): empatia, intuição e instinto. Detectar mentiras e verdadeiras intenções.\n" +
      "- Carisma (CAR): presença, autoridade e simpatia. Convencer, honesta ou enganosamente.",
  ),
  entry(
    "Atributos e dados",
    "Rolagens e resultados",
    "Role 2d6 e some os dois dados. Em geral soma-se também um atributo: \"role+FOR\" é 2d6 mais a Força. Alguns movimentos fazem perguntas e dão +1 por cada \"sim\".\n" +
      "- 10 ou mais: você consegue o que queria, ou o mais perto possível, sem a maior parte das consequências.\n" +
      "- 7 a 9: sucesso parcial. Você consegue, mas com um custo, uma consequência ou um efeito reduzido.\n" +
      "- 6 ou menos: as coisas não vão bem. Quem rolou marca 1 de experiência e o Mestre faz um movimento.\n" +
      "O Mestre não rola dados pelos NPCs: as rolagens dos jogadores e as escolhas decidem como eles se saem.",
    "2d6 mais atributo: 10 ou mais é forte, 7 a 9 é parcial, 6 ou menos é erro.",
  ),
  entry(
    "Atributos e dados",
    "Vantagem e desvantagem",
    "Com vantagem, role três dados e ignore o menor, ficando com os dois maiores. Com desvantagem, role três e ignore o maior, ficando com os dois menores.\n" +
      "Vantagem e desvantagem se anulam: com duas fontes de vantagem e uma de desvantagem, você rola com vantagem.\n" +
      "Com duas ou mais vantagens, continua-se rolando três dados, mas todo resultado de 7 a 9 conta como 10 ou mais. Com duas ou mais desvantagens, todo 7 a 9 conta como 6 ou menos.\n" +
      "Nesta ficha, a tecla V rola um atributo com vantagem e D com desvantagem; as condições marcadas já dão a desvantagem sozinhas.",
  ),
  entry(
    "Atributos e dados",
    "Movimentos inversos",
    "Uns poucos movimentos têm o pior resultado com 10 ou mais e o melhor com 6 ou menos. Se você tem vantagem ou desvantagem neles, pode inverter o efeito: com vantagem em uma rolagem em que quer tirar baixo, fique com os dados menores.",
  ),
  entry(
    "Vida e dano",
    "Pontos de vida e dano",
    "Pontos de vida (PV) são uma abstração do bem-estar físico. Quando você sofre dano, diminui os PV atuais. Pode ser arranhão, ferida grave, perda de ânimo ou cansaço. Os PV máximos dependem da classe: Bárbaro, Guerreiro e Paladino 10; Bardo, Clérigo, Druida e Patrulheiro 8; Ladino e Mago 6.",
  ),
  entry(
    "Vida e dano",
    "Ensanguentado",
    "Com menos da metade dos PV máximos, você está Ensanguentado: os ferimentos são visíveis, os outros reagem a isso e você tem desvantagem em todos os movimentos de batalha. Não é uma condição, não se marca nem se limpa: ao voltar a mais da metade dos PV, deixa de estar. NPCs também ficam Ensanguentados.",
  ),
  entry(
    "Vida e dano",
    "Morrendo",
    "Com 0 PV, você está Morrendo. Personagens de jogadores precisam Encarar a Morte; a maioria dos NPCs é nocauteada, imobilizada, morta ou derrotada.\n" +
      "Quem encara a morte e sobrevive fica Mutilado: continua com 0 PV, só age com Auxílio de outro personagem (mas pode auxiliar os demais) e qualquer dano a mais mata de vez.",
  ),
  entry(
    "Vida e dano",
    "Armadura e escudos",
    "Ao sofrer dano, você pode gastar um uso da armadura ou do escudo para reduzir o que recebe, até o mínimo de zero. Armadura pesada demais para sua FOR é Desajeitada e dá desvantagem em DES. NPCs não costumam ter armadura: os mais duros só têm mais PV.",
  ),
  entry(
    "Condições",
    "As cinco condições",
    "Representam cansaço, frustração, males e emoções. Costumam vir das suas próprias escolhas, raramente de fora.\n" +
      "- Irritado: desvantagem em todas as rolagens de INT.\n" +
      "- Distraído: desvantagem em todas as rolagens de SAB.\n" +
      "- Exausto: desvantagem em todas as rolagens de FOR.\n" +
      "- Assustado: desvantagem em todas as rolagens de DES.\n" +
      "- Inseguro: desvantagem em todas as rolagens de CAR.\n" +
      "Ao receber uma condição, escolha uma livre, marque-a e descreva como ela chega ao personagem. Sem condições livres, aciona-se Chegar ao Limite.",
    "Cada condição dá desvantagem em um atributo.",
  ),
  entry(
    "Condições",
    "Livre, marcada e trancada",
    "- Livre: o círculo está vazio e a condição não afeta você.\n" +
      "- Marcada: você tem a condição e sofre sua penalidade.\n" +
      "- Trancada: raro. Além de ter a condição, ela não some por meios normais. Só efeitos que citam condições trancadas, como Aproveitar o Descanso, limpam.\n" +
      "Na ficha, a condição é uma lista de opções: esquerda e direita alternam entre Livre, Marcada e Trancada.",
  ),
  entry(
    "Progresso",
    "Experiência e níveis",
    "A experiência (XP) mede o crescimento. Os movimentos mandam marcar XP, em geral num 6 ou menos ou ao Encerrar a Sessão. Com 5 XP você sobe de nível: zera o XP, soma 1 ao nível e ganha um avanço da sua classe. Todo personagem começa no nível 1.\n" +
      "Avanços com um quadrado só podem ser escolhidos uma vez por quadrado. Os marcados com infinito ou losango não têm limite.",
  ),
  entry(
    "Progresso",
    "Classes e caminhos",
    "A classe é o arquétipo do personagem e dá um movimento inicial, equipamento, avanços e perguntas. Caminhos são especializações: ninguém começa com um, mas ao subir de nível dá para ganhar até dois da própria classe e dois de outras. Cada caminho tem um movimento inicial, ganho ao escolhê-lo, e quatro movimentos avançados, escolhidos nos níveis seguintes.\n" +
      "No compêndio, o item Movimentos de classe e caminhos tem o movimento inicial de cada classe e cada caminho como uma carta: ao adicionar à ficha, os movimentos iniciais já vêm marcados e você marca os avançados quando os aprender.",
  ),
  entry(
    "Progresso",
    "Conflitos, relacionamentos e vínculos",
    "Um conflito é a luta central do personagem, contra alguém, o mundo ou si mesmo. Por padrão ninguém começa com um; dá para ganhar ao subir de nível.\n" +
      "Relacionamentos são as ligações de superfície entre personagens de jogadores, com detalhes e profundidade, e mudam com os acontecimentos. Com profundidade 3 no relacionamento, você pode Forjar um Vínculo, uma dinâmica mais duradoura compartilhada por dois personagens.",
  ),
  entry(
    "Progresso",
    "Tesouro",
    "Tesouro é o valor que não serve de arma nem armadura: moedas, joias, mercadorias, relíquias.\n" +
      "- 1: um punhado de moedas, uma obra de arte razoável, joia simples de prata.\n" +
      "- 2: uma bolsa cheia, uma caixa de mercadorias, uma pedra pequena.\n" +
      "- 3: um saco estufado de moedas, uma pilha de mercadorias, uma obra fina.\n" +
      "- 4: um baú pequeno de moedas, uma carroça de mercadorias, uma gema grande, joias requintadas.\n" +
      "- 5: um baú transbordando, uma obra-prima, um armazém de mercadorias.\n" +
      "É preciso levar o tesouro de volta à civilização e gastá-lo ao Aproveitar o Descanso. Ninguém começa com tesouro.",
  ),
  entry(
    "Magia",
    "Magnitude",
    "Magnitude (Mag) é a escala e o poder de um efeito mágico. A maioria dos movimentos de efeito aberto cobra um custo ou risco proporcional à Mag.\n" +
      "- Mag 0: uma pequena rajada de fogo, invocar ou encantar um ser comum, invisibilidade breve, amortecer uma queda. Dá para fazer sem magia.\n" +
      "- Mag 1: uma bola de fogo explosiva, invocar uma criatura mágica, tornar um grupo invisível, voar por um minuto. Sem magia, exigiria esforço complexo, longo ou em grupo.\n" +
      "- Mag 2: uma vasta muralha de fogo, invocar uma criatura mítica, esconder uma taverna, voar por horas. Impossível sem magia.\n" +
      "- Mag 3 ou mais: chover meteoros, invocar um semideus, esconder uma cidade, voar por uma semana. O Mestre pode dizer que é um Ritual.\n" +
      "A Mag cresce de forma exponencial: se Mag 0 afeta uma pessoa, Mag 1 afeta cerca de cinco, Mag 2 uns cinquenta. O Mestre decide a Mag, mas o mago pode ajustar o efeito para caber em uma.",
  ),
  entry(
    "Magia",
    "Rituais",
    "Magia grande demais exige tempo e preparo. Diga ao Mestre o efeito que quer; ele responde \"Claro, mas você precisará de uma fonte de poder ligada à sua magia e também...\", com tantas exigências quanto a Mag. Cumpridas, você realiza o ritual. Exemplos de exigência:\n" +
      "- Primeiro você precisa de X.\n- Vai levar dias, semanas ou meses.\n- Vai exigir X.\n- Será pouco confiável ou limitado.\n" +
      "- Você e seus aliados arriscarão X no fim.\n- Você precisará de ajuda de X.\n- Você precisará destruir X.\n- Alguém tentará impedir você.",
  ),
  entry(
    "Magia",
    "Magia em batalha",
    "Se um movimento de batalha for acionado, ele costuma substituir o movimento normal da sua magia. Marque condições iguais à Mag do efeito, mas pode rolar com o atributo da sua magia em vez do normal.\n" +
      "Se nenhum movimento de batalha for acionado (ninguém vê você, não há ameaça), siga o movimento normal da magia para estabelecer o efeito.",
  ),
  entry(
    "Magia",
    "Dano mágico e etiquetas",
    "Um efeito Mag 0 costuma ter 1 ou 2 de dano, Distintivo e 1 ou 2 etiquetas de alcance. Efeitos maiores causam mais dano e ganham etiquetas.\n" +
      "- 1 de dano: ferimentos leves, como um soco forte ou um corte raso.\n" +
      "- 2 de dano: ferimentos moderados que podem matar uma pessoa comum, como uma espada ou flecha.\n" +
      "- 3 de dano: ferimentos graves que matam a maioria das pessoas comuns.\n" +
      "- 4 de dano: mata, desintegra ou destrói de imediato a maioria das pessoas comuns.",
  ),
  entry(
    "Criar personagem",
    "Passo a passo",
    "1. Escolha uma classe.\n" +
      "2. Pense nas origens: não têm mecânica, mas situam o personagem no mundo. Respondem-se nas apresentações e no jogo.\n" +
      "3. Leia o movimento inicial e tire dúvidas com o grupo.\n" +
      "4. Escolha equipamento e aparência.\n" +
      "5. Escolha os atributos: cada classe oferece duas distribuições.\n" +
      "6. Escolha nome e pronomes.\n" +
      "7. Apresente o personagem e converse sobre os personagens.\n" +
      "8. Crie relacionamentos: cada personagem tem um com cada outro, como uma crença, evento, objetivo ou sentimento. A profundidade começa em 0; some 1 se já aventuraram juntos e 1 se cresceram juntos.",
  ),
  entry(
    "Criar personagem",
    "Regras opcionais",
    "- Origens em conflito: comece com um conflito e some 1 ao nível inicial.\n" +
      "- Caminho acelerado: comece com um caminho da sua classe e some 1 ao nível inicial.\n" +
      "- Atributos versáteis: distribua você mesmo 2, 1, 1, 0 e -1.",
  ),
  entry(
    "Sessão zero",
    "Conversar antes de jogar",
    "Falem do jogo: subgêneros de fantasia, tom, duração, o que fica de fora, que ferramentas de segurança usar, que personagens cada um quer jogar. Falem do mundo: paisagem, ancestralidades, deuses, quem governa, magia, tecnologia, guerras, aventureiros. Falem dos personagens e de como o grupo se juntou. Cada pessoa tem voz, e um único \"não\" vale mais que vários \"sim\".",
  ),
  entry(
    "Sessão zero",
    "Ferramentas de segurança",
    "- Linhas e véus: linhas são limites que nunca aparecem; véus aparecem sem detalhe ou \"cortam para preto\".\n" +
      "- Classificação do roteiro: use uma classificação de filme (livre, PG-13, R) e fique na mais baixa escolhida.\n" +
      "- Porta aberta: qualquer pessoa pode sair ou pausar sem ser julgada.\n" +
      "- Cartas X, N e O: X pára e muda o conteúdo; N avisa que o grupo se aproxima de algo que pediria X; O pede que todos confirmem que querem continuar.\n" +
      "- Caixa de ferramentas do roteiro: voltar atrás (rewind), avançar (fast forward) e pausar.\n" +
      "Nesta mesa, os botões de segurança do histórico fazem esses sinais. Mais ferramentas em ttrpgsafetytoolkit.com.",
  ),
]);

export const DW2_MOVES = reference("moves", "Movimentos", [
  entry(
    "Movimentos de aventura",
    "Auxiliar um Companheiro",
    "Quando você ajuda outro personagem de jogador a cumprir uma tarefa, pode marcar uma condição para ele escolher um benefício no próximo movimento:\n" +
      "- Rolar com vantagem.\n- Ignorar a penalidade de uma condição ou do Ensanguentado.\n- Usar algo eficazmente onde normalmente não poderia.\n" +
      "Se vários personagens auxiliam ao mesmo tempo, quem é auxiliado pode escolher vários benefícios.",
  ),
  entry(
    "Movimentos de aventura",
    "Desafiar o Perigo",
    "Quando você age apesar de um perigo ou obstáculo iminente, descreva como lida com ele e role:\n" +
      "- +FOR se quebra, aguenta ou resiste fisicamente.\n- +DES se supera, esquiva, se esconde ou mira com precisão.\n" +
      "- +INT se nota, analisa, prevê ou engana.\n- +SAB se se conecta, examina ou resiste mentalmente.\n" +
      "- +CAR se engana, encanta, distrai, impressiona ou provoca.\n" +
      "Com 10 ou mais, você consegue, mas escolha uma opção. Com 7 a 9, escolha duas:\n" +
      "- Isso o desgasta ou abala: marque uma condição.\n" +
      "- Isso atrai atenção indesejada ou agrava a situação; o Mestre diz como depois que você escolher.\n" +
      "- Você gasta, paga ou sacrifica algo. Diga o quê; o Mestre pode exigir mais.\n" +
      "Com 6 ou menos, seu esforço é frustrado ou dá terrivelmente errado: marque 1 XP e o Mestre faz um movimento.",
  ),
  entry(
    "Movimentos de aventura",
    "Recordar Conhecimento",
    "Quando você vasculha a memória atrás de informação importante sobre um assunto, faça uma pergunta ao Mestre sobre ele, responda às perguntas abaixo e role com +1 por cada \"sim\".\n" +
      "- É a primeira vez que você encontra este assunto na campanha?\n" +
      "- Você viu ou aprendeu algo sobre ele antes da campanha? (Você decide.)\n" +
      "- Você tem acesso a um livro ou registro sobre o assunto?\n" +
      "- O assunto é importante para o seu Conflito?\n" +
      "Com 7 ou mais, o Mestre responde sua pergunta e outras relacionadas. Com 10 ou mais, você ganha vantagem na primeira vez que você ou um aliado agir com base na resposta. Com 6 ou menos, a resposta o põe em perigo ou revela como as coisas estão ruins: marque 1 XP e o Mestre faz um movimento.\n" +
      "Exemplo de pergunta: qual seria a melhor maneira de fazer X?",
  ),
  entry(
    "Movimentos de aventura",
    "Perceber Intenções",
    "Quando você estuda alguém numa conversa que sonda, role+SAB. Com 10 ou mais, faça duas perguntas ao jogador dele durante a conversa (ao Mestre, se for NPC). Com 7 a 9, faça uma. Podem ser sobre pensamentos, sentimentos ou motivações; o jogador responde com a verdade, mesmo que o personagem não o fizesse.\n" +
      "Com 6 ou menos, não vai bem: um NPC pode enganar você, responder com uma pergunta ou pior; marque 1 XP e o Mestre faz um movimento. Um personagem de jogador pode fazer uma pergunta a você.\n" +
      "Exemplos: está mentindo sobre X? Como eu poderia fazer você X? O que você sente sobre X? O que mais deseja?",
  ),
  entry(
    "Movimentos de aventura",
    "Esgueirar-se",
    "Quando você passa por um perigo ou obstáculo, ou se esconde dele, role+DES. Com 7 ou mais, evita ser notado. Com 10 ou mais, escolha uma opção abaixo; com 7 a 9, duas:\n" +
      "- Você correu um risco alto ou escapou por pouco: marque uma condição.\n" +
      "- Você deixa indícios ou desperta suspeita.\n" +
      "- Você cai numa posição perigosa ou comprometedora.\n" +
      "Com 6 ou menos, você fica em perigo ou encurralado: marque 1 XP e o Mestre faz um movimento.",
  ),
  entry(
    "Movimentos de aventura",
    "Influenciar Decisão",
    "Quando você convence ou manipula um NPC a fazer o que quer, escolha uma abordagem e role+CAR:\n" +
      "- Persuadir de forma aberta e honesta: ele pode pedir uma promessa ou pagamento, ou só cumprir em parte.\n" +
      "- Enganar com palavras falsas ou truques de mão: ele pode trazer uma reviravolta ou descobrir algo sobre você.\n" +
      "- Ameaçar sua segurança ou interesses: ele pode voltar atrás depois, escalar o conflito ou tentar fugir.\n" +
      "Com 7 ou mais, ele faz o que você quer. Com 7 a 9, o Mestre acrescenta uma complicação conforme a abordagem. Com 6 ou menos, ele reage mal: marque 1 XP e o Mestre faz um movimento.\n" +
      "Para convencer um personagem de jogador, pergunte como poderia conseguir; ele responde ou pede que você Perceba Intenções.",
  ),
  entry(
    "Movimentos de aventura",
    "Empreender Jornada",
    "Quando você reúne o grupo e parte numa jornada importante, faça tudo isto:\n" +
      "1. Diga o destino. Se for muito distante, obscuro ou protegido, o Mestre pode dividir a jornada em etapas, cada uma exigindo este movimento.\n" +
      "2. Escolha o líder: o personagem no comando, que costuma sofrer o grosso das consequências. Se um NPC guia vocês, escolha um personagem para intérprete ou segundo no comando, que rola os dados.\n" +
      "3. Defina a rota. Se for segura e conhecida, não role e trate como 7 a 9. Se for perigosa ou desconhecida, o líder marca uma condição ou rola com desvantagem. Sem rota, primeiro é preciso achar um mapa, contratar um guia, Recordar Conhecimento ou algo assim.\n" +
      "4. Diga o método. Com cautela, o líder rola+INT. Com pressa, rola+DES.\n" +
      "Com 7 ou mais, escolha uma opção; com 10 ou mais, vocês também encontram uma pessoa, lugar ou oportunidade importante ligada à região ou aos seus objetivos:\n" +
      "- Demora mais do que o esperado: uma Ameaça piora.\n- A viagem é penosa: todos marcam uma condição.\n- Vocês encontram algo perigoso, mas o notam primeiro.\n" +
      "Com 6 ou menos, um perigo embosca vocês no caminho, a começar pelo líder: ele marca 1 XP e o Mestre faz um movimento.",
  ),
  entry(
    "Movimentos de aventura",
    "Desvendar Segredos",
    "Quando você examina de perto uma situação tensa ou misteriosa, ou um lugar, pergunte ao Mestre: \"Há segredos a descobrir aqui?\" Se sim, role+INT. Em qualquer resultado você descobre algo, e o Mestre diz o quê (uma resposta, porta, caminho, tesouro, amigo, inimigo, covil...).\n" +
      "Com 10 ou mais, a descoberta é clara e significativa. Com 7 a 9, escolha uma:\n" +
      "- Ela, ou o processo de achá-la, faz você marcar uma condição.\n" +
      "- É pista de algo maior, mas sem importância sozinha: ganhe vantagem na primeira rolagem em que agir com base nela.\n" +
      "- Ela o põe em risco imediato; o Mestre diz como.\n" +
      "Com 6 ou menos, a descoberta é extremamente perigosa e talvez você preferisse não a ter achado: marque 1 XP e o Mestre faz um movimento.\n" +
      "Se houver obstáculos ou perigos, talvez seja preciso superá-los antes.",
  ),
  entry(
    "Movimentos de personagem",
    "Confortar ou Apoiar",
    "Depois que você conforta ou apoia um companheiro, responda e role com +1 por cada \"sim\":\n" +
      "- Você mudou ou reforçou um Relacionamento ou Vínculo?\n" +
      "- Você perguntou ou respondeu algo novo sobre um Conflito?\n" +
      "- Ele se abriu sobre uma condição que sente?\n" +
      "- Vocês estão Montando Acampamento agora?\n" +
      "Em qualquer resultado ele limpa uma condição. Com 10 ou mais, limpa outra ou ganha 1 de profundidade com você, à escolha dele. Com 6 ou menos, você marca uma condição ou perde 1 de profundidade com ele, à sua escolha.",
  ),
  entry(
    "Movimentos de personagem",
    "Chegar ao Limite",
    "Quando você marca sua última condição, depois de resolvidos os movimentos ligados a isso, escolha uma opção e limpe até duas condições no fim da cena. Sem um Conflito, só pode escolher a última.\n" +
      "- Confesse uma verdade terrível sobre seu Conflito, falando como personagem ou não. O Mestre cria uma reviravolta, perigo ou obstáculo a partir da confissão, agora ou quando for a hora.\n" +
      "- Teste sua determinação. Role+nada. Você pode apagar até 3 de profundidade entre seus Relacionamentos, ganhando +1 na rolagem por cada uma. Com 10 ou mais, supera seus limites: ignora as penalidades das condições na cena e ganha uma oportunidade descrita pelo Mestre. Com 7 a 9, guarda tudo dentro por ora, trancando uma condição. Com 6 ou menos, desiste, foge ou piora muito as coisas, agora ou quando os companheiros precisarem de você.\n" +
      "Condições trancadas só saem com efeitos que o digam, como Aproveitar o Descanso.",
  ),
  entry(
    "Movimentos de personagem",
    "Encarar a Morte",
    "Quando você chega a 0 PV, escolha uma:\n" +
      "- Chama de glória. Você assume por um instante o controle da cena e descreve uma última façanha. Depois morre.\n" +
      "- Quebrado e derrotado. Escolha uma condição que você tem (se não tiver nenhuma, pode marcar uma agora). Ela fica trancada.\n" +
      "- Apostar com a morte. Role+nada. Outros personagens podem Auxiliar, mas isso toma toda a atenção e esforço deles por um tempo. Com 10 ou mais, você vive, por ora. Com 7 a 9, o Mestre diz que parte de você não sobrevive: aceite a perda e viva, ou agarre-se a ela e morra. Com 6 ou menos, você morrerá antes do fim da cena: o que vê ao partir, e quais suas últimas palavras?\n" +
      "Se sobreviver, você continua com 0 PV: não age de forma significativa sem Auxílio, embora possa Auxiliar, e mais dano mata de vez.",
  ),
  entry(
    "Movimentos de personagem",
    "Montar Acampamento",
    "Quando vocês relaxam juntos durante a aventura, descrevam cooperativamente o que cada personagem faz nessa cena longa. Falem de situações, eventos ou emoções. Nem toda conversa é em grupo: dá para ir sozinho ou chamar alguém para um a um. Outros movimentos podem acontecer, como Confortar ou Apoiar e Perceber Intenções.\n" +
      "As Ameaças do mundo pioram a cada vez que vocês acampam, às vezes de forma óbvia, às vezes sutil. Ameaças urgentes podem interromper o acampamento. Em lugar selvagem ou perigoso, o Mestre pode perguntar quem Vigia. Se o descanso for interrompido, é preciso retomá-lo e terminá-lo para curar.\n" +
      "Ao terminar de relaxar, cada personagem recupera PV iguais à metade do máximo.",
  ),
  entry(
    "Movimentos de personagem",
    "Vigiar",
    "Quando vocês Montam Acampamento em lugar selvagem, perigoso ou vulnerável, a qualquer momento o Mestre pode dizer: \"Algo se aproxima, quem está de vigia?\" Digam quem; o Mestre descreve o que vê e o voluntário rola+INT. Vários voluntários podem se Auxiliar. Com 10 ou mais, escolha duas opções; com 7 a 9, uma:\n" +
      "- Alertar os outros. Marque uma condição para que todos estejam prontos quando chegar.\n" +
      "- Confrontar. Pegue a coisa de surpresa num lugar próximo à sua escolha.\n" +
      "- Observar com cuidado. Faça ao Mestre duas perguntas sobre o que vem aí, antes que chegue.\n" +
      "Com 6 ou menos, a coisa pega vocês de surpresa, amigável ou não. O Mestre faz um movimento e você marca 1 XP.",
  ),
  entry(
    "Movimentos de personagem",
    "Aproveitar o Descanso",
    "Quando você passa dias descansando numa vila segura, pode fazer quantas das opções quiser:\n" +
      "- Relaxar. Gaste 1 de tesouro e Monte Acampamento, mas cure tudo.\n" +
      "- Festejar. Para cada personagem envolvido, gaste 1 de tesouro e então limpe uma condição trancada ou ganhe 1 de profundidade com outro envolvido.\n" +
      "- Adquirir. Gaste tesouro para consertar equipamento, comprar itens e contratar serviços (veja os custos).\n" +
      "- Reabastecer. Escolha itens, gaste o mesmo tanto de tesouro e renove todos os usos desses itens.\n" +
      "- Treinar. Gaste tesouro e cada personagem marca 1 XP para cada 1 gasto.",
  ),
  entry(
    "Movimentos de personagem",
    "Forjar um Vínculo",
    "Quando você marca a 3ª profundidade num Relacionamento, converse com o jogador do personagem ligado, escolham uma opção juntos, reescreva seus Detalhes com ele se quiser e apague toda a sua profundidade com ele (não mude os Detalhes nem a profundidade dele com você):\n" +
      "- Escolham um novo Vínculo compartilhado e ganhem seu movimento inicial. Se compartilhavam um antigo, apaguem-no; cada um ganha 1 XP por movimento avançado que ele tinha.\n" +
      "- Reforcem um Vínculo existente, escolhendo um movimento avançado dele; ambos ganham acesso.\n" +
      "- Façam uma pergunta um ao outro sobre pensamentos, sentimentos ou motivações, como se tivessem tirado 7 a 9 em Perceber Intenções. Depois cada um marca 1 XP.\n" +
      "Cada um registra Relacionamentos e profundidade por conta própria, mas os Vínculos são compartilhados por dois.",
  ),
  entry(
    "Movimentos de personagem",
    "Subir de Nível",
    "Quando você marca seu 5º XP, zere a experiência, aumente seu nível em 1 e ganhe um avanço da sua classe.",
  ),
  entry(
    "Movimentos de personagem",
    "Encerrar a Sessão",
    "Quando a sessão termina, responda:\n" +
      "- Você correu um grande risco ou mostrou suas capacidades de um jeito novo? Marque 1 XP.\n" +
      "- Você aprendeu ou mostrou algo novo sobre seu Conflito? Marque 1 XP.\n" +
      "- Você teve uma nova disputa ou ligação com um companheiro? Seu Relacionamento com ele ganha 1 de profundidade. Pode reescrever os Detalhes para refletir a mudança; se o fizer, marque 1 XP.",
  ),
  entry(
    "Movimentos de personagem",
    "Extravasar Emoções (opcional)",
    "Quando você age de forma decisiva sobre as emoções de uma condição marcada, de um jeito listado abaixo, limpe essa condição:\n" +
      "- Exausto: desabe ou desista quando importa.\n- Assustado: esconda-se ou fuja do perigo.\n" +
      "- Irritado: parta para cima dos aliados ou quebre algo.\n- Distraído: afaste-se sozinho ou perca algo óbvio.\n" +
      "- Inseguro: compense demais ou critique alguém.\n" +
      "A lista não é rígida, mas a ação deve trazer risco, dano ou complicação.",
  ),
  entry(
    "Movimentos de batalha",
    "Tomar o Controle",
    "Quando você tenta tirar algo de um inimigo (um objeto, posição, autoridade...), diga o que é e como se aproxima. Se a abordagem for protegida, esperada ou inviável, o Mestre pode exigir antes Desafiar o Perigo ou achar uma oportunidade.\n" +
      "- Se supera no pensamento ou na manobra, role+INT, mas ele pode tirar algo de você também.\n" +
      "- Se domina pela força, role+FOR (ou +DES com arma Precisa), mas ele pode ferir você.\n" +
      "Com 7 ou mais, você toma e escolhe uma opção, mas ele revida conforme sua abordagem. Com 10 ou mais, faça uma escolha extra ou evite o revide.\n" +
      "- Ele não tenta retomar tão cedo.\n- Você se sente melhor por tomar: limpe uma condição.\n- Se dominou pela força, cause seu dano a ele.\n" +
      "Com 6 ou menos, você não toma e ele revida: marque 1 XP e o Mestre faz um movimento.",
  ),
  entry(
    "Movimentos de batalha",
    "Manter Ocupado",
    "Quando você ocupa um inimigo ou o segura, diga como. Se o inimigo é importante para o seu Conflito, em vez de rolar você pode marcar uma condição para tratar como 10 ou mais.\n" +
      "- De frente, em batalha: role+FOR, mas ele pode ferir você.\n" +
      "- Assediando de longe ou das sombras: role+DES, mas ele pode prender ou enganar você.\n" +
      "- Provocando com barulho ou palavras ferinas: role+CAR, mas ele pode agravar a situação.\n" +
      "Com 7 ou mais, escolha uma, mas ele revida conforme sua abordagem. Com 10 ou mais, faça uma escolha extra ou evite o revide.\n" +
      "- Impeça-o, anulando uma vantagem, oportunidade, resistência ou algo que ele ia fazer.\n" +
      "- Distraia, impressione, exaure ou assuste, e ele age de acordo.\n" +
      "- Enfraqueça-o: da próxima vez que ele causar dano depois deste movimento, reduza em 2.\n" +
      "Com 6 ou menos, ele domina ou supera você na manobra: marque 1 XP e o Mestre faz um movimento.",
  ),
  entry(
    "Movimentos de batalha",
    "Obter Vantagem Tática",
    "Quando você observa o campo de batalha ou busca uma vantagem, como um ponto fraco escondido ou um objeto útil, diga como.\n" +
      "- Se vasculha a memória ou examina o ambiente, role+INT.\n" +
      "- Se observa as ações do inimigo ou sonda suas emoções, role+SAB.\n" +
      "- Se já sabe de algo de antes da batalha, diga agora e trate como 10 ou mais.\n" +
      "Com 7 ou mais, escolha uma opção. Com 7 a 9, depois de escolher, o Mestre diz como a vantagem é temporária ou complicada.\n" +
      "- Você acha uma falha nas proteções, no comportamento ou nas técnicas do inimigo, que você ou um aliado pode explorar num Ataque Total.\n" +
      "- Você acha algo útil no ambiente e pode usá-lo para Auxiliar um Companheiro sem marcar condição.\n" +
      "- Você recupera o fôlego, um respiro na luta, e limpa uma condição.\n" +
      "Com 6 ou menos, seu esforço é inútil e o expõe ao revide do inimigo. Marque 1 XP.",
  ),
  entry(
    "Movimentos de batalha",
    "Ataque Total",
    "Quando você usa uma vantagem ou ponto fraco para golpear um inimigo, role+FOR (ou +DES com arma Precisa) e troquem dano. Com 7 ou mais, escolha uma opção. Com 10 ou mais, escolha duas:\n" +
      "- Machuque de verdade: cause 2 de dano a mais.\n" +
      "- Imobilize: desabilite por um tempo um ataque, técnica ou traço que você sabe que ele tem.\n" +
      "- Desabafe: limpe uma condição.\n" +
      "Com 6 ou menos, marque 1 XP, o inimigo causa 2 de dano a mais em você e o Mestre faz um movimento.\n" +
      "Obter Vantagem Tática não é a única forma de preparar um Ataque Total, mas é a mais confiável.",
  ),
  entry(
    "Movimentos de batalha",
    "Como funciona a luta",
    "Lutar funciona como o resto do jogo, só que mais rápido e com mais em jogo. Não há ordem de iniciativa nem economia de ações: o Mestre descreve a situação, pergunta o que fazem e entrega as consequências.\n" +
      "Trocar dano significa que você e o inimigo causam dano um ao outro ao mesmo tempo. Seu dano vem da arma, em geral 1 a 3, modificado por movimentos e equipamento. Um lacaio simples causa 1; um grupo de lacaios ou monstro solitário, 3 ou 4; um dragão ancião ou horror que quebra o mundo, 6 ou 7. Você pode gastar usos de armadura, escudo ou de alguns movimentos para reduzir o dano que recebe.\n" +
      "Atacar quem não pode reagir derrota-o com facilidade. Se ele puder reagir o bastante para ser uma batalha, mesmo por pouco, provavelmente aciona um movimento de batalha. Se não está claro, o Mestre pode pedir Desafiar o Perigo, ou causar seu dano uma vez antes de começar, ou começar com uma vantagem pronta. Se você não pode feri-lo (está paralisado, ele é incorpóreo), nenhum movimento de batalha acontece e o Mestre faz um movimento.\n" +
      "Durante a batalha você ainda usa outros movimentos: descreva o que faz para acioná-los.",
  ),
]);
