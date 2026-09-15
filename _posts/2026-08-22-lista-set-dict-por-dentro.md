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

## Quais são os tipos compostos

Este texto trata dos tipos que guardam **uma coleção**, e não um valor — os
escalares ficam [no outro](/2026/08/tipos-em-python-por-dentro/). São oito
embutidos, e organizá-los por quatro propriedades já resolve a maior parte das
dúvidas de escolha:

| Tipo | Categoria | Vazio | Mutável | Ordenado | Hashável |
|---|---|---|---|---|---|
| `list` | sequência | 56 B | sim | sim | não |
| `tuple` | sequência | 40 B | não | sim | **sim** |
| `dict` | mapa | 64 B | sim | por inserção | não |
| `set` | conjunto | 216 B | sim | **não** | não |
| `frozenset` | conjunto | 216 B | não | **não** | **sim** |
| `bytes` | sequência | 33 B | não | sim | **sim** |
| `bytearray` | sequência | 56 B | sim | sim | não |
| `range` | sequência | 48 B | não | sim | **sim** |

A coluna que mais decide é a última. **Hashável é o que pode ser chave de dict ou
elemento de set** — e, entre os embutidos, hashável é exatamente o que é
imutável. O motivo é direto: a posição de um objeto na tabela vem do hash dele;
se o objeto mudasse, a posição ficaria errada e o valor sumiria.

E a propriedade é **recursiva**, o que pega muita gente:

```python
>>> {(1, 2): 'ok'}          # tupla de imutáveis: funciona
>>> {(1, [2]): 'erro'}
TypeError: unhashable type: 'list'
```

A tupla é imutável, mas ela contém uma lista que não é — então a tupla inteira
deixa de ser hashável.

Vale reparar também no `range`, que é o estranho da tabela: ele é uma sequência
que **não guarda os elementos**. Só o início, o fim e o passo.

```python
>>> sys.getsizeof(range(1_000_000))
48
>>> sys.getsizeof(list(range(1_000_000)))
8000056
```

Quarenta e oito bytes contra oito megabytes, para a mesma sequência. É por isso
que `for i in range(n)` nunca é o problema de memória do seu laço.

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

A consequência prática é sobre **forma**: o ganho vem de as instâncias terem o
mesmo conjunto de chaves. Quando uma classe produz objetos de formatos
diferentes — atributos atribuídos condicionalmente, fora do `__init__` — o
compartilhamento se desfaz.

Medi o tamanho disso, porque a versão que se costuma repetir ("nunca atribua
atributo fora do `__init__`") é forte demais: uma exceção em mil instâncias não
mudou nada, metade delas custou 13% a mais, e cinquenta formatos distintos
quase triplicaram o consumo. Os números estão [logo
abaixo](#oito-casos-de-canto-todos-medidos). O que pesa é heterogeneidade em
escala, não o caso isolado.

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

## Oito casos de canto, todos medidos

Cada um destes é consequência direta do layout descrito acima — e todos eu rodei
antes de escrever.

### 1. Apagar e reinserir manda a chave para o fim

```python
>>> d = {'a': 1, 'b': 2, 'c': 3}
>>> del d['b']; d['b'] = 9
>>> list(d)
['a', 'c', 'b']
```

O `dk_entries` é denso e preenchido em sequência. Uma entrada apagada não deixa
buraco para ser reocupado na mesma posição: a chave nova é **acrescentada no
fim**. Quem usa dict como registro ordenado e atualiza uma chave apagando e
reinserindo perde a posição sem aviso.

### 2. Dict não encolhe quando você apaga

```python
>>> d = {i: i for i in range(1000)}   # 36.952 bytes
>>> for i in range(999): del d[i]
>>> sys.getsizeof(d)                  # 36.952 bytes, com 1 item
```

Um dict novo com um item ocupa 224 bytes. Este ocupa 36.952 — **165 vezes mais**
— e continua assim depois de uma inserção. O redimensionamento para baixo só
acontece em condições específicas, então um dict que já foi grande continua
grande. Se você usa um dict como cache que esvazia, crie um novo em vez de
limpar o antigo.

### 3. Set de inteiros pequenos parece ordenado

```python
>>> list({3, 1, 2})
[1, 2, 3]
>>> list({100, 1, 50})
[1, 50, 100]
```

Parece que set ordena. Não ordena. É que `hash(n) == n` para inteiro pequeno, e
a posição na tabela é o hash módulo o tamanho — então eles caem em ordem
crescente por acidente. Ponha um inteiro grande ou uma string no meio e a
ilusão desaparece.

De quebra, um detalhe: `hash(-1)` é **-2**, não -1, porque -1 é reservado para
sinalizar erro na API C.

### 4. Set de strings muda de ordem a cada processo

```
$ python3 -c "print(list({'alfa','beta','gama','delta'}))"
['beta', 'alfa', 'delta', 'gama']
$ python3 -c "print(list({'alfa','beta','gama','delta'}))"
['alfa', 'delta', 'beta', 'gama']
```

Mesmo código, mesma máquina, ordens diferentes. O hash de string é aleatorizado
por processo desde o 3.3, como defesa contra ataque de colisão. Teste que depende
da ordem de um set de strings passa na sua máquina e falha na CI, ou vice-versa —
e só às vezes.

### 5. Chave cujo hash muda: o valor some sem erro

```python
>>> class Chave:
...     def __init__(s, v): s.v = v
...     def __hash__(s): return hash(s.v)
...     def __eq__(s, o): return s.v == o.v
>>> k = Chave(1); d = {k: 'guardado'}
>>> k.v = 2
>>> k in d
False
>>> len(d), list(d.values())
(1, ['guardado'])
```

O valor continua lá, contado no `len`, visível no `values()` — e **inalcançável
pela chave**. Nenhuma exceção. É a razão técnica pela qual chave de dict deve ser
imutável, e o modo de falha é silencioso: você não perde o dado, perde o caminho
até ele.

### 6. Três chaves diferentes viram uma

```python
>>> {1: 'int', 1.0: 'float', True: 'bool'}
{1: 'bool'}
```

Como `1 == 1.0 == True` e os três têm o mesmo hash, são a **mesma chave**. E
repare no resultado: a chave que fica é a **primeira** (o `1`, do tipo `int`), o
valor que fica é o **último**. Inserir não substitui a chave, só o valor.

O mesmo vale para `{0.0: 'a', -0.0: 'b'}` — uma entrada só.

### 7. O primeiro item de um dict custa 160 bytes

```python
>>> sys.getsizeof({})       # 64
>>> sys.getsizeof({1: 1})   # 224
```

O dict vazio é só o cabeçalho; a tabela é alocada na primeira inserção. Em código
que cria milhões de dicts pequenos, a diferença entre vazio e com-um-item é o que
domina o consumo.

### 8. `__slots__` corta 38%, e formas heterogêneas custam o triplo

Medindo com `tracemalloc` a criação de 20 mil instâncias, sem tocar no
`__dict__`:

| Classe | Por objeto |
|---|---|
| 3 atributos no `__init__` | 104,8 B |
| os mesmos 3, com `__slots__` | **64,6 B** |
| 50 conjuntos de chaves diferentes | **296,9 B** |

O `__slots__` elimina o dicionário por completo. E o último caso mostra o custo
real de sair do padrão: quando as instâncias deixam de ter a mesma forma, o
compartilhamento de chaves acaba e o consumo quase triplica. Um punhado de
exceções não pesa — medi um em mil e não mudou nada. O que pesa é heterogeneidade
em escala.

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
