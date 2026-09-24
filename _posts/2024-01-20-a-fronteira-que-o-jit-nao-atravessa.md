---
title: "A fronteira que o JIT não atravessa, e o contrabando que resolve"
date: 2024-01-20 10:00:00 -0300
tags: [python, c, performance, cpython, pypy]
description: "No PyPy, chamar uma extensão em C é 2,7 vezes mais lento que no CPython — a linguagem rápida perde da lenta. A causa é a mesma que faz ctypes custar 11 vezes uma chamada normal aqui."
---

*Aprofundamento da série **[Python in-depth](/2025/05/python-por-dentro-parte-0-o-mapa/)** — o índice das partes está na parte 0.*

*A partir de [Type information for faster Python C extensions](https://bernsteinbear.com/blog/typed-c-extensions/),
de Max Bernstein. Os números de PyPy abaixo são medições **dele** — não tenho
PyPy instalado e não os reproduzi. O que medi aqui está marcado como tal.*

Há um resultado que parece erro de digitação. Chamando dez milhões de vezes uma
função `inc(long)` escrita como extensão em C:

| runtime | tempo |
|---|---|
| CPython | 846,6 ms |
| PyPy | **2.269 ms** |

O PyPy, que existe para ser mais rápido que o CPython, é **2,7 vezes mais lento**
justamente ao chamar código nativo. E a explicação vale para muito além do PyPy.

<!--more-->

## Por que a linguagem rápida perde

O JIT do PyPy trabalha rastreando o programa e especializando o que vê. Dentro de
Python ele é excelente nisso: descobre que uma variável é sempre um inteiro de
máquina, e passa a tratá-la como um inteiro de máquina — sem objeto, sem
alocação, num registrador.

Aí a chamada à extensão em C acontece, e o contrato da API do CPython exige um
`PyObject*`. O JIT precisa **desfazer** tudo o que conseguiu: pegar o inteiro que
estava no registrador, alocar um objeto, preencher o cabeçalho, passar o ponteiro.
Do outro lado, a função em C faz o caminho inverso — lê o campo, extrai o inteiro
— faz uma soma, e reembrulha o resultado.

Nas palavras do texto original, tudo entre o JIT e a implementação em C é
*"wasted work"*. A soma é uma instrução. A cerimônia em volta dela é o resto.

O CPython não sofre disso porque nunca teve o que perder: ele já representa tudo
como `PyObject*`. **O PyPy paga por ter otimizado.**

## O contrabando

A solução óbvia seria mudar a API para aceitar tipos nativos. Isso quebraria todas
as extensões existentes, que é exatamente o que ninguém pode fazer — pelo motivo
que a [tríade parte 2](/2026/09/triade-por-que-o-c-sustenta-tudo/) desenvolve: a
ABI do C é o que dá alcance ao Python, e por isso mesmo não se mexe nela.

A saída do trabalho é engenhosa. A estrutura que descreve um método tem um campo
`ml_name`, que é um ponteiro para o nome. A proposta é fazer esse ponteiro apontar
para dentro de uma estrutura maior, que carrega **também** os tipos dos argumentos,
o tipo de retorno, e um ponteiro para a versão não-embrulhada da função.

Quem não sabe do esquema lê `ml_name` e encontra o nome, como sempre. Quem sabe —
e vê a marca `METH_TYPED` — anda para trás no ponteiro e encontra a assinatura.
Nada na estrutura mudou de tamanho ou de ordem. A ABI continua a mesma.

Com isso o JIT pode chamar direto a implementação que trabalha com inteiros de
máquina, e o resultado é:

| runtime | tempo |
|---|---|
| CPython | 846,6 ms |
| PyPy sem os tipos | 2.269 ms |
| PyPy **com** os tipos | **168,1 ms** |

Treze vezes mais rápido que o próprio PyPy, e cinco vezes mais rápido que o
CPython. O trabalho que sumiu não era a conta — era a conversão.

## O mesmo problema, medido aqui

Não tenho PyPy, mas a mesma física aparece no CPython, e essa parte eu medi.
Comparando três formas de tirar uma raiz quadrada — mínimo de 25 repetições de
1 milhão de chamadas, com as razões conferidas em três execuções:

| caminho | por chamada | |
|---|---|---|
| `math.sqrt` — função em C pelo caminho normal | 22 ns | 1,0× |
| Python puro, 4 iterações de Newton | 173 ns | 7,9× |
| `ctypes` chamando `libm.sqrt` | 240 ns | **11×** |

Repare na última linha, porque ela é o mesmo fenômeno. `math.sqrt` e
`libm.sqrt` são **a mesma função da mesma biblioteca**. A diferença de 11 vezes é
inteiramente cerimônia: o `ctypes` monta a chamada em tempo de execução, converte
cada argumento conforme a assinatura declarada, e converte o retorno de volta.

E a conclusão prática é desconfortável: **chamar C por `ctypes` para fazer pouco
trabalho é mais lento que fazer o trabalho em Python.** O Newton de quatro
iterações, escrito em Python puro, ganha do `ctypes` chamando a raiz nativa.

É a mesma conta que a [tríade parte 3](/2026/09/triade-custo-da-fronteira/) já
tinha levantado por outro caminho: o que decide não é a linguagem do outro lado,
é quanto trabalho cabe em cada travessia.

## O que fica

**A conversão de representação é o custo real da interoperabilidade.** Não é a
chamada, não é a troca de linguagem — é traduzir como um valor se parece na
memória. O mesmo diagnóstico do
[ponteiro etiquetado](/2021/02/ponteiro-etiquetado-e-o-preco-do-int/), visto do
lado de fora.

**Otimizar cria algo a perder.** O PyPy é mais lento no limite porque tem mais o
que desfazer. Vale como alerta geral: quanto melhor a representação interna,
maior o custo de sair dela.

**Dá para acrescentar informação a uma interface congelada.** O truque do
`ml_name` é o tipo de solução que só aparece quando alguém aceita a restrição em
vez de pedir para mudá-la. Não é elegante; é compatível, que naquele contexto
vale mais.

## Referências

- [Type information for faster Python C extensions](https://bernsteinbear.com/blog/typed-c-extensions/) — Max Bernstein, o texto que originou este, e a origem dos números de PyPy
- [Dr Wenowdis: Specializing Dynamic Language C Extensions using Type Information](https://arxiv.org/abs/2403.02420) — o artigo acadêmico correspondente
- [`ctypes`](https://docs.python.org/3/library/ctypes.html) — o caminho medido acima
- [Extending Python with C](https://docs.python.org/3/extending/extending.html) — `PyMethodDef` e o campo `ml_name` usado no truque
- [cpyext](https://doc.pypy.org/en/latest/discussion/rawrefcount.html) — como o PyPy implementa a API do CPython
