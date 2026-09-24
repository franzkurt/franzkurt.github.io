---
title: "O bytecode que se reescreve enquanto roda"
date: 2021-02-06 10:00:00 -0300
tags: [python, interpretadores, performance, cpython]
description: "O cache acertou — e ainda assim você pagou para perguntar se ele estava preenchido. A saída é a instrução trocar a si mesma, e dá para ver isso acontecendo em quatro linhas de Python."
---

*Aprofundamento da série **[Python in-depth](/2025/05/python-por-dentro-parte-0-o-mapa/)** — o índice das partes está na parte 0.*

*Segundo de três textos sobre como um interpretador fica rápido, a partir da
série de [Max Bernstein](https://bernsteinbear.com/blog/inline-caching-quickening/):
**1.** [o cache inline](/2021/01/cache-inline-como-o-interpretador-aprende/) ·
**2.** esta · **3.** [o ponteiro que carrega o número](/2021/02/ponteiro-etiquetado-e-o-preco-do-int/).*

A [parte 1](/2021/01/cache-inline-como-o-interpretador-aprende/) terminou com uma
dívida. O cache inline resolve a busca cara, mas mesmo quando ele **acerta** você
paga duas coisas:

1. perguntar se o cache está preenchido — um desvio, toda vez;
2. chamar através de um ponteiro guardado — chamada indireta, que em muitos
   processadores custa bem mais que uma direta.

Numa operação que roda milhões de vezes, isso soma. A saída é mais radical do que
parece razoável: **a instrução reescreve a si mesma**.

<!--more-->

## A ideia: trocar o opcode, não o dado

No cache clássico, a instrução é sempre a mesma e o que muda é o conteúdo do
cache. O quickening inverte: a instrução passa a existir em **variedades**, e o
interpretador troca uma pela outra no fluxo de bytecode.

Em vez de um `ADD` que consulta cache, você tem:

- `ADD` — a genérica, que ainda não sabe nada;
- `ADD_INT` — a que assume inteiro e só confere isso;
- `ADD_CACHED` — a que assume que o cache está preenchido.

E a regra que torna tudo barato é um **invariante**, não uma verificação:

> `ADD_CACHED` aparece no bytecode **se e somente se** existe entrada no cache
> naquele ponto.

Com esse invariante garantido, a instrução `ADD_CACHED` **não precisa perguntar**
se o cache está preenchido. A pergunta foi respondida quando alguém decidiu
escrever `ADD_CACHED` ali. O desvio some porque a informação migrou do dado para
o nome da instrução.

## Em C, o esqueleto

Bernstein mostra o mecanismo com um interpretador de brinquedo. O essencial é
a última linha de cada caso — a que altera o próprio programa:

```c
case ADD: {
  Object* right = pop(frame);
  Object* left = pop(frame);
  if (object_type(left) == kInt) {
    do_add_int(frame, left, right);
    code->bytecode[frame->pc] = ADD_INT;   // <- reescreve
    break;
  }
  add_update_cache(frame, left, right);
  code->bytecode[frame->pc] = ADD_CACHED;  // <- reescreve
  break;
}
```

E a variedade especializada, que confere o palpite e desiste se ele falhar:

```c
case ADD_INT: {
  Object* right = pop(frame);
  Object* left = pop(frame);
  if (object_type(left) != kInt) {
    add_update_cache(frame, left, right);
    code->bytecode[frame->pc] = ADD_CACHED; // <- volta atrás
    break;
  }
  do_add_int(frame, left, right);
  break;
}
```

Repare que não há otimizador, não há compilação, não há passe de análise. Há uma
instrução que, ao executar, decide qual instrução ela deveria ter sido.

## A máquina de estados, no seu Python

Isso não é técnica de laboratório. O CPython faz exatamente isso desde o 3.11, e
dá para assistir:

```python
def op(f):
    return [i.opname for i in dis.get_instructions(f, adaptive=True)
            if i.opname.startswith("BINARY_OP")][0]
```

Compilando uma `soma` nova e aquecendo com inteiros:

| momento | instrução |
|---|---|
| recém-compilada | `BINARY_OP` |
| após 100 somas de `int` | `BINARY_OP_ADD_INT` |
| mais 100 somas de `float`, no mesmo ponto | `BINARY_OP_ADD_FLOAT` |

A terceira linha é a que me impressiona: o ponto **re-especializou**. Viu
inteiros, virou soma de inteiros; passou a ver floats, virou soma de floats.

Cada tipo tem a sua variedade:

| aquecida só com | vira |
|---|---|
| `int` | `BINARY_OP_ADD_INT` |
| `float` | `BINARY_OP_ADD_FLOAT` |
| `str` | `BINARY_OP_ADD_UNICODE` |
| subclasse de `int` | continua `BINARY_OP` |

A última linha é o assunto de
[outro artigo daqui](/2023/06/anotar-int-nao-deixa-o-python-rapido/): subclasse
pode ter `__add__` próprio, então não há palpite seguro a fazer.

## O caminho de volta é o que importa

Especializar é a metade fácil. A metade que faz o esquema ser **correto**, e não
só rápido, é desistir:

| passo | instrução |
|---|---|
| aquecida só com `int` | `BINARY_OP_ADD_INT` |
| depois de 200 chamadas com uma subclasse | `BINARY_OP` |
| e de volta 200 com `int` | `BINARY_OP_ADD_INT` |

Ida e volta completas, no mesmo ponto do código. O interpretador aposta,
descobre que errou, **desfaz a aposta**, e depois aposta de novo quando o padrão
volta.

É por isso que essa família de otimização funciona num interpretador e não num
compilador antecipado. Não é que o interpretador saiba mais — é que ele pode
errar e corrigir. O compilador antecipado precisa estar certo na primeira vez,
para todo programa que venha a usar aquele módulo, para sempre.

O preço da diferença, mínimo de 9 repetições de 2 milhões de chamadas:

| instrução em vigor | por chamada |
|---|---|
| `BINARY_OP_ADD_INT` | 24,2 ns |
| `BINARY_OP` genérico | 49,3 ns |

## O que fica

**A informação pode morar no nome da instrução, não só no dado.** É a sacada, e
ela é geral: sempre que você conferir a mesma condição num laço quente, existe a
opção de sair do laço com a condição já resolvida.

**Código que se modifica assusta menos quando o invariante é explícito.** O que
torna isso administrável não é disciplina, é a regra "`ADD_CACHED` existe se e
somente se o cache existe" — enunciada, e mantida em um lugar só.

**Aquecimento é pré-requisito, e isso muda como se mede.** Uma função medida na
primeira chamada roda no caminho genérico. Se o seu *benchmark* não aquece, ele
está medindo outro programa — mais um item para a lista dos
[erros de medição](/2025/09/sete-erros-de-medicao/).

Falta a última peça, e é a mais física das três: mesmo com a instrução certa,
somar dois inteiros no Python ainda mexe na memória, porque todo inteiro é um
objeto alocado. A [parte 3](/2021/02/ponteiro-etiquetado-e-o-preco-do-int/) é
sobre o truque que evita isso — e sobre por que o CPython não pode usá-lo.

## Referências

- [Inline caching: quickening](https://bernsteinbear.com/blog/inline-caching-quickening/) — Max Bernstein, o texto que originou este
- [PEP 659 — Specializing Adaptive Interpreter](https://peps.python.org/pep-0659/) — a especialização e a desespecialização no CPython
- [InternalDocs/interpreter.md](https://github.com/python/cpython/blob/main/InternalDocs/interpreter.md) — as famílias de instruções, documentadas
- [Efficient Interpretation using Quickening](https://publications.sba-research.org/publications/dls10.pdf) — Stefan Brunthaler, DLS 2010, o trabalho de origem do termo (PDF)
