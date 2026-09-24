---
title: "Um navegador por dentro, parte 6: o JavaScript e a volta do laço"
date: 2023-10-07 10:00:00 -0300
tags: [navegador, javascript, event-loop, performance]
description: "Tudo que as cinco partes anteriores descreveram roda numa thread só, e o JavaScript divide essa thread com elas. Esta parte mede o que acontece quando ele não devolve o controle."
---

*Série **Um navegador por dentro**, o percurso completo:
**0.** [as camadas](/2023/08/navegador-parte-0-as-camadas/) ·
**1.** [do nome ao endereço](/2023/09/navegador-parte-1-do-nome-ao-endereco/) ·
**2.** [a conexão e a sessão](/2023/09/navegador-parte-2-a-conexao/) ·
**3.** [o HTTP que anda por cima](/2023/09/navegador-parte-3-http/) ·
**4.** [o HTML vira árvore](/2023/09/navegador-parte-4-o-html-vira-arvore/) ·
**5.** [estilo, layout e pintura](/2023/09/navegador-parte-5-estilo-e-layout/) ·
**6.** o JavaScript e a volta do laço (esta) ·
**7.** [tcpdump e scapy](/2023/10/navegador-parte-7-tcpdump-e-scapy/)*

Chegamos com uma página desenhada na tela. Falta o que a torna um aplicativo em
vez de um documento — e falta a restrição que explica quase todo problema de
desempenho que você vai encontrar na web.

A restrição é esta: **a análise do HTML, o cálculo de estilo, o layout, a pintura
e o seu JavaScript rodam todos na mesma thread.** Não em paralelo. Um de cada
vez, coordenados por um laço.

<!--more-->

## O laço, e as duas filas

Simplificando só o suficiente, cada volta do laço de eventos faz isto:

```
1. tira UMA tarefa da fila de tarefas e roda até o fim
2. esvazia a fila de microtarefas — inteira, inclusive o que
   for enfileirado durante o esvaziamento
3. se for hora de desenhar um quadro:
     roda os callbacks de requestAnimationFrame
     recalcula estilo, faz layout, pinta, compõe
4. volta ao 1
```

Duas filas com regras opostas. Da fila de **tarefas** sai um item por volta:
`setTimeout`, um evento de clique, uma resposta de rede. A fila de
**microtarefas** é drenada até o fim: `Promise.then`, `queueMicrotask`,
`MutationObserver`.

E fora das duas filas está o `requestAnimationFrame`: uma função que você
registra para rodar **imediatamente antes do próximo quadro ser desenhado**. Não
é um temporizador — não tem prazo, tem lugar. É onde se anima alguma coisa sem
brigar com o navegador, porque a alteração acontece no instante exato em que ele
ia recalcular tudo de qualquer jeito.

A diferença aparece direto no console:

```js
console.log('1 síncrono');
setTimeout(()      => console.log('5 setTimeout 0 — tarefa'), 0);
requestAnimationFrame(() => console.log('6 requestAnimationFrame'));
queueMicrotask(()  => console.log('3 queueMicrotask'));
Promise.resolve().then(() => console.log('4 Promise.then — microtarefa'));
console.log('2 fim do bloco síncrono');
```

```
1 síncrono
2 fim do bloco síncrono
3 queueMicrotask
4 Promise.then — microtarefa
5 setTimeout 0 — tarefa
6 requestAnimationFrame
```

O `setTimeout(…, 0)` foi registrado **antes** das microtarefas e rodou **depois**
das duas. Zero milissegundo nunca significou "agora"; significa "na próxima
tarefa, e as microtarefas passam na frente".

## Microtarefas podem matar de fome a fila de tarefas

O "drena até o fim" é literal, e tem consequência. Uma microtarefa que se
reenfileira nunca devolve o controle:

```js
let tarefa = false, n = 0;
setTimeout(() => { tarefa = true; }, 0);
const anda = () => { n++; if (n < 200000 && !tarefa) queueMicrotask(anda); };
queueMicrotask(anda);
```

```
200000 rodadas, e o setTimeout de 0 ms nunca chegou a rodar
```

Duzentas mil voltas sem que uma única tarefa passasse. Nenhum evento é tratado,
nenhum quadro é desenhado, a aba congela. Um laço `while(true)` faz o mesmo de
forma óbvia; uma cadeia de promessas que se realimenta faz o mesmo de forma
discreta, e é muito mais fácil de escrever sem querer.

## `setTimeout(f, 0)` não é 0, e a partir da quinta vez nem tenta

Encadeando doze `setTimeout(…, 0)`, um chamando o próximo, e medindo o intervalo
real:

```
0.1  0.0  0.0  0.0  0.1  0.0  4.2  4.1  4.1  4.2  4.2  4.2
```

Os seis primeiros saem na hora. Do sétimo em diante, exatamente 4 ms. Não é
carga de máquina: é regra da especificação. Quando um temporizador é agendado
de dentro de outro, o nível de aninhamento sobe, e acima de cinco o prazo mínimo
vira 4 ms. A regra é dos anos 2000, quando laços com `setTimeout(…, 0)` eram a
forma usual de ceder o controle e derrubavam o navegador.

Hoje, para ceder sem pagar os 4 ms, existe `queueMicrotask` (que não cede de
verdade — veja o parágrafo anterior), `MessageChannel`, ou `scheduler.yield()`
nos navegadores que já o têm.

## O orçamento de 16,7 ms

Numa tela de 60 Hz, cada quadro tem **16,7 ms** para tudo: sua tarefa, as
microtarefas, o `requestAnimationFrame`, o recálculo de estilo, o layout, a
pintura e a composição. Estourar isso não deixa nada mais lento — faz o quadro
**não existir**.

Contando quantos quadros o navegador consegue produzir em um segundo, com uma
única tarefa longa no meio:

| tarefa que ocupa a thread | quadros em 1 s |
|---|---:|
| nenhuma | **61** |
| 100 ms | 57 |
| 300 ms | 45 |
| 600 ms | 27 |

A perda acompanha a duração quase exatamente: 600 ms de bloqueio custaram 34
quadros, que é o que cabe em 600 ms a 60 Hz. O navegador não "fica lento"; ele
simplesmente não desenha durante o tempo em que o seu código está no controle.

Em 600 ms de congelamento, um clique não vira destaque no botão, um campo de
texto não mostra a letra digitada, e uma rolagem que dependa de JavaScript não
acontece. É por isso que a métrica que mede isso — *long tasks*, tarefas acima de
50 ms — virou padrão.

A saída não é fazer o trabalho ser mais rápido; é fatiá-lo. Um laço sobre dez mil
itens que processa duzentos por vez e cede o controle entre as fatias faz o mesmo
trabalho e mantém a página viva.

## O que não está nessa thread

Nem tudo disputa. O que roda em paralelo, de verdade:

**Rede.** Downloads acontecem em outra thread e em outro processo. Por isso o
`defer` da [parte 4](/2023/09/navegador-parte-4-o-html-vira-arvore/) funciona —
o arquivo baixa enquanto a árvore é montada.

**Composição.** Mover uma camada já rasterizada é trabalho do compositor, muitas
vezes na GPU. É o que faz a rolagem continuar suave em páginas cujo JavaScript
travou, e é a razão técnica do conselho da
[parte 5](/2023/09/navegador-parte-5-estilo-e-layout/) sobre `transform`.

**Web Workers.** Uma thread de verdade para o seu código — sem acesso ao DOM, e
a comunicação é por mensagens. É a única forma de tirar cálculo pesado da thread
principal, e é subusada.

**Decodificação de imagem e rasterização**, que o Chromium faz em threads
auxiliares.

## O ciclo se fecha

Quando o JavaScript muda o DOM, ele não desenha nada. Ele **invalida**:

```
element.textContent = 'oi'
    ↓ marca o nó como sujo
recálculo de estilo      ← a etapa da parte 5
    ↓
layout                   ← só se a geometria mudou
    ↓
pintura                  ← só nas camadas afetadas
    ↓
composição               ← na GPU
```

Nada disso acontece na hora. Acontece no passo 3 do laço, antes do próximo
quadro, uma vez só, com todas as suas alterações juntas. E é exatamente por isso
que ler `offsetHeight` no meio é tão caro: você força o navegador a antecipar
essas etapas, e ele as refaz na próxima alteração.

O ciclo fecha a série. A página não é um resultado — é um estado que é
reconstruído, parcialmente, sessenta vezes por segundo, enquanto durar a aba.

## O que fica

**Uma thread para tudo.** Análise, estilo, layout, pintura e o seu código. O
paralelismo real está na rede, no compositor e nos workers.

**Microtarefas passam na frente e podem matar de fome.** Duzentas mil voltas sem
que uma tarefa rodasse.

**`setTimeout(f, 0)` vira 4 ms a partir do sexto encadeamento.** Está na
especificação, não na sua máquina.

**16,7 ms por quadro, e estourar não atrasa: apaga.** 600 ms de bloqueio, 34
quadros que nunca existiram.

E, fechando as seis partes: do nome digitado até este laço, praticamente nenhuma
etapa é sobre velocidade bruta. São idas e voltas que você evita, bytes que você
não manda, invalidações que você não dispara e o controle que você devolve. É
quase tudo sobre não fazer o trabalho.

## Referências

- [HTML Standard — Event loops](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops) — as duas filas, os passos de renderização e a regra dos 4 ms
- [Tasks, microtasks, queues and schedules (Jake Archibald)](https://jakearchibald.com/2015/tasks-microtasks-queues-and-schedules/) — a melhor explicação escrita sobre a ordem
- [In The Loop (Jake Archibald, JSConf Asia 2018)](https://www.youtube.com/watch?v=cCOL7MC4Pl0) — a mesma coisa, com animação
- [Optimize long tasks (web.dev)](https://web.dev/articles/optimize-long-tasks) — como fatiar trabalho e ceder o controle
- [RenderingNG (Chrome)](https://developer.chrome.com/docs/chromium/renderingng) — o que roda em qual thread
