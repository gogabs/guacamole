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

## Sons em pontos exatos da zona
- [ ] Áudio, anfitrião: um som numa zona (P) e G entram no modo de posicionar; a fala explica as teclas e diz "Coluna, linha, à sua esquerda/direita, mais acima/abaixo".
- [ ] As setas movem o som um quarto de quadrado (Shift, um inteiro) e ele muda de lado e de volume na hora, para você e para os outros.
- [ ] Limite da zona: o som para e a fala avisa; Home volta ao centro; Enter guarda; Escape devolve ao ponto anterior.
- [ ] Vários sons na mesma zona em pontos diferentes formam uma cena sonora coerente (mato à esquerda, riacho à direita, fogueira ao fundo).
- [ ] Encolher a zona tira o ponto que ficou de fora; a cena salva e a mesa salva guardam os pontos.
- [ ] O token do card aparece no desenho no ponto exato.

## Salvar e carregar cena
- [ ] Na lista de cenas (anfitrião): "Salvar a cena ativa em arquivo" abre o diálogo de salvar e cria um `.guacascene`.
- [ ] "Carregar cena de arquivo" abre o diálogo, a cena entra como ativa, com fundo, zonas, cards e sons, e todos veem.
- [ ] Os sons voltam parados; o fim de um temporizador que estava rodando não dispara sozinho.
- [ ] Carregar a mesma cena duas vezes cria duas cenas; um arquivo qualquer é recusado com mensagem.
- [ ] Carregar uma cena com imagens e sons grandes: o tempo de envio e a fala de progresso são aceitáveis.
- [ ] Jogadores que não são anfitriões não veem as duas linhas.

## Atualizador
- [ ] Com uma release mais nova que a versão do programa, o menu inicial mostra "Atualizar para a versão X" no topo e a fala avisa.
- [ ] Enter baixa (o progresso é falado de 20 em 20%), confere o hash, fecha o programa e ele reabre já na versão nova.
- [ ] Os arquivos antigos foram trocados e as configurações (nome, mesas, vozes) continuaram.
- [ ] Sem internet ou sem release nova, o menu fica como sempre, sem erro.
- [ ] Rodando pelo editor, nada é oferecido.

## Mesa pronta
- [ ] Menu inicial: depois de jogar uma vez, o primeiro item é "Continuar a última mesa, nome e código"; Enter entra direto (como anfitrião, se for a sua).
- [ ] F3 na mesa copia o convite com o endereço (rede local, Radmin) e o código; colar no WhatsApp e conferir o texto.
- [ ] Cena, "Salvar a mesa inteira em arquivo": pergunta pelo histórico e grava `.guacamesa` pelo diálogo nativo.
- [ ] Menu inicial, "Criar mesa a partir de um arquivo": a mesa volta com cenas, fichas (as do antigo anfitrião passam para você), compêndios e mídia, com outro código.
- [ ] Os sons da mesa importada voltam parados; o chat vem vazio ou com o histórico, conforme a escolha.
- [ ] Amigos entram na mesa importada pelo novo código sem configurar nada além do endereço.

## Chat de voz
- [ ] Região Áudio: "Voz: desligado"; Enter alterna entre desligado, push-to-talk e microfone aberto (o Windows pode pedir permissão ao microfone).
- [ ] Push-to-talk: segurar F4 fala e soltar para; o clique de início e fim é ouvido.
- [ ] Microfone aberto só transmite quando você fala (sem chiado entre as falas).
- [ ] Supressão de ruído (ligada por padrão): ventilador, teclado e música de fundo somem sem "engolir" a voz; comparar com ela desligada.
- [ ] Escolher microfone e saída das vozes pela lista de dispositivos; a escolha fica salva.
- [ ] Mesa redonda: com 3 ou mais pessoas, quem entrou logo depois de você soa à esquerda e quem entrou logo antes soa à direita; o oposto soa à frente e um pouco mais baixo. Conferir com todos que a ordem é a mesma para cada um.
- [ ] Região Áudio, "Voz posicional, mesa redonda": Enter liga e desliga; desligada, todas as vozes soam no centro.
- [ ] "Onde ouço os sons da cena" (antigo "Minha posição") só afeta os sons da cena, não as vozes.
- [ ] "Falando agora" lista quem fala; "Avisar quem começa a falar" fala o nome sem atropelar a navegação.
- [ ] Sem picotar: a voz sai contínua com 3 ou 4 pessoas falando (corrigido o limite do servidor, que descartava quase metade dos pacotes, e o colchão contra chegada irregular).
- [ ] Atraso aceitável e sem cortes com 3 ou 4 pessoas, pela internet (Radmin) e na rede local.
- [ ] O pacote do cliente leva a DLL de voz e funciona em outro computador (sem instalar nada).

## Pacote do cliente
- [ ] `dist/Guacamole-cliente-windows.zip` abre em outro computador, fala pelo leitor de tela e conecta ao servidor.
- [ ] O pacote foi gerado com o modelo de exportação 4.7.1 e o editor 4.7.2; se algo estranho aparecer, reexportar com o modelo 4.7.2.

## Geral
- [ ] A fala de navegação não fica enfileirada (fila com intervalo mínimo no `speech.gd`).
- [ ] Textos em português do Dungeon World 2 e dos compêndios, lidos por quem conhece o jogo.
