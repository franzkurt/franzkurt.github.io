---
title: "nan não é igual a nan, e mesmo assim está na lista"
date: 2026-09-17 10:00:00 -0300
tags: [python, operadores, casos-de-canto, tipos, engenharia]
description: "Cinco objetos de cinco tipos diferentes viram um só num set. Uma tupla imutável muda de conteúdo num erro. E sorted devolve uma lista fora de ordem sem avisar nada."
audio: /assets/audio/nan-nao-e-igual-a-nan.mp3
audio_duracao: "5:51"
---

O [texto anterior](/2026/09/por-que-1-and-2-and-3-devolve-3/) mostrou que os
operadores fazem exatamente o que prometem. Este é sobre o outro lado: os
**tipos** que fazem a promessa parecer quebrada.

Todos os casos abaixo foram medidos no Python 3.13.5, e a maioria não é bug de
canto nenhum — é consequência direta de decisões de projeto que valem para o
código que você escreve todo dia.

<!--more-->

## `bool` é um `int`, e isso vaza por tudo

Não é analogia. É herança:

```
>>> isinstance(True, int)
True
>>> True + True
2
>>> sum([True, True, False])
2
>>> -True
-1
```

`True` vale 1 e `False` vale 0, em qualquer lugar onde um número caiba. Isso é
útil — `sum(lista_de_condicoes)` conta quantas são verdadeiras — e é a origem de
vários casos adiante.

## Cinco tipos, uma chave só

Como `1 == True == 1.0`, e dicionários e conjuntos agrupam por igualdade, todos
eles são **a mesma chave**:

```
>>> {1: 'a', True: 'b'}
{1: 'b'}
>>> {0: 'a', False: 'b', 0.0: 'c'}
{0: 'c'}
>>> len({1, True, 1.0, Decimal(1), Fraction(1)})
1
```

Leia a última linha de novo. Cinco objetos, de cinco tipos diferentes, e o
conjunto tem **um** elemento.

E repare no detalhe do primeiro dicionário: o valor virou `'b'`, mas a chave
continuou sendo `1`, não `True`. Ao reencontrar uma chave igual, o dicionário
**atualiza o valor e mantém a chave original** — que é o comportamento que faz
`d[k] = v` num laço não trocar suas chaves por outras equivalentes.

A mesma regra vale no `in`:

```
>>> 1 in [True]
True
```

## `nan`, que não é igual a si mesmo

O ponto flutuante tem um valor que quebra a igualdade por definição do padrão
IEEE 754:

```
>>> nan = float("nan")
>>> nan == nan
False
```

Até aí é conhecido. O que surpreende é o próximo:

```
>>> nan in [nan]
True
>>> [nan] == [nan]
True
```

Se `nan != nan`, como ele está na lista? Porque `in` e a comparação de listas
conferem **identidade antes de igualdade**. É o mesmo atalho que faz uma
[lista que contém a si mesma](/2019/05/o-objeto-que-contem-a-si-mesmo/) não
entrar em laço infinito. `nan is nan` é verdadeiro — é o mesmo objeto — então a
comparação nem chega a perguntar se ele é igual.

Com um `nan` diferente, o resultado muda:

```
>>> float("nan") in [float("nan")]
False
```

Dois objetos distintos, nenhum atalho de identidade, e a igualdade responde
`False`.

## E `sorted` devolve lista fora de ordem, calada

Este é o único da lista que eu classificaria como perigoso de verdade:

| entrada | `sorted(...)` |
|---|---|
| `[3, nan, 1]` | `[3, nan, 1]` |
| `[nan, 3, 1]` | `[1, nan, 3]` |
| `[1, 3, nan]` | `[1, 3, nan]` |

Três listas com os mesmos elementos, três resultados diferentes, **nenhum
ordenado** — e nenhum erro. O algoritmo de ordenação assume que a comparação é
consistente, e `nan` não é: ele devolve `False` para `<`, `>` e `==` ao mesmo
tempo. Sem relação de ordem, o algoritmo não tem como funcionar, e ele não tem
como saber disso.

O `max` e o `min` da mesma lista acertam — mas por sorte da posição, não por
tratarem o caso.

Se os seus dados podem ter `nan`, filtre antes de ordenar. `math.isnan` existe
para isso.

## A tupla imutável que muda

O favorito de todo mundo, e vale entender o mecanismo:

```
>>> t = ([1], 2)
>>> t[0] += [99]
TypeError: 'tuple' object does not support item assignment
>>> t
([1, 99], 2)
```

Levantou erro **e** mudou. As duas coisas, e não é contradição: `t[0] += [99]` é
duas operações. Primeiro `t[0].__iadd__([99])`, que estende a lista no lugar e
dá certo. Depois `t[0] = <resultado>`, que a tupla recusa.

A mutação já tinha acontecido quando o erro apareceu. Se você capturar esse
`TypeError` e seguir, seguirá com o dado alterado.

## `in` numa string não é `in` numa lista

Mesmo operador, perguntas diferentes:

| expressão | resultado | pergunta |
|---|---|---|
| `'ab' in 'abc'` | `True` | é **subcadeia**? |
| `'ab' in ['a','b']` | `False` | é **elemento**? |
| `'' in 'abc'` | `True` | toda string contém a vazia |
| `'' in ['a','b']` | `False` | a lista não tem esse elemento |

Em sequência de caracteres, `in` procura trecho; em qualquer outra sequência,
procura item. Escrever `if trecho in lista_de_nomes` quando se queria busca
parcial é um erro que não levanta exceção nenhuma.

## Quem decide a verdade de um objeto seu

Duas portas, e uma tem prioridade:

```python
class Ambos:
    def __len__(self): return 0
    def __bool__(self): return True

bool(Ambos())     # True
```

`__bool__` ganha. Só quando ele não existe é que o Python recorre a `__len__`, e
só quando nenhum dos dois existe é que o objeto é considerado verdadeiro. Vale
saber ao escrever um container: definir `__len__` já define a verdade dele, mesmo
sem você pedir.

## `any` e `all` discordam no vazio

```
>>> any([])
False
>>> all([])
True
```

Não é inconsistência: é a convenção matemática. "Existe algum verdadeiro?" numa
coleção vazia é não; "todos são verdadeiros?" é vacuamente sim. Isso morde em
validação — `all(regras)` numa lista de regras vazia aprova tudo.

## O que fica

**Igualdade é o eixo em que quase todos esses casos giram.** `bool` ser `int`,
cinco tipos virando uma chave, `nan` furando o `sorted` — em todos, a operação
está certa e a intuição sobre o que é "igual" é que estava errada.

**Identidade é conferida antes de igualdade, e isso é visível.** Resolve o
`nan in [nan]`, resolve a lista recursiva, e é uma otimização que virou
comportamento observável.

**Erro que muta e erro que não avisa são categorias diferentes.** O `t[0] += x`
avisa e muta; o `sorted` com `nan` não avisa e entrega lixo. O segundo é pior, e
é o mesmo padrão dos [erros de medição](/2025/09/sete-erros-de-medicao/).

## Referências

- [Comparisons](https://docs.python.org/3/reference/expressions.html#comparisons) — `in`, `is`, e a regra de identidade antes de igualdade
- [Truth Value Testing](https://docs.python.org/3/library/stdtypes.html#truth-value-testing) — `__bool__`, `__len__` e a ordem entre eles
- [`math.isnan`](https://docs.python.org/3/library/math.html#math.isnan) — o teste que o `==` não faz
- [Numeric Types](https://docs.python.org/3/library/stdtypes.html#numeric-types-int-float-complex) — `bool` como subtipo de `int`
- [PEP 285 — Adding a bool type](https://peps.python.org/pep-0285/) — por que `bool` herdou de `int`, decidido em 2002
