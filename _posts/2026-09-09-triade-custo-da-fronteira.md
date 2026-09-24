---
title: "A tríade, parte 3: quanto custa sair do Python"
date: 2026-09-09 10:00:00 -0300
tags: [python, c, rust, performance]
description: "ctypes custa 13 vezes uma extensão nativa para chamar a mesma função em C. E uma extensão em C, numa chamada trivial, mal ganha do Python puro. O que decide não é a linguagem — é quanto trabalho cabe em cada travessia."
---

*Parte 3 da série sobre a camada de baixo. A [parte 1](/2026/09/triade-undefined-behavior/)
mostrou o que o C faz quando você sai do previsto; a
[parte 2](/2026/09/triade-por-que-o-c-sustenta-tudo/), por que ele continua embaixo
de tudo. Esta mede o pedágio para chegar até lá.*

"Reescreva em C que fica rápido" é conselho tão repetido que virou reflexo. E ele
está certo em um sentido e perigosamente errado em outro, porque esconde o custo
que não aparece no código: **atravessar a fronteira entre o Python e a linguagem
de baixo não é de graça.**

Fui medir os quatro caminhos — `ctypes`, `cffi`, extensão em C compilada contra a
API do CPython, e o Python puro — chamando a **mesma** função, `sqrt` da libc. E
o resultado reorganiza o conselho.

<!--more-->

## Primeiro resultado: uma chamada trivial

Trezentas mil chamadas de `sqrt(2.0)`, tempo médio por chamada:

| Caminho | Por chamada |
|---|---|
| Extensão em C (API do CPython) | **40,1 ns** |
| Python puro (`math.sqrt`) | 46,7 ns |
| `cffi` (`dlopen`) | 293,8 ns |
| `ctypes` | 528,7 ns |

Leia as duas primeiras linhas de novo. **A extensão em C mal ganha do Python.**
Quarenta nanossegundos contra quarenta e seis — 14% de diferença, para uma
função escrita em C dos dois lados.

O motivo é que `math.sqrt` **já é** uma extensão em C. Ele não "é Python": é a
mesma travessia que eu acabei de fazer à mão, feita pela biblioteca padrão. O que
eu medi ali não é a diferença entre linguagens — é a diferença entre duas
implementações da mesma travessia.

E agora as duas últimas linhas, que são o achado. **O `ctypes` custa treze vezes
o que a extensão nativa custa**, para executar exatamente o mesmo código de
máquina no fim. O `cffi` custa sete vezes.

A função é idêntica. O que difere é o caminho até ela.

## Por que `ctypes` é caro

Porque ele faz em tempo de execução o que a extensão faz em tempo de compilação.

A cada chamada, o `ctypes` precisa descobrir a assinatura, converter cada
argumento Python para a representação em C, montar a chamada de acordo com a
convenção da plataforma, executar, e converter o retorno de volta. Isso é
*marshalling*, e é trabalho real repetido a cada invocação.

A extensão nativa não faz nada disso. Ela recebe os objetos Python direto, chama
`PyFloat_AsDouble`, executa e devolve. A conversão está escrita no código-fonte
dela e foi compilada uma vez.

O `cffi` fica no meio porque gera parte dessa ponte antecipadamente, e por isso
custa metade do `ctypes` — mas ainda sete vezes o nativo.

## Segundo resultado: e quando há trabalho de verdade?

O primeiro teste é injusto de propósito: uma raiz quadrada é trabalho de menos
para justificar qualquer travessia. A pergunta útil é **a partir de quanto
trabalho por chamada a conta vira.**

Medi uma função que soma `n` raízes quadradas — em Python puro num laço, e numa
extensão em C que faz o laço inteiro do lado de lá:

| n (raízes por chamada) | Python puro | Extensão em C | Ganho |
|---|---|---|---|
| 1 | 133 ns | 22 ns | 6,1× |
| 10 | 501 ns | 32 ns | 15,8× |
| 100 | 4.167 ns | 223 ns | 18,7× |
| 1.000 | 46.303 ns | 2.116 ns | 21,9× |
| 10.000 | 471.374 ns | 20.231 ns | 23,3× |

Duas coisas saltam.

**O ganho satura.** Ele sobe rápido até cerca de cem operações por chamada e
depois quase para, estabilizando em torno de vinte vezes. Depois desse ponto,
você não está mais amortizando a travessia — está apenas medindo a diferença
entre um laço em C e um laço em Python, que é o que ela é.

**E o começo da tabela é o interessante.** Com uma operação por chamada, o ganho
é 6×; com dez, já é 16×. Ou seja, **o custo fixo da travessia domina completamente
o regime de trabalho pequeno**, e é exatamente nesse regime que a maioria das
tentativas de otimizar "passando para C" acontece.

## A regra que sai daí

Não é "C é mais rápido". É:

> **O que decide o ganho é quanto trabalho cabe dentro de cada travessia.**

Uma função em C chamada um milhão de vezes com um número por vez perde para um
laço em Python que chama uma função nativa bem escrita. A mesma função em C
chamada uma vez com um milhão de números ganha vinte vezes.

Isso reorganiza o conselho inteiro. A pergunta ao otimizar não é "qual pedaço
está lento", é **"onde está a fronteira e quantas vezes eu a cruzo"**.

## Por que o uv e o Ruff são rápidos

Vale amarrar com algo que o blog já
[discutiu](/2026/09/uv-ruff-pyrefly-python-moderno/). O `uv` e o `Ruff` são
escritos em Rust e são absurdamente mais rápidos que os equivalentes em Python —
e a explicação usual é "porque Rust é rápido".

A explicação melhor é esta: eles **não atravessam a fronteira**. O Ruff não é uma
biblioteca Python que chama Rust por arquivo analisado; é um programa em Rust que
faz o trabalho inteiro do lado de lá e devolve o resultado uma vez. A travessia
acontece uma vez por execução, não uma vez por item.

É a linha de baixo da tabela acima, levada ao limite — e é uma decisão de
arquitetura, não de linguagem.

## O que fazer com isso

**Antes de reescrever, conte as travessias.** Se a função quente é chamada num
laço Python, mover só ela para C troca um problema por outro. Mova o **laço**.

**Prefira o nativo ao `ctypes` quando o volume for alto.** Para chamar uma função
de sistema três vezes na vida, `ctypes` é perfeito e não exige compilar nada.
Para chamar um milhão de vezes, ele é a escolha errada por um fator de treze.

**E meça antes de assumir que o Python é o gargalo.** Aquelas duas primeiras
linhas da primeira tabela existem para isso: o `math.sqrt` que você ia substituir
já era C, e você teria feito o trabalho para ganhar 14%.

## Referências

- [Extending Python with C or C++](https://docs.python.org/3/extending/extending.html) — a API que a extensão nativa usa
- [`ctypes`](https://docs.python.org/3/library/ctypes.html) e [cffi](https://cffi.readthedocs.io/) — os dois caminhos sem compilação
- [PyO3](https://pyo3.rs/) — o equivalente do lado do Rust
