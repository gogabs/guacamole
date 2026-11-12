# A validar à mão

Coisas que os testes automáticos não cobrem (som, leitor de tela, diálogos do sistema).
Marque ao validar e apague o que já foi confirmado.

## Cena (fase 1)
- [ ] Seletor de arquivos nativo ao escolher imagem de fundo e imagem de card.
- [ ] O desenho acima da lista mostra o fundo, as zonas coloridas e os tokens.
- [ ] Editor de células da zona: setas, Espaço e a fala de cada célula ("Coluna 3, linha 2, livre").
- [ ] Lista em seções: "Cards soltos", cada zona com seus cards; o cursor acompanha o card ao pôr numa zona (P).
- [ ] Trocar de cena fala o nome e a descrição para todos.
- [ ] Relógio: Esquerda e Direita giram e a fala diz "3 de 6".

## Áudio (fase 2)
- [ ] Ambiência numa zona soa de lado e muda de volume conforme "Minha posição".
- [ ] Música: tocar outra troca a que estava tocando.
- [ ] Soundboard: teclas 1 a 9 disparam, Shift mais número atribui a tecla.
- [ ] Quem entra no meio da cena ouve o som no ponto certo (relógio do servidor).
- [ ] Trocar de cena silencia os sons da cena anterior.
- [ ] Seletor de arquivos nativo para OGG, MP3 e WAV; arquivos grandes são recusados com a mensagem certa.

## Novos tipos de card
- [ ] Contador: Direita e Esquerda mudam, Shift de cinco em cinco, Enter pede o valor; a fala diz "3, de 0 a 5".
- [ ] Temporizador: Enter inicia e pausa, R zera; a lista atualiza a cada meio segundo sem falar sozinha.
- [ ] Fim do temporizador: todos ouvem "Tempo esgotado" ao mesmo tempo (relógio do servidor).
- [ ] Cronômetro e a fala do tempo em minutos e segundos ("1 minuto e 30 segundos").
- [ ] Tabela aleatória: Enter sorteia, o resultado vai para o histórico e fica no card; E edita as entradas.
- [ ] E edita a definição de cada tipo (mínimo e máximo do contador, duração do temporizador).

## Turnos, votação e lista
- [ ] Ordem de turnos manual: Shift mais cima ou baixo muda a ordem, Enter em "Passar o turno" avança e a fala anuncia "Turno de X".
- [ ] Iniciativa: Enter dá o valor, R rola os dados do participante, a ordem reorganiza sozinha.
- [ ] Pipoca: quem está na vez escolhe o próximo com Enter; ao todos jogarem a rodada recomeça ("Todos jogaram. Rodada 2.").
- [ ] Votação: o voto dos outros não aparece enquanto está aberta; o resultado sai no histórico ao encerrar.
- [ ] Lista de verificação: Enter marca e desmarca, E edita, Delete remove.
- [ ] Control Cima e Baixo na região Cena saltam entre os cards soltos e cada zona.
- [ ] Enter num card de texto abre a leitura linha a linha; E edita; Escape volta.

## Campos de edição
- [ ] Todo campo aceita digitação assim que abre, inclusive o segundo de uma sequência (título e depois texto, colunas e depois linhas).
- [ ] Tab, Shift+Tab e setas não tiram o foco de dentro de um campo (cena, fichas, áudio, menu inicial, chat).
- [ ] Campos de número só aceitam dígitos (e um menos onde o valor pode ser negativo); a duração aceita dois pontos.
- [ ] O campo de chat devolve o foco para a região de onde saiu, ao enviar e ao cancelar.

## Chat de voz
- [ ] Região Áudio: "Voz: desligado"; Enter alterna entre desligado, push-to-talk e microfone aberto (o Windows pode pedir permissão ao microfone).
- [ ] Push-to-talk: segurar F4 fala e soltar para; o clique de início e fim é ouvido.
- [ ] Microfone aberto só transmite quando você fala (sem chiado entre as falas).
- [ ] Supressão de ruído (ligada por padrão): ventilador, teclado e música de fundo somem sem "engolir" a voz; comparar com ela desligada.
- [ ] Escolher microfone e saída das vozes pela lista de dispositivos; a escolha fica salva.
- [ ] A voz de quem está sentado numa zona sai daquele lado: mudar "Minha posição" de um e ouvir o outro mudar de lado e de volume.
- [ ] "Falando agora" lista quem fala; "Avisar quem começa a falar" fala o nome sem atropelar a navegação.
- [ ] Atraso aceitável e sem cortes com 3 ou 4 pessoas, pela internet (Radmin) e na rede local.
- [ ] O pacote do cliente leva a DLL de voz e funciona em outro computador (sem instalar nada).

## Pacote do cliente
- [ ] `dist/Guacamole-cliente-windows.zip` abre em outro computador, fala pelo leitor de tela e conecta ao servidor.
- [ ] O pacote foi gerado com o modelo de exportação 4.7.1 e o editor 4.7.2; se algo estranho aparecer, reexportar com o modelo 4.7.2.

## Geral
- [ ] A fala de navegação não fica enfileirada (fila com intervalo mínimo no `speech.gd`).
- [ ] Textos em português do Dungeon World 2 e dos compêndios, lidos por quem conhece o jogo.
