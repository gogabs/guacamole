import type { Compendium, ReferenceEntry, ReferenceItem } from "./types.ts";

/**
 * Resumos de referência do Fate, escritos para este app (não são o texto dos livros). As regras
 * seguem o Fate Core, o Fate Acelerado e o Fate Condensado, da Evil Hat Productions.
 */

const ATTRIBUTION =
  "Fate Core System, Fate Acelerado e Fate Condensado, da Evil Hat Productions, licenciados sob " +
  "Creative Commons (CC BY). Resumo em português feito para este app; material de fã, não oficial.";

function entry(
  group: string,
  title: string,
  text: string,
  summary?: string,
): Omit<ReferenceEntry, "id"> {
  return { group, title, text, summary };
}

function reference(
  id: string,
  name: string,
  entries: Omit<ReferenceEntry, "id">[],
): ReferenceItem {
  return {
    id,
    name,
    kind: "reference",
    entries: entries.map((e, i) => ({ id: `${id}-${i + 1}`, ...e })),
  };
}

const LADDER = reference("ladder", "Escada", [
  entry("Escada", "+8 Lendário", "Nível +8 da escada de adjetivos."),
  entry("Escada", "+7 Épico", "Nível +7 da escada de adjetivos."),
  entry("Escada", "+6 Fantástico", "Nível +6 da escada de adjetivos."),
  entry("Escada", "+5 Excepcional", "Nível +5 da escada de adjetivos."),
  entry("Escada", "+4 Ótimo", "Nível +4 da escada de adjetivos."),
  entry("Escada", "+3 Bom", "Nível +3 da escada de adjetivos."),
  entry("Escada", "+2 Razoável", "Nível +2 da escada de adjetivos."),
  entry("Escada", "+1 Médio", "Nível +1 da escada de adjetivos."),
  entry("Escada", "+0 Medíocre", "Nível 0 da escada de adjetivos."),
  entry("Escada", "-1 Ruim", "Nível -1 da escada de adjetivos."),
  entry("Escada", "-2 Terrível", "Nível -2 da escada de adjetivos."),
  entry(
    "Como usar",
    "A rolagem",
    "Role quatro dados Fate (4dF): cada dado dá -1, 0 ou +1, e o total vai de -4 a +4.\n" +
      "Some o total à perícia ou abordagem e compare com a dificuldade ou com a rolagem de quem se opõe.\n" +
      "A diferença é o resultado, medido em graus (shifts).",
    "Total de 4dF somado à perícia ou abordagem, contra uma dificuldade.",
  ),
  entry(
    "Como usar",
    "Dificuldades comuns",
    "- Medíocre (+0): tarefa fácil, sem oposição.\n" +
      "- Razoável (+2) a Bom (+3): desafio comum para gente competente.\n" +
      "- Ótimo (+4) a Fantástico (+6): difícil, só para especialistas.\n" +
      "- Acima disso: feitos quase impossíveis.",
  ),
]);

const ACTIONS = reference("actions", "Ações e resultados", [
  entry(
    "Resultados",
    "Os quatro resultados",
    "- Falha: o total ficou abaixo do alvo.\n" +
      "- Empate: o total é igual ao alvo.\n" +
      "- Sucesso: o total passou do alvo em 1 ou 2.\n" +
      "- Sucesso com estilo: o total passou do alvo em 3 ou mais.",
    "Falha, empate, sucesso e sucesso com estilo.",
  ),
  entry(
    "Ações",
    "Superar",
    "Vencer um obstáculo, uma tarefa ou um perigo que está no caminho.\n" +
      "- Falha: você não consegue, ou consegue com um custo grave.\n" +
      "- Empate: você consegue, mas com um custo menor.\n" +
      "- Sucesso: você consegue.\n" +
      "- Sucesso com estilo: você consegue e ganha um impulso.",
    "Vencer um obstáculo, tarefa ou perigo.",
  ),
  entry(
    "Ações",
    "Criar vantagem",
    "Criar um aspecto novo na cena, ou descobrir e aproveitar um aspecto que já existe.\n" +
      "- Falha: você não cria nada, ou cria um aspecto que ajuda o outro lado.\n" +
      "- Empate: você ganha um impulso, um aspecto que some depois do primeiro uso.\n" +
      "- Sucesso: o aspecto fica na cena com uma invocação grátis.\n" +
      "- Sucesso com estilo: o aspecto fica com duas invocações grátis.",
    "Criar ou descobrir um aspecto que ajude depois.",
  ),
  entry(
    "Ações",
    "Atacar",
    "Ferir alguém, no corpo ou na mente. O alvo se defende.\n" +
      "- Falha: nada acontece.\n" +
      "- Empate: você ganha um impulso.\n" +
      "- Sucesso: você causa dano igual à diferença.\n" +
      "- Sucesso com estilo: como o sucesso, e pode reduzir o dano em 1 para ganhar um impulso.",
    "Ferir alguém, no corpo ou na mente.",
  ),
  entry(
    "Ações",
    "Defender",
    "Resistir a um ataque, impedir que alguém crie vantagem contra você ou barrar uma tentativa de superar.\n" +
      "- Falha: o outro lado tem o resultado dele, sem sua interferência.\n" +
      "- Empate: o outro lado ainda age, mas você pode ganhar um impulso se defendeu um aliado.\n" +
      "- Sucesso: você evita o efeito.\n" +
      "- Sucesso com estilo: você evita o efeito e ganha um impulso.",
    "Resistir a um ataque ou a uma tentativa do outro lado.",
  ),
  entry(
    "Ações",
    "Trabalho em equipe",
    "Quem ajuda abre mão da própria ação e dá +1 ao colega para cada ajudante, desde que a perícia ou abordagem sirva.\n" +
      "Em geral há um limite de ajudantes pela situação.",
  ),
]);

const ASPECTS = reference("aspects", "Aspectos e pontos de destino", [
  entry(
    "Aspectos",
    "O que é um aspecto",
    "Uma frase que descreve algo importante: uma pessoa, um lugar, uma coisa, uma situação.\n" +
      "Tipos: de personagem (conceito, dificuldade e outros), de cena, de situação e consequências.\n" +
      "Aspectos são verdadeiros na história: o que dizem vale na ficção.",
    "Frases que dizem o que é importante e verdadeiro na história.",
  ),
  entry(
    "Aspectos",
    "Invocar um aspecto",
    "Gaste um ponto de destino, ou uma invocação grátis, para usar um aspecto a seu favor depois de rolar.\n" +
      "- Some +2 ao total, ou\n" +
      "- Role todos os dados de novo.\n" +
      "Um aspecto só pode ser invocado uma vez por rolagem.",
    "Gasta um ponto de destino para +2 ou para rolar de novo.",
  ),
  entry(
    "Aspectos",
    "Forçar um aspecto",
    "Alguém propõe que um aspecto complica a situação do personagem, e oferece um ponto de destino.\n" +
      "- Aceitar: o personagem sofre a complicação e ganha o ponto de destino.\n" +
      "- Recusar: o personagem paga um ponto de destino do próprio bolso.\n" +
      "O anfitrião pode forçar qualquer aspecto; os jogadores também podem propor.",
    "A complicação rende um ponto de destino a quem aceita.",
  ),
  entry(
    "Pontos de destino",
    "Pontos de destino e recarga",
    "No começo da sessão, cada personagem fica com pontos de destino iguais à sua recarga, ou mantém os que já tem, se forem mais.\n" +
      "Ganha-se pontos aceitando forçar de aspectos, e gasta-se invocando aspectos ou recusando um forçar.",
  ),
  entry(
    "Pontos de destino",
    "Impulso",
    "Um aspecto frágil: ganha-se por empates e sucessos com estilo.\n" +
      "Tem uma invocação grátis para quem o criou ou quem ele indicar, e some depois de usado ou quando a cena muda.",
  ),
]);

const STRESS = reference("harm", "Estresse e consequências", [
  entry(
    "Dano",
    "Estresse",
    "Quando recebe dano, o personagem marca uma caixa de estresse com valor igual ou maior que o dano.\n" +
      "As caixas de estresse se esvaziam ao fim da cena. Há uma trilha física e uma mental.",
    "Marque uma caixa de valor igual ou maior que o dano.",
  ),
  entry(
    "Dano",
    "Consequências",
    "Uma consequência absorve dano que o estresse não cobre. Vira um aspecto, que o outro lado pode invocar.\n" +
      "- Suave: absorve 2. Some depois de uma cena de descanso ou de recuperação.\n" +
      "- Moderada: absorve 4. Leva algumas sessões ou um marco importante para sumir.\n" +
      "- Grave: absorve 6. Leva um marco significativo para sumir.\n" +
      "Cada espaço de consequência só abriga uma por vez.",
    "Absorve dano: suave 2, moderada 4, grave 6.",
  ),
  entry(
    "Dano",
    "Ser tirado de ação",
    "Se não consegue absorver o dano, o personagem é tirado da cena, e quem o derrotou decide o que acontece.\n" +
      "Quem está perdendo pode conceder antes da rolagem do adversário: sai da cena à própria maneira e ganha pontos de destino.",
  ),
]);

const CONFLICT = reference("conflict", "Conflitos e desafios", [
  entry(
    "Conflito",
    "Como funciona um conflito",
    "1. Monte a cena: quem está aqui, onde, e os aspectos da cena.\n" +
      "2. Determine a ordem dos turnos.\n" +
      "3. Cada um age no seu turno; o turno acaba quando todos agiram.\n" +
      "4. Repita até o conflito acabar.",
    "Cena, ordem, turnos, repetir.",
  ),
  entry(
    "Conflito",
    "Seu turno",
    "Você faz uma ação (superar, criar vantagem ou atacar) e pode se mover para uma zona próxima.\n" +
      "Defender não gasta o seu turno: é uma reação.",
  ),
  entry(
    "Conflito",
    "Zonas",
    "A cena é dividida em zonas, sem medidas exatas. Dá para agir na própria zona e, às vezes, numa vizinha.\n" +
      "Mover-se dentro da zona é livre, mas atravessar uma barreira pode exigir superar.",
  ),
  entry(
    "Outras cenas",
    "Desafios e disputas",
    "- Desafio: uma série de ações de superar e criar vantagem para um objetivo; cada etapa tem a sua rolagem.\n" +
      "- Disputa: dois lados competem por vitórias; o primeiro a acumular três vitórias ganha.",
  ),
]);

const STUNTS = reference("stunts", "Façanhas", [
  entry(
    "Façanhas",
    "O que é uma façanha",
    "Uma façanha dá ao personagem um jeito especial de usar uma perícia ou abordagem.\n" +
      "Dois modelos comuns:\n" +
      "- Bônus de +2 numa ação específica, numa situação específica.\n" +
      "- Uma regra nova ou uma exceção, como fazer algo que outros não fazem.",
    "Um jeito especial de usar uma perícia ou abordagem.",
  ),
  entry(
    "Façanhas",
    "Quantas pegar",
    "Todo personagem começa com três façanhas grátis. Cada façanha além dessas custa 1 de recarga, e a recarga nunca cai abaixo de 1.",
  ),
]);

const SKILL_NOTES: Array<[string, string, string]> = [
  ["Atletismo", "Correr, saltar, escalar, nadar, desviar de ataques físicos.", "Superar obstáculos físicos; defender contra ataques corpo a corpo."],
  ["Roubo", "Arrombar, furtar, driblar segurança.", "Superar fechaduras e alarmes; criar vantagem ao examinar um local."],
  ["Contatos", "Conhecer gente, juntar rumores, achar quem sabe.", "Criar vantagem com informação; defender contra tentativas de te encontrar."],
  ["Ofícios", "Construir, consertar, improvisar equipamento.", "Criar vantagem com engenhocas; superar obstáculos mecânicos."],
  ["Enganar", "Mentir, disfarçar, enganar.", "Criar vantagem com blefes; superar guardas; defender contra Empatia."],
  ["Condução", "Dirigir veículos e cavalgar.", "Superar obstáculos na estrada; criar vantagem numa perseguição."],
  ["Empatia", "Ler pessoas, perceber intenções e humores.", "Criar vantagem sobre emoções; defender contra Enganar."],
  ["Lutar", "Combate corpo a corpo.", "Atacar de perto; defender contra ataques corpo a corpo."],
  ["Investigar", "Examinar uma cena, buscar pistas, deduzir.", "Criar vantagem ao procurar com calma; superar mistérios."],
  ["Saber", "Conhecimento e cultura geral.", "Criar vantagem com fatos; superar obstáculos de conhecimento."],
  ["Percepção", "Notar o que está acontecendo, reagir rápido.", "Defender contra emboscadas; define a iniciativa física."],
  ["Vigor", "Resistência física e força.", "Defender contra ataques físicos; fornece caixas de estresse físico extras."],
  ["Provocar", "Intimidar, enfurecer, assustar.", "Atacar a mente; criar vantagem pela emoção."],
  ["Relacionamento", "Simpatia, persuasão, carisma.", "Criar vantagem com gente simpática; superar com conversa."],
  ["Recursos", "Riqueza e acesso a bens.", "Superar problemas com dinheiro; criar vantagem pelo patrimônio."],
  ["Atirar", "Armas à distância.", "Atacar de longe; criar vantagem pela mira."],
  ["Furtividade", "Agir sem ser visto nem ouvido.", "Superar guardas; criar vantagem escondendo-se."],
  ["Vontade", "Força mental e determinação.", "Defender contra ataques mentais; fornece caixas de estresse mental extras."],
];

const SKILLS_CORE = reference("skills", "Perícias", [
  entry(
    "Perícias",
    "Conhecimento",
    "Estudo formal e saber acadêmico.\nSuperar problemas de conhecimento; criar vantagem com fatos.",
    "Estudo formal e saber acadêmico.",
  ),
  ...SKILL_NOTES.map(([name, what, use]) => entry("Perícias", name, `${what}\n${use}`, what)),
]);

const SKILLS_CONDENSED = reference("skills", "Perícias", SKILL_NOTES.map(([name, what, use]) =>
  entry("Perícias", name, `${what}\n${use}`, what)
));

const APPROACHES = reference("approaches", "Abordagens", [
  entry(
    "Abordagens",
    "Cuidadoso",
    "Agir com atenção e cuidado, sem pressa.\nBom para ações que precisam de precisão e para defender com cautela.",
    "Agir com atenção e cuidado.",
  ),
  entry(
    "Abordagens",
    "Inteligente",
    "Pensar, resolver problemas, ter uma ideia.\nBom para descobrir ou entender algo e criar vantagem com esperteza.",
    "Pensar e resolver problemas.",
  ),
  entry(
    "Abordagens",
    "Estiloso",
    "Chamar atenção, agir com graça e presença.\nBom para impressionar, enganar com carisma e fazer um número.",
    "Agir com graça e chamar atenção.",
  ),
  entry(
    "Abordagens",
    "Poderoso",
    "Usar força, sem sutileza.\nBom para atacar de frente, quebrar o que atrapalha e intimidar.",
    "Usar força, sem sutileza.",
  ),
  entry(
    "Abordagens",
    "Rápido",
    "Agir com velocidade e reflexo.\nBom para reagir primeiro, desviar e escapar.",
    "Agir com velocidade e reflexo.",
  ),
  entry(
    "Abordagens",
    "Sorrateiro",
    "Agir com discrição, enganando ou escondendo.\nBom para não ser visto, mentir e criar distrações.",
    "Agir com discrição e engano.",
  ),
  entry(
    "Como escolher",
    "A abordagem vem da descrição",
    "O jogador descreve como age, e isso decide a abordagem, não a ação.\n" +
      "Atacar com um golpe feroz é Poderoso; atacar com um truque é Sorrateiro ou Inteligente.",
  ),
]);

export const FATE_CORE_COMPENDIUM: Compendium = {
  id: "fate-core",
  name: "Fate",
  system: "fate",
  description: "Regras do Fate Core: escada, ações, aspectos, estresse, conflitos, perícias e façanhas.",
  attribution: ATTRIBUTION,
  items: [LADDER, ACTIONS, ASPECTS, STRESS, CONFLICT, SKILLS_CORE, STUNTS],
};

export const FATE_ACCELERATED_COMPENDIUM: Compendium = {
  id: "fate-accelerated",
  name: "Fate Acelerado",
  system: "fate",
  description: "Regras do Fate Acelerado: escada, ações, aspectos, estresse, conflitos, abordagens e façanhas.",
  attribution: ATTRIBUTION,
  items: [LADDER, ACTIONS, ASPECTS, STRESS, CONFLICT, APPROACHES, STUNTS],
};

export const FATE_CONDENSED_COMPENDIUM: Compendium = {
  id: "fate-condensed",
  name: "Fate Condensado",
  system: "fate",
  description: "Regras do Fate Condensado: escada, ações, aspectos, estresse, conflitos, perícias e façanhas.",
  attribution: ATTRIBUTION,
  items: [LADDER, ACTIONS, ASPECTS, STRESS, CONFLICT, SKILLS_CONDENSED, STUNTS],
};
