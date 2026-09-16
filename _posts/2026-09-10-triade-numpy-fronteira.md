---
title: "A tríade, parte 4: por que o numpy é rápido, e quando ele fica mais lento que uma lista"
date: 2026-09-10 10:00:00 -0300
tags: [python, c, performance, numpy, engenharia]
description: "Somar cem mil números: 21 µs no numpy vetorizado, 628 µs numa lista comum — e 5.202 µs com sum() sobre o array numpy. O array perde para a lista por oito vezes, e o motivo é o mesmo da parte 3."
---

*Parte 4 da série sobre a camada de baixo, e consequência direta da
[parte 3](/2026/09/triade-custo-da-fronteira/): o custo de atravessar a fronteira
entre o Python e o C.*

A explicação padrão para o numpy ser rápido é "porque ele é escrito em C". Ela
está certa e é inútil, porque não permite prever nada — inclusive não permite
prever o resultado abaixo, que é o ponto deste texto.

Somando cem mil números, medido:

| Como | Tempo |
|---|---|
| numpy vetorizado — `a.sum()` | **21 µs** |
| `sum()` sobre uma lista comum | 628 µs |
| laço Python sobre uma lista | 1.845 µs |
| **`sum()` sobre o array numpy** | **5.202 µs** |
| laço Python sobre o array numpy | 6.158 µs |

Leia a quarta linha. Usar `sum()` num array numpy é **oito vezes mais lento** que
usar `sum()` numa lista comum — e **duzentas e quarenta vezes** mais lento que
`a.sum()`, que faz a mesma conta com o mesmo dado.

O array é mais rápido e mais lento que a lista, dependendo de como você o toca.

<!--more-->

## O que o numpy realmente faz

A diferença não é a linguagem. São duas coisas, e a segunda é a que importa.

**A primeira é o layout.** Uma lista Python é um array de **ponteiros** para
objetos — cada número é um objeto `float` no heap, com cabeçalho, contagem de
referências e ponteiro de tipo. Um array numpy é um bloco **contíguo de valores
brutos**, sem objeto nenhum no meio:

```
  array numpy float64 :  8,0 bytes por elemento
  lista de int        : 36,0 bytes por elemento
```

Oito bytes contra trinta e seis. O array guarda o número; a lista guarda o
endereço de uma caixa que guarda o número.

Isso já explica memória e explica cache — mas não explica os 21 µs.

**A segunda, e decisiva, é quantas vezes se atravessa a fronteira.** Quando você
chama `a.sum()`, o Python entrega o bloco inteiro ao C e recebe **um** número de
volta. Uma travessia, cem mil operações do lado de lá.

É exatamente a última linha da tabela da [parte 3](/2026/09/triade-custo-da-fronteira/),
onde o ganho satura em torno de vinte vezes por amortização — só que aqui o `n` é
cem mil, e o laço do lado de lá ainda por cima é vetorizado.

## E por que o array fica *mais lento* que a lista

Agora a quarta linha, que é o motivo de eu ter escrito o texto.

Quando você faz `sum(a)` — a função embutida do Python, não o método do numpy —
você pede ao Python para **percorrer elemento por elemento**. E cada acesso a um
elemento de um array numpy precisa fazer algo que a lista não precisa:
**construir um objeto Python**.

O array guarda oito bytes crus. O Python não sabe somar oito bytes crus: ele
precisa de um `float`. Então, a cada elemento, o numpy aloca um objeto novo,
copia o valor para dentro, devolve ao interpretador — que soma e joga o objeto
fora.

Cem mil travessias da fronteira, cada uma com uma alocação.

A lista não paga isso. Os objetos **já existem** — é o que ela guarda. Percorrer
uma lista é seguir ponteiros para objetos prontos.

Ou seja: a estrutura que é mais eficiente para o C é a mais cara para o Python
tocar item a item. E é a mesma propriedade — guardar valor bruto em vez de objeto
— que produz os dois efeitos opostos.

## A regra prática

> **Vetorize ou não use numpy.**

Não é slogan. Se o seu código percorre o array em Python, você está pagando o
layout do numpy sem colher o benefício dele — e teria sido mais rápido com uma
lista. O array só compensa quando a operação inteira acontece do outro lado da
fronteira.

Três sintomas de que isso está acontecendo no seu código:

- `for x in meu_array:` — quase sempre errado; procure a operação vetorizada
  equivalente.
- `sum(arr)`, `max(arr)`, `min(arr)` com as funções **embutidas** em vez de
  `arr.sum()`, `arr.max()`, `arr.min()`.
- Indexação num laço — `for i in range(len(a)): a[i] = ...` — que faz duas
  travessias por iteração, uma para ler e outra para escrever.

## O caso em que a lista ganha mesmo

Vale dizer para não virar dogma. Se o seu dado é pequeno, heterogêneo, ou se você
vai mesmo processar item a item em Python — validar strings, montar dicionários,
tomar decisão por elemento — a lista é a estrutura certa, e o numpy só acrescenta
custo de conversão.

O numpy é uma ferramenta para **mover o laço para fora do Python**. Quando o laço
precisa ficar no Python, ele não tem o que oferecer.

## O que isso tem a ver com as outras partes

As quatro partes desta série acabam no mesmo lugar, o que não era óbvio quando
comecei.

A [parte 1](/2026/09/triade-undefined-behavior/) mostrou o C otimizando com base
em premissas que o programador não sabia ter assinado. A
[parte 2](/2026/09/triade-por-que-o-c-sustenta-tudo/) mostrou que a fronteira
existe porque a ABI do C virou o único vocabulário comum entre linguagens. A
[parte 3](/2026/09/triade-custo-da-fronteira/) mediu o preço fixo de atravessá-la,
e mostrou que ele domina quando o trabalho é pequeno. Esta mostra a mesma conta
aparecendo numa biblioteca que quase todo mundo usa, com o sinal invertido.

Em todas as quatro, o erro não vem de escrever código ruim. Vem de **não saber
onde está a fronteira** — entre o que a linguagem garante e o que ela presume, ou entre
o que roda no interpretador e o que roda embaixo dele.

## Referências

- [NumPy internals](https://numpy.org/doc/stable/dev/internals.html) — o layout do `ndarray` e o que é contíguo
- [Broadcasting](https://numpy.org/doc/stable/user/basics.broadcasting.html) — como escrever a operação sem laço
- [Why NumPy is fast](https://numpy.org/doc/stable/user/whatisnumpy.html#why-is-numpy-fast) — a explicação oficial, que cita vetorização antes de linguagem
