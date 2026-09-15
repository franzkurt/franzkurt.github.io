---
title: "Lista, set ou dict: o que o CPython faz por baixo, e como isso mudou"
date: 2026-08-22 10:00:00 -0300
tags: [python, cpython, internals, estrutura-de-dados, performance]
description: "Os mesmos mil números custam 8 KB numa lista e 36 KB num dict. A escolha entre as três não é estilo — e o dict de hoje não se parece com o de antes do 3.6, quando deixou de ser uma tabela esparsa e virou índice mais array denso."
---

Guarde os números de 0 a 999 nas quatro estruturas embutidas e meça:

```python
>>> import sys
>>> r = range(1000)
>>> sys.getsizeof(tuple(r)),  sys.getsizeof(list(r))
(8040, 8056)
>>> sys.getsizeof(set(r)),    sys.getsizeof({i: None for i in r})
(32984, 36952)
```

Mesmo conteúdo, **quatro vezes mais memória** no set e no dict. Não é
desperdício: é o preço da busca em tempo constante, e saber de onde ele vem muda
a escolha.

Este texto é sobre as três estruturas por dentro — e sobre como o dict mudou de
forma no Python 3.6, de um jeito que reduziu o tamanho dele e, de quebra, deu
ordem de inserção a todo mundo.

<!--more-->

## Lista: um array de ponteiros que cresce devagar

Uma lista Python não guarda os seus objetos. Guarda **ponteiros** para eles, num
array contíguo. Por isso indexar é constante e por isso `insert(0, x)` é linear:
é preciso empurrar todos os ponteiros uma posição.

A parte interessante é como ela cresce. Em
[`Objects/listobject.c`](https://github.com/python/cpython/blob/main/Objects/listobject.c),
a realocação é:

```c
new_allocated = ((size_t)newsize + (newsize >> 3) + 6) & ~(size_t)3;
```

O comentário logo acima diz o resultado:

> `The growth pattern is: 0, 4, 8, 16, 24, 32, 40, 52, 64, 76, ...`

É `n + n/8`, ou seja, **crescimento de 12,5%** — não o dobro, que é o que a
maioria das linguagens faz. Dá para conferir medindo onde a lista realoca:

```python
>>> l = []; ant = sys.getsizeof(l)
>>> for i in range(1, 130):
...     l.append(i)
...     if sys.getsizeof(l) != ant: print(i, end=' '); ant = sys.getsizeof(l)
1 5 9 17 25 33 41 53 65 77 93 109
```

Capacidades 4, 8, 16, 24, 32, 40, 52, 64, 76, 92, 108, 128 — exatamente a
sequência do comentário.

Crescer 12,5% em vez de 100% desperdiça muito menos memória no caso comum, ao
custo de realocar mais vezes. Como a realocação costuma ser um `realloc` que
frequentemente estende o bloco no lugar, a troca compensa. O `append` continua
sendo O(1) amortizado.

## Dict: a mudança de forma de 2016

Esta é a parte que mais gente sabe pela metade.

**Como era, até o Python 3.5.** Uma tabela hash clássica: um array esparso de
entradas, cada entrada com `(hash, chave, valor)` — 24 bytes. O hash da chave
dava a posição, e como a tabela tinha que ficar com folga para evitar colisões,
**a maioria dos slots era vazia**. Uma tabela com 8 posições e 5 chaves pagava
8 × 24 bytes, com 3 × 24 jogados fora. Em tabelas grandes, o desperdício
dominava.

**Como é, desde o 3.6.** O comentário no topo de
[`Objects/dictobject.c`](https://github.com/python/cpython/blob/main/Objects/dictobject.c)
descreve o novo formato:

```
+---------------------+
| dk_indices[]        |   <- a tabela hash de verdade
+---------------------+
| dk_entries[]        |   <- array denso, na ordem de inserção
+---------------------+
```

A tabela esparsa deixou de guardar as entradas e passou a guardar **índices**
para elas. As entradas, que são a parte cara, foram para um array **denso** —
sem buracos, preenchido em ordem de inserção.

O ganho está no que ficou esparso. O array de índices é só um número, e o CPython
usa o menor tipo que couber:

| Tamanho da tabela | Tipo do índice |
|---|---|
| até 128 | `int8` (1 byte) |
| 256 a 2¹⁵ | `int16` |
| 2¹⁶ a 2³¹ | `int32` |
| acima de 2³² | `int64` |

Então o desperdício por slot vazio caiu de 24 bytes para **1 byte** num dict
pequeno. É daí que vêm os 20 a 25% de economia que se cita sobre o 3.6.

Duas outras coisas que valem saber do mesmo arquivo: a tabela cresce quando passa
de **dois terços** de ocupação — `#define USABLE_FRACTION(n) (((n) << 1)/3)` — e
um slot apagado não volta a ser "nunca usado", vira **dummy** (`DKIX_DUMMY`),
porque senão a sequência de sondagem de uma colisão não teria como saber que ali
já houve algo.

## A ordem foi um efeito colateral

Repare que ninguém projetou o dict ordenado. O `dk_entries` é denso e preenchido
em sequência **porque é assim que se economiza memória**; iterar por ele na ordem
em que foi preenchido é simplesmente o jeito mais barato de iterar.

A ordem de inserção caiu no colo.

Por isso a história tem dois passos, e a distinção importa:

- **3.6** — o dict passa a preservar ordem, e isso é documentado como **detalhe
  de implementação**. Não confie.
- **3.7** — a preservação da ordem vira **garantia da linguagem**. Agora confie.

Quem escreveu código dependendo da ordem em 3.6 estava certo por acidente. A
partir do 3.7, está certo por contrato.

E o efeito se espalhou para lugares que ninguém associa a dicionário. No mesmo
3.6, `**kwargs` passou a preservar a ordem dos argumentos
([PEP 468](https://peps.python.org/pep-0468/)) e o corpo de uma classe passou a
preservar a ordem em que os atributos aparecem no arquivo
([PEP 520](https://peps.python.org/pep-0520/)). Os dois são o mesmo dict por
baixo — ganharam ordem de graça, junto.

## Dicionários de instância: três gerações

O `__dict__` de um objeto é onde essa otimização mais rendeu, porque um programa
típico cria milhares de instâncias da mesma classe — todas com **as mesmas
chaves**.

- **3.3 ([PEP 412](https://peps.python.org/pep-0412/))** — *key-sharing
  dictionaries*. Instâncias da mesma classe passam a compartilhar um único array
  de chaves; cada objeto guarda só os valores. O `dictobject.c` ainda chama isso
  de *split table*: `ma_values != NULL`, só chaves string permitidas.
- **3.11** — os valores vão para **dentro do próprio objeto**, num pré-cabeçalho,
  e o `__dict__` só é **materializado quando alguém o pede**. O CPython documenta
  isso em
  [`Objects/object_layout.md`](https://github.com/python/cpython/blob/main/Objects/object_layout.md).
  Acesso a atributo fica num deslocamento fixo, e objetos que nunca tocam em
  `__dict__` nunca pagam por ele.

A consequência prática é boa e pouco divulgada: **atribuir atributos fora do
`__init__` custa caro**. Se todas as instâncias têm o mesmo conjunto de chaves,
elas compartilham; se uma delas ganha um atributo extra depois, ela sai do
esquema compartilhado e passa a carregar um dicionário próprio.

## Set: parece dict, mas foi projetado para outra pergunta

Um set não é um dict sem valores. O
[`Objects/setobject.c`](https://github.com/python/cpython/blob/main/Objects/setobject.c)
explica no topo por que divergiram, e o motivo é ótimo:

> *Use cases for sets differ considerably from dictionaries where looked-up keys
> are more likely to be present. In contrast, sets are primarily about membership
> testing where the presence of an element is not known in advance. Accordingly,
> the set implementation needs to optimize for both the found and not-found
> case.*

Quando você faz `d[k]`, provavelmente `k` existe. Quando você faz `x in s`,
provavelmente você não sabe — e o caso "não está" precisa ser tão rápido quanto o
caso "está".

Daí duas escolhas diferentes do dict:

**Sondagem híbrida** (*probing*). O set tenta até **9 posições consecutivas** antes de pular
para outro lugar da tabela (`#define LINEAR_PROBES 9`). Acessos consecutivos à
memória são muito mais baratos que espalhados, então varrer nove vizinhos custa
menos que nove saltos aleatórios. Depois desses nove, ele usa os bits altos do
hash num gerador congruencial linear, para quebrar cadeias longas de colisão.

**Crescimento agressivo.** Quando precisa redimensionar:

```c
set_table_resize(so, so->used > 50000 ? so->used * 2 : so->used * 4);
```

Quadruplica enquanto é pequeno, dobra depois de 50 mil elementos. Set pequeno
fica esparso de propósito, porque a memória é barata nesse tamanho e a colisão
não é.

E o set **não** ganhou o formato compacto do dict. Ele guarda as entradas
diretamente na tabela esparsa. Por isso set não tem ordem, nunca teve, e
`{'a','b','c'}` pode iterar em qualquer sequência — inclusive diferente entre
execuções, porque o hash de strings é aleatorizado por processo desde o 3.3.

## Qual usar

Com o que está acima, a escolha para de ser preferência:

| Se você precisa de | Use | Por quê |
|---|---|---|
| ordem, índice, duplicatas | `list` | array de ponteiros, o mais barato por elemento |
| sequência fixa, usável como chave | `tuple` | igual à lista, sem a folga de crescimento |
| perguntar "está aí?" muitas vezes | `set` | O(1) e projetado para o caso "não está" |
| associar chave a valor | `dict` | O(1) e ordenado por inserção desde o 3.7 |
| remover duplicatas mantendo ordem | `dict.fromkeys()` | usa a ordem garantida; o set perderia |

Duas armadilhas que a implementação explica:

**`x in lista` é O(n).** Parece igual a `x in set`, e é linear. Num laço, vira
quadrático — é o mesmo defeito do N+1, com outra roupa. Se a lista é consultada
mais de uma vez, converta para set antes.

**Set e dict custam ~4× a lista** para o mesmo conteúdo. Se você só vai iterar,
a lista ganha por larga margem. A folga da tabela hash é o que você paga pela
busca constante, e só compensa se você de fato buscar.

## A linha do tempo

| Versão | O que mudou |
|---|---|
| 3.3 | Key-sharing dicts (PEP 412); aleatorização de hash de string por padrão |
| 3.6 | Dict compacto: índices + entradas densas. Ordem aparece como detalhe |
| 3.7 | Ordem de inserção vira **garantia da linguagem** |
| 3.11 | Valores de instância inline no objeto; `__dict__` materializado sob demanda |
| 3.12+ | Objetos imortais e adaptações para o build sem GIL |

Vale reparar no padrão: quase toda mudança dessa lista foi feita por **memória**,
e a velocidade veio junto de graça — menos bytes significa mais coisa dentro do
cache do processador. E a mudança mais visível para quem escreve Python, a ordem
do dict, ninguém projetou: ela caiu do layout.
