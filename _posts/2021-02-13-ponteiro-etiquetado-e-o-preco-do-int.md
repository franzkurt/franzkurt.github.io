---
title: "O ponteiro que carrega o número, e por que o CPython não pode usá-lo"
date: 2021-02-13 10:00:00 -0300
tags: [python, c, cpython, performance, memoria, engenharia]
description: "Somar dois inteiros etiquetados: 5 instruções, nenhum acesso à memória. Somar dois inteiros alocados: 10 instruções, uma delas é call malloc. O truque tem 40 anos, e o CPython está impedido de usá-lo."
---

*Aprofundamento da série **[Python in-depth](/2025/05/python-por-dentro-parte-0-o-mapa/)** — o índice das partes está na parte 0.*

*Terceiro de três textos sobre como um interpretador fica rápido, a partir da
série de [Max Bernstein](https://bernsteinbear.com/blog/small-objects/):
**1.** [o cache inline](/2021/01/cache-inline-como-o-interpretador-aprende/) ·
**2.** [reescrever o próprio bytecode](/2021/02/quickening-o-bytecode-que-se-reescreve/) ·
**3.** esta.*

As duas partes anteriores fizeram o interpretador escolher a instrução certa.
Falta um custo que nenhuma instrução resolve: **todo inteiro do Python é um
objeto na memória**.

```python
sys.getsizeof(1)     # 28 bytes
```

Vinte e oito bytes para guardar o número 1, contra os 8 de um inteiro de 64 bits
em C. E não é só espaço — é que somar dois deles envolve alocar um terceiro.

Existe um truque de quarenta anos para evitar isso. Ele funciona, é usado em
OCaml, V8 e SpiderMonkey, e o CPython **não pode adotá-lo**. O motivo é a parte
mais interessante.

<!--more-->

## Os bits que sobram em todo ponteiro

Alocadores de memória devolvem endereços alinhados. Se todo objeto começa num
múltiplo de 8, então todo endereço termina em três zeros binários — porque é
isso que múltiplo de 8 significa.

Esses bits estão lá, em todo ponteiro do seu programa, sem fazer nada.

Dá para conferir no seu Python, que alinha ainda mais folgado:

```python
for o in [object(), [], {}, (1,2), "abc", 3.14]:
    print(hex(id(o)), id(o) % 16)
```

```
0x7f11fa4704b0  0
0x7f11fa292740  0
0x7f11fa31b0c0  0
...
```

Todos múltiplos de 16 — **quatro bits baixos sempre zero**, em todo objeto do
interpretador.

A ideia do ponteiro etiquetado é usar esses bits para dizer *o que a palavra é*.
No esquema mais simples, com um bit:

- termina em **0** → não é ponteiro, é um inteiro guardado ali mesmo;
- termina em **1** → é um ponteiro de verdade, para um objeto no heap.

## A diferença, no assembly

Implementei os dois caminhos em C e compilei com gcc 14.2 em `-O2`. A versão
etiquetada:

```c
Object* new_int(word value)     { return (Object*)((uword)value << 1); }
word    object_as_int(Object* o) { return (word)o >> 1; }

Object* add_tagged(Object* a, Object* b) {
    return new_int(object_as_int(a) + object_as_int(b));
}
```

vira isto:

```
add_tagged:
        sarq    %rsi
        sarq    %rdi
        addq    %rdi, %rsi
        leaq    (%rsi,%rsi), %rax
        ret
```

**Cinco instruções, nenhum acesso à memória.** Desloca os dois, soma, desloca de
volta, retorna.

Agora a versão que aloca, que é o que o CPython faz:

```
add_heap:
        pushq   %rbx
        movq    16(%rsi), %rbx
        addq    16(%rdi), %rbx
        movl    $24, %edi
        call    malloc@PLT
        movq    $1, (%rax)
        movq    $0, 8(%rax)
        movq    %rbx, 16(%rax)
        popq    %rbx
        ret
```

Dez instruções, duas leituras da memória, três escritas — e uma **chamada ao
`malloc`**, cujo custo não aparece nessa contagem porque está do outro lado da
chamada.

A soma em si é a mesma `addq` nos dois casos. Todo o resto é cerimônia de
representação.

## O que o truque cobra

Não é de graça, e vale enunciar o preço antes de achar a ideia boa demais.

**O inteiro encolhe.** Um bit foi para a etiqueta, então sobram 63 em vez de 64.
Na prática ninguém nota, mas é uma mudança de semântica da linguagem, não um
detalhe de implementação.

**Passam a existir duas representações do mesmo conceito.** Todo código que
recebe um valor precisa conferir a etiqueta antes de desreferenciar. Isso se
espalha por cada função do runtime.

**O heap ainda existe.** Inteiro grande não cabe em 63 bits e continua alocado, o
que significa que o caminho antigo não some — ele ganha um companheiro.

## Por que o CPython não faz isso

Aqui está a parte que eu acho mais instrutiva, e que liga com o resto do blog.

O impedimento não é técnico no sentido de difícil. É **contratual**. A API C do
CPython entrega o `PyObject*` cru para qualquer extensão, e as extensões
desreferenciam esse ponteiro. Dá para demonstrar sem sair do Python:

```python
import ctypes
x = 12345
ctypes.c_ssize_t.from_address(id(x)).value    # 3 — o refcount de x
```

Aquilo leu o contador de referências de um inteiro lendo direto o endereço dele.
Se o ponteiro de `x` passasse a ser um número etiquetado, essa leitura acessaria
memória inválida — e não é um truque meu: é o que **toda extensão em C faz**,
porque é o que a API sempre ofereceu.

É o argumento da [tríade parte 2](/2026/09/triade-por-que-o-c-sustenta-tudo/)
aparecendo pelo avesso. A ABI do C é o que permite o Python falar com o mundo
inteiro; e é exatamente por ter prometido essa interface que ele não pode mudar
como um objeto se parece na memória. O ecossistema que dá alcance ao CPython é o
mesmo que trava a representação dele.

## O que o CPython faz em vez disso

Não dá para etiquetar, mas dá para **não alocar de novo**. O interpretador
pré-cria os inteiros pequenos no boot e devolve sempre os mesmos objetos:

```python
faixa = [n for n in range(-10, 1100)
         if int(str(n)) is int(str(n))]
min(faixa), max(faixa), len(faixa)
# (-5, 256, 262)
```

Duzentos e sessenta e dois inteiros — de −5 a 256 — existem uma vez só e são
compartilhados. Criar o número 7 não aloca nada; devolve um ponteiro para um
objeto que já estava lá.

É uma solução pior que etiquetar, e é a melhor disponível sem quebrar o mundo.
A [parte 1 da série de tipos](/2026/08/tipos-em-python-por-dentro/) mostra que
essa faixa está crescendo: no `main` do CPython o limite já subiu para 1024.

## O que fica

**Representação é decisão de arquitetura, não de otimização.** Etiquetar ponteiro
muda o que um inteiro *é* — e por isso precisa ser decidido antes de existir
ecossistema, não depois.

**Interface pública é o que congela o projeto.** O CPython consegue trocar o
compilador, o coletor de lixo e o interpretador inteiro — trocou os três em cinco
anos. O que ele não consegue trocar é o formato que prometeu a quem escreve
extensão.

**Por isso as partes 1 e 2 desta série existem.** Especialização e quickening são
o que sobra quando a representação está fechada. São otimizações caras de
implementar, e a razão de valerem a pena é que a alternativa barata está
bloqueada por um contrato de trinta anos.

## Referências

- [Small objects and pointer tagging](https://bernsteinbear.com/blog/small-objects/) — Max Bernstein, o texto que originou este
- [`Objects/longobject.c`](https://github.com/python/cpython/blob/main/Objects/longobject.c) — o `PyLongObject` que é alocado
- [`pycore_runtime_structs.h`](https://github.com/python/cpython/blob/main/Include/internal/pycore_runtime_structs.h) — os inteiros pequenos pré-alocados
- [Value tagging — OCaml](https://dev.realworldocaml.org/runtime-memory-layout.html) — o esquema num runtime que o adotou desde o início
- [`ctypes`](https://docs.python.org/3/library/ctypes.html) — como se lê a memória de um objeto direto do endereço
