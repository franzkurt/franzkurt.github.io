---
title: "Python por dentro, parte 6: o que os projetistas realmente escreveram"
date: 2025-07-12 10:00:00 -0300
tags: [python, cpython, internals, design, história]
description: "Fui às fontes primárias — o blog do Guido, o FAQ oficial, as listas — conferir cinco explicações que todo mundo repete sobre por que o Python é assim. Nenhuma das cinco bate com o que foi de fato escrito."
---

*Esta é uma série sobre o funcionamento interno do Python. Se os termos
**token**, **bytecode**, **opcode** ou **pilha** não forem familiares, a
[parte 0](/2025/05/python-por-dentro-parte-0-o-mapa/) apresenta todos eles em
linguagem simples, e é o ponto de partida recomendado.*

Na [parte 2](/2025/06/python-por-dentro-maquina-de-pilha/) desta série eu fui
medir uma explicação que se repete em toda parte — a de que bytecode de máquina
de pilha é mais compacto que o de registradores — e ela quase empatou. A
justificativa folclórica não sobreviveu à régua.

Isso me deixou com uma pergunta incômoda: **quantas das outras explicações que eu
repito são folclore?**

Então fui às fontes primárias. O blog pessoal do Guido van Rossum, o FAQ oficial
de projeto da linguagem, as listas de discussão. Cinco casos, e em nenhum dos
cinco a explicação corrente é a que os projetistas escreveram.

<!--more-->

## 1. Por que não há eliminação de chamada de cauda

**O que se repete:** que o Guido não gosta de programação funcional.

**O que ele escreveu**, em dois posts de abril de 2009 no blog dele, é bem mais
específico — e nem fala de gosto:

> A eliminação de rastreamentos de pilha para algumas chamadas e não para outras
> certamente confundiria muitos usuários, que não foram criados na religião das
> chamadas de cauda, mas podem ter aprendido a semântica de chamada percorrendo
> algumas delas num depurador.

O argumento é de **depuração**, não de paradigma. Quando o frame some, some junto
a informação de que aquele caminho foi tomado — e quem estiver no depurador
dentro da função chamada não tem como saber de onde veio.

E há um segundo argumento, que eu nunca tinha visto citado:

> Espero que em muitos casos as chamadas de cauda não sejam de natureza recursiva
> [...] então a eliminação de frames não faz nada pela complexidade algorítmica
> do código, mas torna a depuração mais difícil.

Ou seja: para a maioria das chamadas de cauda, não há ganho de complexidade a
perder — só se perde o rastreamento.

Mas o que eu achei mais interessante foi outra coisa. No segundo post, ele
**revisa a própria posição**: reconhece que tinha confundido recursão de cauda
com chamadas de cauda em geral, e que eliminação de chamada de cauda é uma
**funcionalidade da linguagem**, não uma otimização. Manteve a decisão, com o
argumento corrigido.

Ver o projetista corrigir o próprio raciocínio no meio do debate, em público, é
mais instrutivo que a conclusão.

## 2. Por que `len(x)` e não `x.len()`

**O que se repete:** acidente histórico, resquício de antes de o Python ter
orientação a objetos direito.

**O que o FAQ oficial diz** são duas razões, e as duas são deliberadas:

> (a) Para algumas operações, a notação prefixa simplesmente lê melhor que a
> posfixa — operações prefixas (e infixas!) têm uma longa tradição em matemática,
> que gosta de notações em que o visual ajuda o matemático a pensar sobre o
> problema.

E a segunda, que é a boa:

> Quando leio código que diz `len(x)`, eu *sei* que está pedindo o comprimento de
> alguma coisa. Isso me diz duas coisas: o resultado é um inteiro, e o argumento
> é algum tipo de contêiner. Ao contrário, quando leio `x.len()`, eu preciso já
> saber que `x` é algum tipo de contêiner implementando uma interface [...]

O argumento é sobre **quanto contexto o leitor precisa ter**. `len(x)` é
informativo mesmo para quem não conhece a classe de `x`; `x.len()` só é
informativo para quem já conhece. E ele completa com o sintoma real: a confusão
que surge quando uma classe que não é um mapa tem um `get()` ou `keys()`, ou algo
que não é arquivo tem um `write()`.

## 3. Por que o `self` é explícito

**O que se repete:** verbosidade herdada, ou pureza — "explícito é melhor que
implícito".

O FAQ dá três razões, e a terceira é a que ninguém cita, porque é **sintática** e
não estética:

> Para variáveis de instância, isso resolve um problema sintático com atribuição:
> como variáveis locais em Python são (por definição!) aquelas às quais um valor é
> atribuído no corpo da função [...] tem que haver alguma forma de dizer ao
> interpretador que uma atribuição foi feita para uma variável de instância, e não
> para uma local.

Repare na consequência. Em Python, **o que define uma variável como local é a
atribuição** — não uma declaração. Então, sem o `self.`, escrever `x = 1` dentro
de um método seria ambíguo: criar uma local ou escrever no objeto? As outras
linguagens resolvem isso com declaração de variável; o Python resolveu com o
prefixo.

Não é gosto. É a consequência de uma decisão anterior sobre escopo.

## 4. Por que contagem de referências em vez de um coletor tradicional

**O que se repete:** que refcounting é mais simples, ou mais rápido.

**O que o FAQ diz** são duas razões, e nenhuma delas é desempenho:

> Para começar, isso não é um recurso padrão de C e portanto não é portável.

E a segunda, que explica um monte de coisa:

> Coletor tradicional também vira problema quando o Python é embutido em outras
> aplicações. [...] uma aplicação que embute o Python pode querer ter a *própria*
> substituição para `malloc()` e `free()`, e pode não querer a do Python. Hoje, o
> CPython funciona com qualquer coisa que implemente `malloc()` e `free()`
> corretamente.

A decisão foi tomada pensando em **quem embute o Python dentro de outro
programa** — um caso de uso que a maioria de quem escreve Python nunca encontra, e
que moldou o gerenciamento de memória da linguagem inteira.

## 5. Por que o GIL demorou tanto

**O que se repete:** que ninguém tentou, ou que havia resistência de princípio.

**O que aconteceu** é mais interessante, e tem data. Em 1999, Greg Stein removeu
o GIL do CPython substituindo-o por travas de granularidade fina. Funcionou — e
deixou o interpretador quase **duas vezes mais lento** em código de thread única.
Com dois processadores, a versão sem GIL mal fazia mais trabalho que a versão com
GIL num processador só.

Em 2007, o Guido publicou a condição, e ela não é uma recusa:

> Eu receberia bem um conjunto de patches no Py3k **somente se** o desempenho para
> um programa de thread única (e para um multi-thread mas limitado por E/S) **não
> diminuir**.

Isso muda a leitura inteira. Não era princípio: era um **critério de aceitação
publicado**, esperando quem o cumprisse. A resposta demorou dezesseis anos e veio
na forma da PEP 703 — que, entre outras coisas, precisou dos objetos imortais e da
contagem de referências enviesada que a
[parte 5](/2025/07/python-por-dentro-do-39-ao-313/) descreve, justamente para não
pagar o custo que derrubou a tentativa de 1999.

## O padrão

Colocando os cinco lado a lado, aparece uma coisa que eu não esperava.

**Quase nenhuma justificativa é sobre a máquina.** Chamada de cauda: depuração.
`len()`: quanto contexto o leitor precisa. `self`: ambiguidade sintática.
Refcounting: portabilidade e embutimento. GIL: não penalizar quem tem um programa
de thread única.

São argumentos sobre **pessoas** — quem lê, quem depura, quem embute, quem já tem
código rodando. E o folclore inverte isso sistematicamente: inventa razões de
desempenho para escolhas feitas por legibilidade, e razões de gosto para escolhas
feitas por restrição técnica.

Inclusive a da parte 2, que abriu este texto. A máquina de pilha não venceu por
ser mais compacta — venceu porque torna o compilador trivial, o que é um argumento
sobre quem mantém o CPython, não sobre o processador.

## O método, que vale mais que os cinco casos

O que eu levo desta série, mais que qualquer opcode: **a fonte primária está a uma
busca de distância, e quase sempre diz algo mais interessante que o resumo.**

O FAQ de projeto é um documento oficial, pesquisável, com as respostas escritas por
quem decidiu. As PEPs registram a discussão inteira, incluindo as objeções. Os
blogs e as listas têm o raciocínio em movimento — com o projetista mudando de
ideia no meio, que é onde mais se aprende.

Quando a explicação que você repete não tem uma fonte que você possa apontar, vale
desconfiar. Às vezes ela está certa. Nos cinco casos que eu conferi, nenhuma
estava.

## Referências

- [Neopythonic — Tail Recursion Elimination](http://neopythonic.blogspot.com/2009/04/tail-recursion-elimination.html) e [Final Words on Tail Calls](http://neopythonic.blogspot.com/2009/04/final-words-on-tail-calls.html), Guido van Rossum, abril de 2009
- [Design and History FAQ](https://docs.python.org/3/faq/design.html) — a fonte das respostas sobre `len()`, `self` e coletor de lixo
- [It isn't Easy to Remove the GIL](https://www.artima.com/weblogs/viewpost.jsp?thread=214235), Guido van Rossum, 2007
- [PEP 703 — Making the Global Interpreter Lock Optional](https://peps.python.org/pep-0703/)
