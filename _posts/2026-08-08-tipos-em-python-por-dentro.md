---
title: "Tipos e estruturas, parte 1: o que o CPython faz com x = 1"
date: 2026-08-08 10:00:00 -0300
tags: [python, cpython, internals, tipagem, performance]
description: "Um int pequeno não é criado quando você escreve 1 — ele já existe desde o boot do interpretador. Por que o cache vai até 256 hoje e até 1024 no main, o que é um objeto imortal, e por que anotação de tipo não tem relação com nada disso."
---

*Série em quatro partes: **1.** [os tipos escalares por dentro](/2026/08/tipos-em-python-por-dentro/) · **2.** [as estruturas de dados](/2026/08/lista-set-dict-por-dentro/) · **3.** [como declarar o que sua função aceita](/2026/08/type-hints-aceite-o-geral-devolva-o-especifico/) · **4.** [o decorador que apaga os seus tipos](/2026/09/tipos-parte-4-o-decorador-que-apaga-seus-tipos/).*

Existem duas coisas diferentes chamadas "tipo" em Python, e confundi-las é a
origem de metade dos mal-entendidos sobre a linguagem.

A primeira é o **tipo em tempo de execução**: todo objeto carrega um ponteiro
para o seu tipo, e é isso que decide o que `+` faz. A segunda é a **anotação de
tipo**: `def f(x: int) -> str`, que o interpretador guarda e **não usa para
nada**. Este texto trata das duas, na ordem — e a parte interessante é que a
segunda não afeta a primeira em ponto algum.

Vou ao código do CPython onde for possível, porque a maior parte das surpresas
do dia a dia é consequência direta de decisões de implementação que estão lá,
escritas e comentadas.

<!--more-->

## Quais são os tipos não-compostos

Antes de descer ao CPython, vale delimitar o terreno. Este texto trata dos tipos
que **não são contêineres** — os que guardam um valor, não uma coleção. Lista,
dict e set ficam [no outro texto](/2026/08/lista-set-dict-por-dentro/), porque as
decisões de implementação deles são de outra natureza.

São estes, com o custo mínimo medido num Python de 64 bits:

| Tipo | Vazio/zero | Mutável? | Observação |
|---|---|---|---|
| `NoneType` | 16 B | não | singleton; 16 B é só o cabeçalho |
| `bool` | 28 B | não | subclasse de `int`; só existem dois |
| `int` | 28 B | não | tamanho variável, sem limite |
| `float` | 24 B | não | IEEE 754 de dupla precisão |
| `complex` | 32 B | não | dois `double` |
| `str` | 41 B | não | largura por caractere varia |
| `bytes` | 33 B | não | sequência de octetos |
| `bytearray` | 56 B | **sim** | o único mutável da lista |
| `Ellipsis`, `NotImplemented` | 16 B | não | singletons, como `None` |

Duas coisas para reter dessa tabela.

**Quase tudo aqui é imutável.** A única exceção é `bytearray`. Isso não é
detalhe estético: imutabilidade é o que permite compartilhar objetos entre
referências sem risco, e é a base de tudo o que vem a seguir — se `1` pudesse ser
alterado, o cache de inteiros seria impossível.

**`None` custa 16 bytes e não guarda nada.** Esses 16 bytes são o cabeçalho e
mais nada; não há payload. É o piso de qualquer objeto no CPython.

E há uma escada entre os numéricos que o Python trata como um tipo só para fins
de comparação:

```python
>>> 1 == 1.0 == (1+0j)
True
>>> hash(1) == hash(1.0) == hash(1+0j)
True
```

Guarde esse `hash` igual — ele reaparece mais adiante, causando estrago.

## Todo objeto tem um cabeçalho

No CPython, "tudo é objeto" tem um significado literal: existe uma struct em C, e
tudo herda dela. Em
[`Include/object.h`](https://github.com/python/cpython/blob/main/Include/object.h):

```c
struct _object {
    ...
    uint32_t ob_refcnt;     /* quantas referências apontam para cá */
    PyTypeObject *ob_type;  /* qual é o tipo deste objeto */
};
```

Dois campos: **quantas referências existem** e **qual é o tipo**. Um `int`, uma
lista, uma função, uma classe, o próprio objeto-tipo `int` — todos começam com
isso. Tipo, em Python, é um ponteiro dentro do objeto, não um rótulo que o
compilador conhece e descarta.

É por isso que `type(x)` é barato e `isinstance` funciona em qualquer coisa: a
informação está no objeto, sempre, em tempo de execução.

## `x = 1` não cria um 1

Aqui começa a parte que surpreende. Rode isto:

```python
>>> a = 256
>>> b = 256
>>> a is b
True
>>> a = 257
>>> b = 257
>>> a is b
False
```

Dois nomes apontam para o **mesmo objeto** quando o valor é 256, e para objetos
diferentes quando é 257. Não é bug, não é otimização acidental do REPL: é um
cache declarado na fonte.

Em
[`Include/internal/pycore_runtime_structs.h`](https://github.com/python/cpython/blob/main/Include/internal/pycore_runtime_structs.h):

```c
#define _PY_NSMALLPOSINTS           1025
#define _PY_NSMALLNEGINTS           5
...
PyLongObject small_ints[_PY_NSMALLNEGINTS + _PY_NSMALLPOSINTS];
```

O interpretador pré-aloca esses inteiros no boot e os devolve prontos. Criar o
número 7 não aloca memória: devolve um ponteiro para um objeto que já estava lá.
Em [`Objects/longobject.c`](https://github.com/python/cpython/blob/main/Objects/longobject.c)
é literalmente uma indexação de array:

```c
return (PyObject *)&_PyLong_SMALL_INTS[_PY_NSMALLNEGINTS + ival];
```

## 256 ou 1024? Depende de quando você lê isto

Repare no `1025` acima e no `256` do exemplo. Os dois estão certos, em versões
diferentes — e essa divergência é recente:

| Versão | `_PY_NSMALLPOSINTS` | Faixa cacheada |
|---|---|---|
| 3.12, 3.13, 3.14 | 257 | −5 a 256 |
| `main` (será 3.15) | **1025** | **−5 a 1024** |

A mudança entrou em setembro de 2025, no commit
[`7ce25edb8f`](https://github.com/python/cpython/commit/7ce25edb8f), pela
[issue gh-133059](https://github.com/python/cpython/issues/133059). E o que torna
essa issue boa de ler é que a decisão foi **medida**, não argumentada.

A proposta mostra o efeito de aumentar o cache no pyperformance, faixa por faixa:

- **1024** → 10% mais rápido em `regex_v8`
- **2048** → soma 4% em `regex_dna` e 8% em `regex_effbot`
- **8192** → soma de 4 a 11% em `genshi`, `regex_compile`, `scimark`,
  `spectral_norm`, `xml` e outros
- **100 mil** → soma 9% em `scimark_monte_carlo` e 12% em `spectral_norm`

Ou seja: quanto maior, melhor — e a pergunta deixa de ser técnica e vira de
projeto. Cada inteiro cacheado é um objeto pré-alocado que existe **em todo
processo Python**, use-se ou não. Pararam em 1024 porque cobre o uso cotidiano e
parsing iterativo sem cobrar memória de quem nunca vai passar de 100.

A lição que eu tiro daí não é sobre inteiros. É que a escolha entre 1024 e 100 mil
não tem resposta certa em abstrato: depende de qual população de programas você
está otimizando, e isso só aparece quando alguém mede os dois.

## Objetos imortais

Faça esta medição na sua máquina, com Python 3.12 ou mais novo:

```python
>>> import sys
>>> sys.getrefcount(1)
4294967295
>>> sys.getrefcount(257)
4
```

Quatro bilhões de referências para o número 1. Isso é a
[PEP 683](https://peps.python.org/pep-0683/), dos **objetos imortais**, entregue
no 3.12: objetos que existem durante toda a vida do interpretador recebem um
refcount saturado, e as operações de incremento e decremento simplesmente **não
mexem nele**.

Repare onde a fronteira cai: `1` é imortal, `257` não. É exatamente o limite do
cache — o que é imortal é o que foi pré-alocado.

O motivo não é economizar as instruções de soma. É o *free threading*. Com o GIL
removido, cada incremento de refcount em `None` ou em `True` seria uma escrita
atômica numa linha de cache disputada por todas as threads do processo —
exatamente o padrão que destrói escalabilidade. Tornar esses objetos imortais
elimina a escrita.

## O cabeçalho ficou mais complicado por causa disso

Aquele struct que mostrei no começo é a versão simplificada. No build sem GIL, o
cabeçalho em `object.h` é outro:

```c
struct _object {
    uintptr_t ob_tid;           /* thread dona do objeto */
    uint16_t ob_flags;
    PyMutex ob_mutex;           /* trava por objeto */
    uint8_t ob_gc_bits;
    uint32_t ob_ref_local;      /* contagem local */
    Py_ssize_t ob_ref_shared;   /* contagem compartilhada, atômica */
    PyTypeObject *ob_type;
};
```

São **duas** contagens de referência. A thread que criou o objeto incrementa
`ob_ref_local` sem sincronização nenhuma, porque ninguém mais toca ali; só as
outras threads pagam o custo atômico, em `ob_ref_shared`. Chama-se *biased
reference counting*, e existe porque a esmagadora maioria dos objetos é
manipulada só por quem os criou.

Vale reter: a remoção do GIL não foi só tirar uma trava. Mudou o cabeçalho de
todo objeto do interpretador.

## Como um inteiro cresce

Python não tem overflow porque `int` não tem tamanho fixo. Ele é um array de
dígitos de **30 bits**, e dá para ver a fronteira medindo:

```python
>>> sys.getsizeof(2**29)
28
>>> sys.getsizeof(2**30)
32
```

Vinte e oito bytes até `2**29`, trinta e dois a partir de `2**30` — quatro bytes
a mais, um dígito a mais, exatamente onde 30 bits se esgotam. Continua assim:
`2**300` ocupa 68 bytes.

Aqueles 28 bytes iniciais, aliás, são quase todos cabeçalho. O número em si são 4
bytes; o resto é refcount, ponteiro de tipo e tamanho. Uma lista de um milhão de
inteiros pequenos não custa 4 MB: custa o array de ponteiros mais os objetos — e
se forem todos menores que 1024, os objetos já existem e você paga só os
ponteiros.

## Duas heranças que explicam bugs

**`bool` é subclasse de `int`.** Não "se comporta como": é.

```python
>>> True + True
2
>>> isinstance(True, int)
True
>>> [1, 2, 3][True]
2
```

Por isso `sum([True, False, True])` devolve 2, e por isso uma flag booleana usada
como índice não levanta erro — indexa a posição 1.

**Strings literais são internadas, construídas não.**

```python
>>> a = 'ola_mundo'; b = 'ola_mundo'
>>> a is b
True
>>> c = ''.join(['ola', '_mundo'])
>>> a is c
False
>>> a is sys.intern(c)
True
```

O compilador interna literais que parecem identificadores, para que a comparação
de nomes de atributo seja um teste de ponteiro em vez de comparação de bytes. Mas
string montada em tempo de execução não passa por isso. É a razão pela qual
comparar strings com `is` funciona nos seus testes e falha em produção, quando o
valor chega da rede.

## A outra tipagem: anotações

Tudo acima é o sistema de tipos que **executa**. Agora a outra coisa que também
se chama tipo, e que não toca em nada disso.

```python
def f(x: int) -> str:
    return x
```

Isso roda. Devolve um `int` onde a anotação promete `str`, e o interpretador não
reclama — porque a anotação é só um objeto guardado num dicionário. A
[PEP 484](https://peps.python.org/pep-0484/), do 3.5, foi explícita: anotações
são para ferramentas externas, e o runtime não as verifica.

O histórico dessa área é uma boa aula de projeto de linguagem, porque a primeira
solução foi revertida:

- **3.5 (PEP 484)** — a sintaxe de anotação, avaliada na hora da definição.
- **3.7 (PEP 563)** — `from __future__ import annotations` transforma toda
  anotação em **string**. Resolveu referência para frente (`def f() -> "Arvore"`)
  e o custo de avaliar tipos caros na importação. Mas quebrou quem lê anotações em
  tempo de execução — Pydantic, FastAPI, dataclasses — que passaram a receber
  texto e ter que reavaliar.
- **3.14 (PEP 649 + 749)** — a solução que ficou: a anotação continua sendo
  **código de verdade**, só que o compilador gera uma função `__annotate__` que é
  chamada na **primeira vez que alguém lê** as anotações. Referência para frente
  funciona, custo de importação some, e quem lê em runtime recebe objetos, não
  strings.

O `from __future__ import annotations` ainda funciona no 3.14, mas está em
caminho de descontinuação. E a PEP 749 trouxe o módulo `annotationlib` para
inspecionar anotações sob o novo modelo, que é o que bibliotecas devem usar em vez
de ler `__annotations__` na mão.

## Os casos de canto

Cada afirmação deste texto tem um caso de canto que a demonstra — a fronteira
assimétrica do cache, a dobra de constantes que faz o exemplo do 257 só valer no
REPL, um emoji que quadruplica uma string. Reuni os sete daqui com os oito do
texto sobre estruturas de dados em
[Quinze casos de canto do Python, todos medidos](/2026/08/casos-de-canto-do-python/).

## O que fica

Três coisas que eu levaria deste texto para o trabalho:

**`is` não é `==`, e a diferença é visível para números pequenos.** O cache torna
`a is b` verdadeiro até 256 — ou 1024, dependendo da versão — e falso depois.
Código que usa `is` para comparar valor funciona por acidente e falha quando o
número cresce. Use `is` só para `None` e singletons.

**Otimização de interpretador se decide medindo.** O cache foi de 257 para 1025
porque alguém rodou o pyperformance faixa por faixa e mostrou onde o ganho
aparecia. A discussão inteira está aberta, numerada e pública.

**As duas tipagens não se encontram.** A anotação não acelera nada, não valida
nada e não muda a representação de nenhum objeto. Ela serve a ferramentas — e
serve bem, mas por um caminho que passa longe do interpretador.

## Referências

- [`Objects/longobject.c`](https://github.com/python/cpython/blob/main/Objects/longobject.c) — o inteiro de tamanho arbitrário e os dígitos de 30 bits
- [`pycore_runtime_structs.h`](https://github.com/python/cpython/blob/main/Include/internal/pycore_runtime_structs.h) — onde `_PY_NSMALLPOSINTS` é definido, hoje em 1025
- [PEP 683 — Immortal Objects](https://peps.python.org/pep-0683/) — os objetos que não têm contagem de referência
- [PEP 484 — Type Hints](https://peps.python.org/pep-0484/) — a origem das anotações
- [PEP 563](https://peps.python.org/pep-0563/), [PEP 649](https://peps.python.org/pep-0649/) e [PEP 749](https://peps.python.org/pep-0749/) — a longa discussão sobre quando a anotação é avaliada
- [`sys.getsizeof`](https://docs.python.org/3/library/sys.html#sys.getsizeof) — o que ele mede, e o que não mede
