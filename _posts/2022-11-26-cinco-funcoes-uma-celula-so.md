---
title: "O bug de closure que todo mundo escreve uma vez"
date: 2022-11-26 10:00:00 -0300
tags: [python, casos-de-canto, cpython, engenharia]
description: "Cinco lambdas criadas num laço devolvem todas o mesmo número. O bytecode da versão errada e da versão certa é idêntico, instrução por instrução — o que muda é quantas células existem."
---

*A partir de [Late Binding in Python](https://jellis18.github.io/post/2022-11-23-late-binding-python/),
de Justin A. Ellis, com a explicação reaberta até o nível das células, no
Python 3.13.5.*

Esta linha parece óbvia:

```python
funcoes = [lambda: ii + 1 for ii in range(5)]
[f() for f in funcoes]
```

E devolve:

```
[5, 5, 5, 5, 5]
```

Não `[1, 2, 3, 4, 5]`. Todas as cinco devolvem o mesmo número, e o número é o
último da faixa.

A explicação que se ouve é "Python usa *late binding*: a variável é consultada
quando a função roda, não quando ela é criada". É verdade, e não explica o
suficiente — porque a versão **correta** também consulta na hora de rodar.

<!--more-->

## O bytecode é o mesmo nas duas versões

A correção conhecida é passar o valor por uma função:

```python
def mais_um(x):
    return lambda: x + 1

funcoes = [mais_um(i) for i in range(5)]     # [1, 2, 3, 4, 5]
```

Agora desmonte as duas lambdas — a errada e a certa:

```
COPY_FREE_VARS
RESUME
LOAD_DEREF      ii        (ou x)
LOAD_CONST      1
BINARY_OP       +
RETURN_VALUE
```

**Instrução por instrução, idênticas.** As duas usam `LOAD_DEREF`, que é
exatamente "consulte a variável livre agora". As duas fazem late binding. Se o
late binding fosse a causa, as duas estariam erradas.

## A diferença está em quantas células existem

`LOAD_DEREF` lê de uma **célula** — uma caixinha que o interpretador cria para
guardar uma variável que sobrevive ao escopo onde nasceu. Dá para contá-las:

```python
{id(f.__closure__[0]) for f in funcoes}
```

| versão | resultado | células distintas |
|---|---|---|
| compreensão, direto | `[5, 5, 5, 5, 5]` | **1** |
| função fábrica | `[1, 2, 3, 4, 5]` | **5** |
| valor padrão do parâmetro | `[1, 2, 3, 4, 5]` | **0** |

Aí está o bug, e ele não é sobre *quando* se lê: é sobre *de onde*.

Na primeira versão existe **uma célula só**, criada uma vez para o `ii` da
compreensão, e as cinco lambdas apontam todas para ela. O laço termina com `4`
lá dentro, e as cinco leem `4`.

Na segunda, cada chamada de `mais_um` cria um escopo novo, com um `x` novo, e
portanto uma célula nova. Cinco chamadas, cinco células, cinco valores.

A terceira versão é diferente das duas: **zero células**. `lambda i=i: i+1` não
tem variável livre nenhuma — o valor foi copiado para o padrão do parâmetro no
momento em que a lambda foi criada. Não há closure para dar errado.

## Uma frase melhor

Trocando "a variável é lida na hora da chamada" por:

> A closure captura a **célula**, não o valor. Compartilhar a célula é
> compartilhar o destino dela.

Isso explica os três casos de uma vez, explica por que o bytecode é igual, e dá o
critério prático: **conte quantos escopos o seu laço cria.** Um laço não cria
escopo por iteração — nem `for`, nem compreensão. Uma chamada de função cria.

## O detalhe que mudou no 3.12, e o que não mudou

Vale registrar porque confunde. Desde a [PEP 709](https://peps.python.org/pep-0709/),
compreensões são embutidas na função que as contém, e a variável do laço não
vaza:

```python
_ = [kk for kk in range(3)]
"kk" in dir()          # False
```

Com um `for` comum, vaza:

```python
for jj in range(5):
    ...
"jj" in dir()          # True
```

Mas repare no que **não** mudou: mesmo sem vazar, a compreensão continua usando
uma célula só, e o bug continua exatamente igual. A PEP 709 mudou a visibilidade
da variável, não a quantidade de escopos.

Aliás, com `for` comum o resultado é o mesmo `[5, 5, 5, 5, 5]` — é o mesmo bug,
e a compreensão não tem culpa nenhuma.

## O que fica

**Quando duas versões de um código geram o mesmo bytecode, a diferença está no
ambiente, não no código.** É um reflexo útil de diagnóstico: se `dis` não
distingue, olhe as células, os `__defaults__`, os globais.

**"Late binding" nomeia o mecanismo, não a causa.** É o tipo de explicação que
soa suficiente e não é — e este blog já
[refez uma dessas](/2025/07/python-por-dentro-o-que-guido-escreveu/) contra as
fontes primárias.

**A correção por `i=i` funciona por um motivo diferente das outras.** Ela não
conserta a célula: ela elimina a closure. Vale saber, porque é a única das três
que continua funcionando se alguém reatribuir a variável depois.

## Referências

- [Late Binding in Python](https://jellis18.github.io/post/2022-11-23-late-binding-python/) — Justin A. Ellis, o texto que originou este
- [PEP 709 — Inlined comprehensions](https://peps.python.org/pep-0709/) — o que mudou no 3.12
- [`dis`](https://docs.python.org/3/library/dis.html) — `LOAD_DEREF`, `COPY_FREE_VARS` e as variáveis livres
- [Execution model: binding of names](https://docs.python.org/3/reference/executionmodel.html#binding-of-names) — a definição normativa de escopo e célula
- [`functools.partial`](https://docs.python.org/3/library/functools.html#functools.partial) — a quarta correção, que também copia o valor na criação
