---
title: "Como uma rede sem dono decide o que é verdade: os modelos de consenso"
date: 2021-05-16 10:00:00 -0300
tags: [blockchain, criptomoedas, consenso, sistemas-distribuídos]
description: "Proof of Work, Proof of Stake, delegação, BFT. Cada um responde à mesma pergunta — quem pode participar da decisão e quando ela é definitiva — e nenhum responde de graça."
---

Toda blockchain resolve um problema anterior a moeda, contrato ou qualquer
aplicação: **como um monte de computadores que não se conhecem e não confiam uns
nos outros concorda sobre o que aconteceu, e em que ordem.**

Esse problema tem nome desde 1982, quando Leslie Lamport o descreveu como o
**problema dos generais bizantinos**. Vários generais cercam uma cidade e
precisam atacar juntos ou recuar juntos — atacar pela metade é a pior das
opções. Eles só se comunicam por mensageiro, e alguns dos generais podem ser
traidores, enviando mensagens contraditórias de propósito.

A pergunta é: existe um protocolo que faça os generais leais chegarem à mesma
decisão, mesmo com traidores entre eles?

Cada modelo de consenso é uma resposta diferente a essa pergunta. Este texto
percorre os principais — e o que cada um cobra.

<!--more-->

## Proof of Work: tornar a mentira cara

O Bitcoin resolveu o problema em 2009 de um jeito que não estava nos livros.
Ele não faz os participantes **votarem**. Ele torna a desonestidade
**economicamente proibitiva**.

Para propor um bloco, um minerador precisa encontrar um número que, junto com o
conteúdo do bloco, produza um hash abaixo de um alvo. Não há atalho: é tentativa
e erro, milhões de vezes por segundo, queimando eletricidade. Quando encontra,
qualquer um confere em microssegundos.

A regra que resolve a discordância é simples: **a cadeia mais longa vence**.
Reescrever o passado exigiria refazer todo o trabalho desde o ponto que se quer
alterar, **mais rápido** do que o resto da rede constrói o presente. Isso custa
mais do que o ataque renderia, e é essa aritmética — não uma autoridade — que
segura a rede.

E daí vem uma propriedade que quase ninguém explica direito: a **finalidade é
probabilística**. Uma transação nunca fica matematicamente definitiva. O que
acontece é que a probabilidade de ela ser revertida cai exponencialmente a cada
bloco novo. É por isso que exchanges pedem "seis confirmações" em vez de uma: não
é superstição, é escolher um ponto na curva.

O preço do modelo é conhecido e não é pequeno: a segurança é comprada com
energia, e ela precisa continuar sendo comprada para sempre.

## Proof of Stake: trocar energia por capital em risco

A ideia é substituir o recurso escasso. Em vez de provar que você queimou
eletricidade, você prova que **tem capital bloqueado na própria rede** — e que
perde esse capital se trapacear.

O argumento é elegante: o minerador de PoW pode atacar a rede e vender o
equipamento depois, porque uma GPU serve para outras coisas. Quem valida em PoS
tem o próprio capital denominado na moeda que estaria atacando. Destruir a rede é
destruir a garantia.

O problema difícil aqui chama-se **nada em jogo**. Em PoW, apostar em duas
cadeias ao mesmo tempo custa o dobro de energia, então ninguém faz. Em PoS,
assinar dois blocos concorrentes é quase de graça — e se todo mundo fizer isso,
a rede nunca converge. Resolver isso exige penalidades explícitas e uma
matemática que não é óbvia.

A maior aposta nessa direção está em curso enquanto escrevo: a **Ethereum** está
migrando de Proof of Work para Proof of Stake. A *Beacon Chain*, que é a cadeia
de consenso em PoS, entrou no ar em **dezembro de 2020** e já roda em paralelo à
rede principal, acumulando validadores. A fusão das duas — juntar a execução da
cadeia atual ao consenso da nova — é o passo que falta, e é de longe a troca de
motor mais arriscada já tentada numa rede com esse valor em cima.

Foi aí que a **Ouroboros** se destacou: publicada por Aggelos Kiayias e coautores
na Crypto 2017, foi o primeiro protocolo de Proof of Stake com **prova formal de
segurança** — garantias demonstradas matematicamente, revisadas por pares antes
de virar código. É a base da [Cardano](/2021/05/cardano-esta-moldando-o-futuro-das-criptomoedas-e-tambem-das-nacoes/),
e a escolha metodológica é tão relevante quanto o protocolo: publicar antes de
implementar é o oposto do padrão do setor.

## Delegação: democracia líquida aplicada a protocolo

Há uma família inteira de modelos que responde a um problema prático: a maioria
dos detentores **não quer** operar um nó. Não tem máquina, não tem banda, não tem
paciência. Exigir participação direta de todos produz, na prática, participação de
poucos.

A saída é emprestada da ciência política e chama-se **democracia líquida**: você
não vota em tudo, e também não elege um representante por um mandato fixo. Você
**delega o seu peso a quem quiser, e retoma quando quiser**. É voto que flui em
vez de voto que é entregue.

Traduzido para protocolo, isso aparece em pelo menos três formatos bem
diferentes, e confundi-los é comum.

**Proof of Stake delegado.** Os detentores elegem um conjunto pequeno e fixo de
validadores — vinte e um, cem, conforme a rede — e esses produzem os blocos. Com
poucos validadores conhecidos, a coordenação é rápida: segundos em vez de minutos.
O custo é que a rede passa a depender de um número pequeno de entidades, e a
pergunta "isso é descentralizado?" ganha uma resposta desconfortável.

**Delegação sem conjunto fixo**, que é o caso da Cardano. Qualquer um pode operar
um *pool*, qualquer detentor delega a quem quiser, e a delegação **não trava o
dinheiro** — você continua podendo gastar. O protocolo ainda inclui mecanismos
que desestimulam a concentração num único pool. É mais próximo do espírito da
democracia líquida do que o formato anterior, porque não há assento a ser
disputado.

**Voto por representante aberto**, o modelo da Nano, e é o mais distante dos
três apesar de ser confundido com DPoS o tempo todo. Aqui a delegação é **só de
voto**: nada é bloqueado, o peso do representante é simplesmente a soma dos
saldos de quem o escolheu, e esse peso **muda sozinho** conforme as pessoas
gastam e recebem. Uma transação é confirmada quando 67% do poder de voto online
a confirma.

E há duas consequências que valem reter. Primeiro, **não existe recompensa de
bloco** nesse desenho — logo, não existe taxa, porque não há o que financiar.
Segundo, o consenso só é acionado **quando há conflito de verdade**; transação sem
disputa não passa por votação nenhuma. É outro animal, e merece ser chamado por
outro nome.

Vale reparar num padrão que atravessa os três: a concentração aparece mesmo onde
o protocolo não a exige. É o que os *pools* de mineração fizeram com o Bitcoin sem
ninguém ter projetado, e é o motivo de "quantos validadores existem" ser uma
pergunta menos útil que "quantos precisariam combinar entre si".

## BFT clássico: decisão definitiva, com a porta fechada

Há uma linhagem mais antiga e completamente diferente, que vem da ciência da
computação acadêmica e não do mundo cripto.

Em 1999, Miguel Castro e Barbara Liskov publicaram o **PBFT** — *Practical
Byzantine Fault Tolerance*. Em vez de competir por trabalho, os participantes
**votam em rodadas explícitas**. Com `3f+1` participantes, o protocolo tolera até
`f` traidores e chega a acordo.

A propriedade que isso compra é enorme: **finalidade determinística**. Decidiu,
acabou. Não há "seis confirmações", não há probabilidade caindo
exponencialmente. É o que sistemas financeiros regulados precisam para conciliar
o fim do dia.

E o preço é igualmente grande: **é preciso saber quem são os participantes**. O
protocolo conta votos, e contar votos exige saber quantos votantes existem —
senão qualquer um cria mil identidades e vota mil vezes. Por isso PBFT e
derivados funcionam bem em redes autorizadas, entre bancos ou empresas de um
consórcio, e não em uma rede aberta onde qualquer um entra.

## O eixo que organiza tudo

Depois de olhar os quatro, a comparação deixa de ser "qual é melhor" e vira um
plano com dois eixos:

| | **Participação aberta** | **Participação conhecida** |
|---|---|---|
| **Finalidade probabilística** | PoW, PoS | — |
| **Finalidade determinística** | difícil e caro | BFT clássico |

A célula vazia no canto superior direito não é acaso. Consenso com participação
aberta **e** finalidade instantânea é o problema difícil de verdade, e as
tentativas de chegar lá são o que explica quase toda a inovação de protocolo dos
últimos anos.

Duas notas de rodapé que completam o quadro:

**Proof of Authority** desiste explicitamente da abertura: validadores são
identificados e reputacionalmente responsáveis. É honesto para uma rede
corporativa e não faz sentido para uma moeda pública.

**Proof of Space** troca o recurso escasso por espaço em disco em vez de
eletricidade. Consome menos energia; em compensação, transfere a pressão para a
fabricação de discos.

## O que eu levaria daqui

Que consenso não é ranking, é **troca** — e que a pergunta útil não é "qual
protocolo é o melhor", mas **o que este sistema precisa que seja verdade**.

Se precisa que qualquer um possa entrar sem pedir licença, você aceita finalidade
probabilística e paga em energia ou em capital bloqueado. Se precisa que a
liquidação seja definitiva às cinco da tarde, você fecha a lista de participantes
e ganha o determinismo em troca.

Quem promete os dois ao mesmo tempo, sem dizer o que está pagando, geralmente
está escondendo onde ficou a conta.

<div class="nota-editorial" markdown="1">
<span class="nota-editorial__rotulo">Nota de 2026</span>
A migração da Ethereum descrita acima como "o passo que falta" aconteceu: a fusão
entre a cadeia de execução e a Beacon Chain foi concluída em **15 de setembro de
2022**, no evento que ficou conhecido como *The Merge*. O consumo de energia da
rede caiu em mais de 99% de um dia para o outro, e a troca de motor ocorreu sem
interrupção de serviço — o que, para o tamanho do risco, é um resultado de
engenharia notável.
</div>

## Para ir além

Quem quiser o panorama acadêmico completo, a referência é
[*SoK: Consensus in the Age of Blockchains*](https://arxiv.org/abs/1711.03936),
de Bano e coautores. É uma sistematização que compara as famílias de protocolo por
propriedades de segurança e desempenho, em vez de por narrativa de projeto — e
deixa explícito o que cada uma assume para funcionar, que é justamente o que os
white papers costumam deixar implícito.

---

*Este é o segundo de três textos. O primeiro é sobre a
[Cardano e as gerações de blockchain](/2021/05/cardano-esta-moldando-o-futuro-das-criptomoedas-e-tambem-das-nacoes/);
o terceiro é sobre as arquiteturas que abandonam a cadeia de blocos.*
