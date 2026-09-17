---
title: "Python in-depth, parte 4: o interpretador que reescreve o próprio bytecode"
date: 2025-06-28 10:00:00 -0300
tags: [python, cpython, internals, bytecode, performance]
description: "Chame a mesma função duzentas vezes com inteiros e o BINARY_OP dela vira BINARY_OP_ADD_INT. Passe strings e vira outra coisa. Dá para ver acontecendo em três comandos."
---

*Parte da série **Python in-depth**, sobre o funcionamento interno do Python. Se
os termos **token**, **bytecode**, **opcode** ou **pilha** não forem familiares,
a [parte 0](/2025/05/python-por-dentro-parte-0-o-mapa/) apresenta todos eles em
linguagem simples — e é lá que está o índice das partes e dos aprofundamentos.*

A [parte 3](/2025/06/python-por-dentro-lendo-bytecode/) terminou com uma
ressalva: o que o `dis` mostra é o ponto de partida, não o que roda depois. Esta
parte é sobre o que acontece no meio.

O problema é o seguinte. Python é de tipagem dinâmica, então `a + b` não pode
virar uma soma de inteiros na compilação — o compilador não sabe o que são `a` e
`b`. A instrução precisa ser genérica: descobrir os tipos, procurar o método de
soma de cada um, decidir quem tem precedência, e só então somar. **Toda vez.**

Só que, na prática, quase todo `a + b` recebe sempre o mesmo tipo. A ideia da
[PEP 659](https://peps.python.org/pep-0659/) é aproveitar isso: um interpretador
que *"especula especializando-se nos tipos ou valores sobre os quais está
operando no momento, e se adapta quando eles mudam"*.

E dá para ver acontecendo.

<!--more-->

## A demonstração, em três comandos

```python
import dis

def soma(a, b):
    return a + b
```

Antes de a função ser executada alguma vez, o bytecode é o genérico:

```
RESUME
LOAD_FAST_LOAD_FAST  a, b
BINARY_OP            +
RETURN_VALUE
```

Agora chame duzentas vezes com inteiros — `for _ in range(200): soma(1, 2)` — e
desmonte de novo, com `dis.get_instructions(soma, adaptive=True)`:

```
RESUME_CHECK
LOAD_FAST_LOAD_FAST  a, b
BINARY_OP_ADD_INT    +
RETURN_VALUE
```

O `BINARY_OP` genérico **virou `BINARY_OP_ADD_INT`**. Ninguém recompilou nada:
o interpretador substituiu a instrução dentro do objeto de código que já estava
na memória.

E agora passe strings duzentas vezes:

```
BINARY_OP_ADD_UNICODE
```

Trocou de novo. O mesmo código-fonte, a mesma função, três bytecodes diferentes
ao longo da vida do processo.

## Como isso funciona

O mecanismo tem quatro peças, e a documentação da PEP nomeia todas.

**Quickening** é a substituição em si: instruções são trocadas por variantes mais
rápidas em tempo de execução. É o que torna o bytecode **mutável** — ele deixa de
ser um artefato imutável produzido pelo compilador e passa a ser um estado que
evolui.

**Instruções adaptativas.** Cada instrução que se beneficia de especialização
ganha uma forma adaptativa, que *"periodicamente tenta se especializar"*,
mantendo contadores de execução. É a forma neutra, que observa antes de apostar.

**Guardas e contadores saturantes.** A instrução especializada verifica se a
entrada é o que ela espera. Quando é, o contador sobe. Quando não é, o contador
desce e a operação genérica é feita.

**Desotimização.** Se o contador chega ao mínimo, a instrução é revertida —
literalmente trocando o opcode de volta pela versão adaptativa. Foi o que
aconteceu no exemplo quando passei strings: a aposta no inteiro foi desfeita e
uma nova aposta tomou o lugar.

## Por que instrução por instrução

A escolha de especializar **cada bytecode** em vez de regiões maiores ou funções
inteiras tem uma justificativa que eu achei elegante:

> Especializar bytecodes individuais torna a desotimização **trivial**, porque
> ela não pode ocorrer no meio de uma região.

Compiladores que otimizam blocos grandes precisam saber voltar atrás a partir de
qualquer ponto interno — o que exige guardar estado suficiente para reconstruir a
execução no meio do caminho. É a parte difícil e cara de um JIT.

Especializando uma instrução por vez, esse problema simplesmente não existe. Ou a
instrução vale, ou ela é trocada antes de rodar. Não há meio.

## A pergunta que ficou na parte 3

Lá atrás eu pedi para guardar um detalhe: o compilador **não consegue
distinguir** uma variável global de um builtin. As duas viram `LOAD_GLOBAL`,
porque a diferença só é conhecida quando o programa roda.

É exatamente o tipo de informação que só existe em tempo de execução — e é
exatamente o que o interpretador especializado captura. Ele observa de onde o
nome veio, e troca a instrução por uma que já sabe onde procurar.

Vale generalizar: **a especialização recupera, em tempo de execução, informação
que a tipagem dinâmica impede de saber na compilação.** Não é uma otimização
qualquer; é a resposta específica ao custo da dinamicidade.

## O que isso muda para quem escreve Python

Três consequências práticas.

**Contar instruções no `dis` não é medir tempo.** Duas versões com o mesmo número
de instruções podem ter desempenhos bem diferentes se uma especializa e a outra
não. Para comparar desempenho, meça tempo; o `dis` explica o mecanismo, não o
custo.

**Código monomórfico é mais rápido, e agora há um motivo mecânico.** Uma função
que sempre recebe inteiros especializa e fica lá. Uma função que recebe inteiros,
strings e objetos alternadamente desotimiza, re-especializa, desotimiza de novo —
e paga o genérico no caminho. O conselho de "não faça uma função servir a tudo"
deixou de ser estético.

**Microbenchmark precisa de aquecimento.** Se você cronometra a primeira chamada,
está medindo o interpretador antes de ele se especializar. É o mesmo erro de
medir tempo de geração sem descontar carregamento — número plausível e errado.

E uma ressalva de custo, porque nada é de graça: os contadores e os dados de cada
instrução especializada ocupam espaço, embutidos no próprio bytecode. Aquelas
entradas `CACHE` que o `dis` esconde por padrão são isso. Foi memória trocada por
tempo, deliberadamente.

Vale notar o que **não** aconteceu: nada disso trocou a máquina de pilha da
[parte 2](/2025/06/python-por-dentro-maquina-de-pilha/) por outra arquitetura. O
ganho veio de tornar as instruções existentes mais espertas, mantendo tudo o mais
no lugar — compatibilidade de C API, semântica, ferramentas.

---

*Próxima parte: o que mudou por dentro em cada versão, do 3.9 até hoje — e por
que as decisões formam uma linha só.*

## Referências

- [PEP 659 — Specializing Adaptive Interpreter](https://peps.python.org/pep-0659/) — de onde vêm as citações
- [`Python/specialize.c`](https://github.com/python/cpython/blob/main/Python/specialize.c) — a implementação da especialização
- [`Python/bytecodes.c`](https://github.com/python/cpython/blob/main/Python/bytecodes.c) — onde as variantes especializadas são definidas
- [`dis.get_instructions(..., adaptive=True)`](https://docs.python.org/3/library/dis.html#dis.get_instructions) — o que revela o bytecode especializado
