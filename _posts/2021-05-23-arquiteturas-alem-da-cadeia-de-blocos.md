---
title: "Nem toda blockchain é uma cadeia: seis arquiteturas além do fio de blocos"
date: 2021-05-23 10:00:00 -0300
tags: [blockchain, criptomoedas, arquitetura, sistemas-distribuídos, privacidade]
description: "A cadeia de blocos é uma escolha de estrutura de dados, não uma definição. Grafo, uma cadeia por conta, voto virtual, rede sem consenso global, prova recursiva — e uma proposta em que o histórico encolhe em vez de crescer."
---

"Blockchain" virou sinônimo do problema que ela resolve, e isso esconde uma
coisa: a **cadeia de blocos é uma escolha de estrutura de dados**, não uma
definição.

O problema real é outro — fazer uma rede sem dono concordar sobre o que
aconteceu e em que ordem, como vimos nos
[modelos de consenso](/2021/05/modelos-de-consenso-blockchain/). Encadear blocos
num fio único é **uma** forma de organizar isso. Existem outras, e algumas
resolvem problemas que a cadeia cria.

Este texto percorre seis alternativas — algumas em produção há anos, outras ainda
mais promessa que rede — e termina numa proposta que não muda o formato do grafo:
muda o que uma transação contém.

<!--more-->

## O que a cadeia cobra

Vale nomear o custo antes das alternativas.

Num fio único de blocos, **todas as transações do mundo competem pelo mesmo
espaço**. O bloco tem tamanho limitado e sai a cada intervalo fixo, então existe
um teto de transações por segundo que não depende de quantos computadores há na
rede — depende do formato.

Daí saem duas consequências que todo mundo já sentiu: **taxa** (quem paga mais
entra antes no bloco) e **espera** (quem paga pouco fica na fila). E uma terceira,
menos discutida: o histórico só cresce. Todo nó completo guarda tudo, para sempre.

## Tangle: um grafo em vez de um fio

A IOTA propôs, no artigo *The Tangle* de Serguei Popov (2016), abandonar o bloco.

Não há mineradores, não há blocos e não há taxa. A regra é uma só: **para emitir
uma transação, você precisa validar duas transações anteriores**. O resultado é um
grafo acíclico dirigido — cada transação aponta para duas outras, e a confiança em
uma transação cresce conforme outras se apoiam nela, direta ou indiretamente.

A inversão é bonita. Na cadeia, quem transaciona **paga** a quem valida. No
Tangle, quem transaciona **é** quem valida. E daí sai a propriedade que motivou o
projeto: quanto mais gente usa, mais rápida a rede fica — o oposto da cadeia, onde
uso é congestionamento. Foi desenhado pensando em dispositivos de internet das
coisas trocando micropagamentos, onde uma taxa de centavos inviabilizaria tudo.

**E aqui vem a parte honesta.** O argumento de segurança depende de haver um
fluxo alto e constante de transações novas. Com pouco movimento, um atacante com
capacidade modesta consegue emitir transações suficientes para dominar o grafo.
A solução, até hoje, é o **Coordenador**: um nó operado pela própria IOTA
Foundation que marca pontos de referência periódicos na rede.

Ou seja: a rede que se propõe a superar a centralização da cadeia funciona, neste
momento, com um nó central da fundação. A remoção dele é prometida há anos, sob o
nome de Coordicide. Enquanto não acontecer, a arquitetura é uma proposta elegante
com uma muleta no meio — e vale julgá-la por isso.

## Block lattice: uma cadeia por conta

A Nano — lançada como RaiBlocks por Colin LeMahieu em dezembro de 2014 — faz um
movimento diferente e, na minha opinião, mais engenhoso.

Em vez de uma cadeia global, **cada conta tem a sua própria cadeia**, e só o dono
daquela conta pode escrever nela. O conjunto de todas essas cadeias é o *block
lattice*.

A consequência é que uma transferência deixa de ser um evento e vira **dois**: um
bloco de envio na cadeia de quem paga, e um bloco de recebimento na cadeia de quem
recebe. Cada um escreve no próprio livro, de forma assíncrona.

Repare no que isso elimina. Como ninguém compartilha a cadeia com ninguém, **não
há competição por espaço em bloco** — logo, não há taxa e não há fila. Duas
transferências entre pessoas diferentes não têm por que se atrapalhar, e no
modelo da Nano, não se atrapalham.

O consenso só é acionado quando há conflito de verdade — um dono tentando gastar
duas vezes na própria cadeia. Aí entra o mecanismo próprio da rede, o **voto por
representante aberto**: cada conta escolhe livremente um representante, cujo peso
de voto é a soma dos saldos de quem o escolheu, e a transação é confirmada quando
67% do poder de voto online concorda.

Vale insistir num detalhe que quase sempre se perde, porque faz o modelo ser
confundido com Proof of Stake delegado: **delegar aqui não bloqueia nada**. O
dinheiro continua disponível, e o peso do representante muda sozinho conforme as
pessoas gastam e recebem. Não há recompensa de bloco e, por consequência, não há
taxa — os [modelos de consenso](/2021/05/modelos-de-consenso-blockchain/) do texto
anterior detalham por que isso é outra família, e não uma variante.

**O custo aqui também é estrutural.** Sem taxa, não há receita para quem opera um
nó. A rede depende de voluntários e de participantes com interesse próprio em
mantê-la de pé, e essa é uma pergunta em aberto sobre sustentação a longo prazo —
exatamente o pilar de "sustentabilidade" que a terceira geração diz atacar.

## Hashgraph: votar sem enviar votos

O hashgraph, descrito por Leemon Baird num artigo de maio de 2016, resolve o
mesmo problema por um caminho que não se parece com nenhum dos anteriores.

A base é um protocolo de fofoca: cada nó conta a outro nó, escolhido ao acaso,
tudo o que sabe. Até aí, nada de novo — redes distribuídas fazem isso há décadas.
A sacada está no que é fofocado: **a fofoca inclui o histórico de quem contou o
quê a quem, e quando**. É o que eles chamam de *gossip about gossip*.

E aí acontece a parte elegante. Como todo nó acaba sabendo **quem soube de cada
coisa e em que momento**, cada um consegue calcular sozinho como os outros
votariam — sem que nenhum voto precise ser transmitido. É a **votação virtual**:
o resultado da eleição é derivado do grafo de comunicação, não da eleição.

Isso dá uma propriedade forte, chamada BFT assíncrono: a rede chega a acordo
definitivo tolerando até um terço de nós maliciosos, **sem depender de suposições
sobre o tempo de entrega das mensagens** — que é a hipótese frágil da maioria dos
protocolos.

**E agora a parte que precisa ser dita.** O algoritmo é **patenteado**, o que por
si só o separa de tudo o mais nesta lista. E a rede pública que o usa, a Hedera,
é *permissioned*: qualquer um transaciona, mas os nós de consenso são operados
por um **conselho de grandes empresas**, com assentos limitados.

Ou seja: a finalidade determinística não veio do hashgraph sozinho — veio do
hashgraph **mais** um conjunto fechado de validadores, que é exatamente a troca
que o [BFT clássico](/2021/05/modelos-de-consenso-blockchain/) já fazia. A
inovação técnica é real; o que ela entrega de descentralização, menos do que o
marketing sugere.

## Obyte: doze testemunhas, e ninguém finge o contrário

A Obyte — lançada como Byteball por Anton Churyumov em 2016 — é outro grafo, mas
merece estar aqui por uma escolha de projeto que eu considero honesta.

Como todo DAG, ela precisa de um jeito de estabelecer ordem quando duas
transações conflitam. A solução são **doze testemunhas**: entidades conhecidas,
escolhidas pelos próprios usuários, que publicam transações com regularidade. A
cadeia principal é traçada seguindo o caminho que mais passa por elas.

Compare com o Coordenador da IOTA e a diferença de postura fica clara. A IOTA tem
**um** nó central, operado pela fundação, apresentado como medida temporária que
será removida. A Obyte tem **doze**, nomeadas, escolhidas pelo usuário, e
assumidas como parte permanente do desenho.

Nenhuma das duas é trustless. Uma admite isso na documentação; a outra chama de
fase de transição — e já dura anos.

## Holochain: e se não houvesse consenso global?

A proposta mais radical da lista é a que pergunta se o consenso global é
necessário.

O argumento é este: numa rede de moeda, é preciso que todos concordem sobre tudo,
porque gastar duas vezes é a fraude central. Mas a maioria das aplicações não é
moeda. Num fórum, numa rede social, num registro de reputação, **por que todos os
participantes do planeta precisam concordar sobre uma mensagem entre duas
pessoas?**

O Holochain inverte o modelo: em vez de centrado na cadeia, é **centrado no
agente**. Cada participante mantém a própria cadeia local — o registro das
próprias ações, assinado — e publica o que for público numa tabela hash
distribuída. As regras de validação viajam junto com a aplicação, e quem recebe
um dado **valida contra essas regras**. Se alguém emitir algo inválido, os
vizinhos que validam detectam, e a evidência é compartilhada.

Não existe livro-razão global. Existe um monte de livros pessoais e uma rede que
verifica uns aos outros.

O que isso compra é escala real: sem consenso global, não há teto global de
transações por segundo. O que custa é justamente o caso do dinheiro — sem ordem
total, impedir gasto duplo volta a ser difícil, e é por isso que a abordagem
aparece em aplicações colaborativas e não em moedas. Vale dizer que é a menos
madura das que estão aqui, ainda mais promessa do que rede em produção.

## Mina: a cadeia que não cresce, por prova

E há uma abordagem que ataca o problema do histórico infinito de frente, com
criptografia em vez de estrutura.

A ideia da Mina — que se chamava Coda até o ano passado e abriu a rede principal
há poucos meses — usa **zk-SNARKs recursivos**. A tradução prática: em vez de
guardar o histórico, guarda-se uma **prova** de que o histórico era válido. E como
a prova é recursiva, a prova nova engloba a anterior, que engloba a anterior, e
assim por diante.

O resultado é o número mais chamativo deste texto: **a cadeia inteira cabe em
cerca de 22 KB**, e esse tamanho é **constante**. Não cresce com o número de
transações, nem com os anos. Um celular verifica a rede inteira.

Compare com o Bitcoin, onde entrar como nó completo significa baixar centenas de
gigabytes e validar mais de uma década de história. A diferença de custo de
entrada não é de grau, é de categoria — e custo de entrada é o que decide quantas
pessoas conseguem participar sem pedir licença a ninguém.

## E então: Mimblewimble

As três abordagens acima mexem no **formato do grafo**. A última muda outra
coisa: o que uma transação contém.

A história é boa demais para resumir. Em **19 de julho de 2016**, alguém usando o
pseudônimo **Tom Elvis Jedusor** — o nome de Voldemort na edição francesa de Harry
Potter — deixou um artigo curto num canal de pesquisa de Bitcoin e desapareceu. O
nome da proposta, *Mimblewimble*, é o feitiço que enrola a língua de quem tenta
falar. Não é sutil: o protocolo existe para que a cadeia não conte o que
aconteceu.

O que ele propõe é radical em três frentes:

**Não existem endereços nem scripts.** A transação é construída em conjunto pelas
duas partes. Não há um campo "para" que possa ser lido e agregado depois.

**Os valores são ocultos.** As quantias entram como compromissos criptográficos.
Quem valida não vê os valores — mas consegue verificar que a soma das entradas é
igual à das saídas, que é a única coisa que precisa ser verdade.

**As transações são fundidas.** Um bloco não é uma lista de transações
individuais: é um agregado em que não dá para dizer qual entrada pagou qual
saída.

E vem daí a propriedade que eu acho a mais interessante de todo este texto: o
**cut-through**. Se uma saída foi criada e depois gasta dentro do histórico, ela
não é mais necessária para provar que o estado atual é válido — e pode ser
**descartada**.

Pense no que isso significa. Em toda arquitetura que vimos até agora, o histórico
só cresce. No Mimblewimble, **a cadeia pode encolher**: o que sobra é o conjunto
de saídas não gastas mais as provas, e não a narrativa completa de tudo o que já
aconteceu. É o único desenho da lista em que o custo de entrar na rede hoje não
depende de quanto tempo ela já existe.

As duas implementações práticas apareceram quase juntas, no começo de 2019: a
**Grin**, minimalista e sem pré-mineração, e a **Beam**, com mais recursos e
estrutura de empresa. Vale notar o preço da proposta: sem scripts, não há
contratos inteligentes no sentido da Ethereum. Privacidade e simplicidade foram
compradas com expressividade.

## O que fica

Colocando os quatro lado a lado:

| Arquitetura | Ideia central | Compra | Paga com |
|---|---|---|---|
| Cadeia de blocos | um fio global ordenado | simplicidade, segurança estudada | taxa, fila, histórico infinito |
| Tangle | grafo, cada um valida dois | sem taxa, escala com uso | segurança depende de volume; Coordenador |
| Block lattice | uma cadeia por conta | sem taxa, quase instantâneo | ninguém é pago para operar nó |
| Hashgraph | fofoca sobre fofoca, voto virtual | finalidade definitiva, BFT assíncrono | patente; validadores por convite |
| Obyte | DAG com testemunhas nomeadas | ordem resolvida, sem fingir | confiança explícita em doze entidades |
| Holochain | sem consenso global, por agente | escala sem teto global | gasto duplo volta a ser difícil |
| Mina | prova recursiva no lugar do histórico | cadeia constante de ~22 KB | criptografia nova, pouco testada |
| Mimblewimble | transação fundida e podável | privacidade, histórico encolhe | sem scripts, sem contratos |

A lição que eu tiro não é sobre qual vence. É que **tratar "blockchain" como
sinônimo de "cadeia de blocos" estreita o espaço de projeto antes da primeira
decisão**. O problema é ordenação e acordo; a cadeia é uma solução para ele, e
saber que existem outras muda as perguntas que se faz ao avaliar uma rede nova.

E a pergunta mais útil continua sendo a mais chata: **o que esta arquitetura está
pagando, e quem paga?** No Tangle, é a fundação que opera o Coordenador. Na Nano,
é quem hospeda nó sem receber. No Mimblewimble, é quem queria escrever um
contrato. Toda escolha tem uma dessas — e desconfiar quando ela não está escrita
costuma ser mais produtivo do que ler o white paper.

---

*Este é o terceiro de três textos, depois da
[Cardano e as gerações](/2021/05/cardano-esta-moldando-o-futuro-das-criptomoedas-e-tambem-das-nacoes/)
e dos [modelos de consenso](/2021/05/modelos-de-consenso-blockchain/).*
