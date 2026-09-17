---
title: "Por que `1 and 2 and 3` devolve 3"
date: 2026-09-11 10:00:00 -0300
tags: [python, operadores, casos-de-canto, cpython, engenharia]
description: "and e or não devolvem True nem False: devolvem um dos operandos. O bytecode mostra por quê, e a explicação cabe numa instrução chamada COPY."
---

Abra o Python e digite:

```
>>> 1 and 2 and 3
3
>>> 1 or 2 or 3
1
```

Nenhum dos dois devolveu `True`. E não é curiosidade de canto: é como `and` e
`or` funcionam sempre, inclusive no `if` que você escreveu hoje.

Este texto mede o comportamento e desce até o bytecode, onde a explicação acaba
sendo uma instrução só. Um [segundo texto](/2026/09/nan-nao-e-igual-a-nan/) trata
do outro lado — os tipos que fazem o operador parecer mentir.

<!--more-->

## A regra, em duas linhas

> `and` devolve o **primeiro operando falso**. Se nenhum for falso, devolve o
> **último**.
>
> `or` devolve o **primeiro operando verdadeiro**. Se nenhum for, devolve o
> **último**.

Confira contra a medição:

| expressão | resultado | tipo |
|---|---|---|
| `1 and 2 and 3` | `3` | `int` |
| `1 and 0 and 3` | `0` | `int` |
| `1 or 2 or 3` | `1` | `int` |
| `0 or 2 or 3` | `2` | `int` |
| `[] or {} or ()` | `()` | `tuple` |
| `None or 0 or ''` | `''` | `str` |

Repare na penúltima: três valores falsos, e o resultado é o último — uma tupla
vazia, não `False`.

## O bytecode explica, e a explicação é uma instrução

Desmontando `a and b`:

```
        LOAD_NAME           a
        COPY                1
        TO_BOOL
        POP_JUMP_IF_FALSE   L1
        POP_TOP
        LOAD_NAME           b
        RETURN_VALUE
   L1:  RETURN_VALUE
```

Leia devagar, porque está tudo ali:

1. `LOAD_NAME a` — empilha `a`.
2. **`COPY 1` — duplica `a`.** Agora há duas cópias na pilha.
3. `TO_BOOL` — converte para booleano **a cópia**, não o original.
4. `POP_JUMP_IF_FALSE` — consome a cópia. Se for falsa, salta para `L1`, que é um
   `RETURN_VALUE` sozinho: ali o original ainda está na pilha, intacto, e é ele
   que sai.
5. Se não saltou, `POP_TOP` descarta `a` e carrega `b`.

O `and` nunca converte `a` para booleano. Ele converte **uma cópia descartável**,
usa a cópia para decidir o desvio, e devolve o valor original. É por isso que o
tipo sobrevive à operação.

Compare com `not a`:

```
LOAD_NAME    a
TO_BOOL
UNARY_NOT
RETURN_VALUE
```

Sem `COPY`. O original é consumido, e o que sai é um booleano — sempre:

```
>>> type(not 5)
<class 'bool'>
```

A diferença entre "devolve o operando" e "devolve booleano" é literalmente uma
instrução de duplicação de pilha. Se a [máquina de pilha](/2025/06/python-por-dentro-maquina-de-pilha/)
ainda for nova para você, vale ler antes.

## Curto-circuito, com prova

O segundo operando só é avaliado se for preciso. Dá para provar com uma expressão
que explodiria:

```
>>> 0 or 'x' or 1/0
'x'
```

Nenhum `ZeroDivisionError`. O `or` achou `'x'` verdadeiro e parou — o `1/0` nunca
rodou. O `POP_JUMP_IF_TRUE` do bytecode pulou por cima dele.

## O idioma que isso permite, e a armadilha dele

Como `or` devolve o operando, ele vira um valor padrão:

```python
nome = entrada or "anônimo"
```

Funciona, é idiomático, e tem um buraco: ele cai para o padrão em **qualquer**
valor falso, não só em ausência.

```python
quantidade = entrada or 10
```

Se `entrada` for `0`, a quantidade vira `10`. Se for `""`, `[]` ou `False`,
idem. Quando o que você quer é "se não veio nada", o teste correto é explícito:

```python
quantidade = 10 if entrada is None else entrada
```

O `or` testa **verdade**; `is None` testa **ausência**. Não são a mesma pergunta,
e confundir as duas é um dos jeitos de produzir aquele
[erro que devolve resposta plausível](/2025/09/sete-erros-de-medicao/).

## `&` e `|` não são `and` e `or`

Este é o par que mais confunde quem vem de outra linguagem:

| expressão | resultado |
|---|---|
| `True and 2` | `2` |
| `True & 2` | **`0`** |
| `1 and 2` | `2` |
| `1 & 2` | **`0`** |
| `2 or 4` | `2` |
| <code>2 &#124; 4</code> | **`6`** |

`True & 2` dá zero porque `&` é operação **bit a bit**: `True` vale 1, e
`1 & 2` em binário é `01 & 10`, que não tem nenhum bit em comum.

Duas diferenças, e as duas importam:

- `&` e `|` **não curto-circuitam**. O bytecode deles é um `BINARY_OP` simples,
  sem desvio — os dois lados são sempre avaliados.
- Eles operam sobre **bits**, não sobre verdade. Só coincidem com `and`/`or`
  quando os dois lados já são booleanos.

## Comparação encadeada não é o que parece

`1 < 2 < 3` não é `(1 < 2) < 3`. É açúcar para `(1 < 2) and (2 < 3)`. Dá para
ver a diferença quando os dois divergem:

| expressão | resultado |
|---|---|
| `3 > 2 > 1` | `True` |
| `(3 > 2) > 1` | **`False`** |
| `False == False in [False]` | `True` |
| `(False == False) in [False]` | **`False`** |

A segunda linha: `3 > 2` dá `True`, que vale 1, e `1 > 1` é falso. Pôr
parênteses **muda o resultado** — é o contrário do que a intuição diz sobre
parênteses.

E o operando do meio é avaliado **uma vez só**:

```python
f(1) < f(2) < f(3)     # f é chamada com 1, 2, 3 — o 2 uma vez apenas
```

Se `f` tiver efeito colateral, isso é a diferença entre um e dois efeitos.

## Precedência do `not`

`not` liga mais fraco que as comparações, então ele se aplica ao resultado
inteiro:

```python
a, b = "x", ""
not a == b        # True   — é not (a == b)
(not a) == b      # False  — outra coisa
```

## O que fica

**`and` e `or` são operadores de seleção, não de lógica booleana.** Eles
escolhem um dos operandos e o entregam inteiro, com tipo e tudo. `not` é o único
dos três que produz um booleano.

**O teste de verdade acontece numa cópia.** É literalmente o `COPY 1` do
bytecode, e é a razão mecânica de o valor original sobreviver.

**`or` como valor padrão testa verdade, não ausência.** Use `is None` quando a
pergunta for "veio alguma coisa?".

O outro lado disso é o comportamento dos **tipos** dentro dessas operações — por
que `bool` é um `int`, por que `nan` não é igual a si mesmo, e por que cinco
objetos diferentes viram um só num `set`. É o
[texto seguinte](/2026/09/nan-nao-e-igual-a-nan/).

## Referências

- [Boolean operations](https://docs.python.org/3/reference/expressions.html#boolean-operations) — a definição normativa de `and`, `or` e `not`
- [Comparisons](https://docs.python.org/3/reference/expressions.html#comparisons) — o encadeamento e a regra de avaliação única
- [Operator precedence](https://docs.python.org/3/reference/expressions.html#operator-precedence) — a tabela completa
- [Truth Value Testing](https://docs.python.org/3/library/stdtypes.html#truth-value-testing) — o que conta como falso
- [`dis`](https://docs.python.org/3/library/dis.html) — `COPY`, `TO_BOOL` e os saltos usados aqui
