---
title: "Nem toda blockchain é uma cadeia: Tangle, block lattice e Mimblewimble"
date: 2021-05-23 10:00:00 -0300
tags: [blockchain, criptomoedas, arquitetura, sistemas-distribuídos, privacidade]
description: "A cadeia de blocos é uma escolha de estrutura de dados, não uma definição. Há redes em grafo, redes com uma cadeia por conta, e uma proposta em que o histórico encolhe em vez de crescer."
---

"Blockchain" virou sinônimo do problema que ela resolve, e isso esconde uma
coisa: a **cadeia de blocos é uma escolha de estrutura de dados**, não uma
definição.

O problema real é outro — fazer uma rede sem dono concordar sobre o que
aconteceu e em que ordem, como vimos nos
[modelos de consenso](/2021/05/modelos-de-consenso-blockchain/). Encadear blocos
num fio único é **uma** forma de organizar isso. Existem outras, e algumas
resolvem problemas que a cadeia cria.

Este texto percorre três alternativas, e termina numa proposta que não muda o
formato do grafo — muda o que uma transação contém.

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
duas vezes na própria cadeia. Aí representantes eleitos pelos detentores votam, e
o conflito se resolve.

**O custo aqui também é estrutural.** Sem taxa, não há receita para quem opera um
nó. A rede depende de voluntários e de participantes com interesse próprio em
mantê-la de pé, e essa é uma pergunta em aberto sobre sustentação a longo prazo —
exatamente o pilar de "sustentabilidade" que a terceira geração diz atacar.

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
