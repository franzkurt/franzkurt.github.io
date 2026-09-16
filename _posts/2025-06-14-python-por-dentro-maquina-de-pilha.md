---
title: "Python por dentro, parte 2: máquina de pilha, e por que não registradores"
date: 2025-06-14 10:00:00 -0300
tags: [python, cpython, internals, bytecode, performance]
description: "A explicação comum é que bytecode de pilha ocupa menos espaço. Fui medir e os dois quase empatam. O motivo real é outro, e tem a ver com um byte só."
---

*Esta é uma série sobre o funcionamento interno do Python. Se os termos
**token**, **bytecode**, **opcode** ou **pilha** não forem familiares, a
[parte 0](/2025/05/python-por-dentro-parte-0-o-mapa/) apresenta todos eles em
linguagem simples, e é o ponto de partida recomendado.*

O bytecode que sai da [parte 1](/2025/06/python-por-dentro-do-fonte-ao-bytecode/)
precisa de alguém que o execute. Esse alguém é
[`Python/ceval.c`](https://github.com/python/cpython/blob/main/Python/ceval.c),
e a documentação interna descreve o que ele é em uma frase:

> No alto nível, o interpretador consiste num laço que itera sobre as instruções
> de bytecode, executando cada uma via um `switch` que tem um `case`
> implementando cada opcode.

Com um detalhe que eu não esperava: esse `switch` é **gerado**. As instruções são
definidas em
[`Python/bytecodes.c`](https://github.com/python/cpython/blob/main/Python/bytecodes.c),
numa linguagem de domínio criada só para isso, e o interpretador sai dali.

Este texto é sobre a escolha de arquitetura desse laço — e sobre uma explicação
muito repetida que não sobreviveu quando eu fui medir.

<!--more-->

## O que é uma máquina de pilha

A definição, de novo da documentação interna do CPython:

> O interpretador de bytecode do CPython é uma **máquina de pilha**, o que
> significa que suas instruções operam empilhando dados e desempilhando-os.

Na prática: não existem variáveis nomeadas no nível do bytecode. Existe uma pilha,
e as instruções mexem no topo dela. `BINARY_OP` **desempilha dois** objetos e
**empilha um**, que é o resultado.

Duas propriedades dessa pilha valem saber.

**Ela mora no frame.** Cada chamada de função cria um frame, e a pilha faz parte
dele. É por isso que recursão profunda consome memória de forma previsível.

**O tamanho dela é calculado na compilação.** O compilador determina a
profundidade máxima que aquele código pode atingir e guarda em `co_stacksize`,
para que a pilha seja **pré-alocada** como um array contíguo de ponteiros. Dá
para ver:

```python
>>> def soma(a, b): return a + b
>>> soma.__code__.co_stacksize
2
```

Dois. É o máximo que aquela função empilha ao mesmo tempo. Nada é alocado durante
a execução — o espaço já está lá quando o frame nasce.

## A explicação que todo mundo repete

A pergunta natural é por que pilha e não **registradores**, que é o que Lua e a
máquina virtual do Android escolheram. Em máquina de registradores, uma soma é
uma instrução só: "some o registrador 2 com o 3 e ponha no 1".

A resposta que se lê em toda parte é: **bytecode de pilha é mais compacto**.
Instrução de pilha não precisa carregar números de registrador, então cabe em
menos bytes.

Resolvi medir, em vez de repetir. Peguei uma função pequena:

```python
def exemplo(a, b):
    t = a + b
    u = t * 2
    return u - a
```

Em pilha, ela vira **11 instruções de 2 bytes cada — 22 bytes**. Em máquina de
registradores, as mesmas operações caberiam em cerca de 5 instruções, mas cada
uma precisaria de opcode mais destino mais duas origens: 4 bytes. **20 bytes.**

Ou seja: **quase empata**, com ligeira vantagem para os registradores. A
explicação folclórica não se sustenta como está.

## O motivo real, e ele cabe num byte

A restrição de tamanho existe — só que não é onde se costuma dizer.

Desde o Python 3.6, cada instrução ocupa **exatamente dois bytes**: um para o
opcode e um para o argumento. E daí saem dois tetos duros.

**O primeiro teto: 256 opcodes.** Um byte não guarda mais que isso. Hoje o Python
usa **150** — sobram cerca de cem. Cada instrução nova, cada fusão de duas
operações numa só, gasta uma dessas vagas para sempre. Máquina de registradores
precisaria de campos maiores por instrução, e esse orçamento ficaria ainda mais
apertado.

**O segundo teto: 256 no argumento.** Índice maior que 255 não cabe, e o Python
resolve com uma instrução-prefixo, a `EXTENDED_ARG`. Numa função com 300
variáveis locais, ela aparece **noventa vezes** — instruções inteiras gastas só
para dizer "o próximo argumento é grande".

Então a restrição de tamanho é real e mordendo, mas o que ela restringe é o
**espaço de opcodes e de argumentos**, não o total de bytes do programa.

## Os motivos que sobram

Com a explicação do tamanho reduzida ao seu tamanho real, sobram três, e eu os
acho mais convincentes.

**O compilador fica trivial.** Uma árvore de expressão vira operação de pilha sem
nenhuma decisão: visite os filhos, depois emita o operador. Máquina de
registradores exige **alocação de registradores** — decidir qual valor mora onde,
e o que fazer quando acabam. É um problema clássico e espinhoso de compilador, e
a pilha simplesmente não o tem.

**O gargalo do Python nunca foi o despacho.** Máquina de registradores ganha por
executar menos instruções, e portanto fazer menos saltos no `switch`. Só que o
tempo do CPython sempre esteve em outro lugar — alocação de objetos, contagem de
referências, busca de atributo. Trocar a arquitetura para economizar despacho
seria otimizar o que não domina.

**E quando o despacho começou a pesar, eles não trocaram a arquitetura.**
Fundiram instruções. Repare no que aparece hoje ao desmontar um laço comum:

```
LOAD_FAST_LOAD_FAST      1 (total, i)
```

É uma **superinstrução**: dois `LOAD_FAST` num opcode só. Metade do despacho,
mesma arquitetura — e o custo é uma vaga naquelas cem que restam. É a troca que
a pilha permite e que a máquina de registradores tornaria mais cara.

## O gancho de escape

Um último detalhe que explica muita ferramenta.

Quando o interpretador vai executar um objeto de código, ele monta um frame e
chama `_PyEval_EvalFrame()`. Por padrão, essa função executa o frame da forma
usual — mas, pela [PEP 523](https://peps.python.org/pep-0523/), isso é
**configurável**: dá para substituir a função de avaliação de frames do
interpretador inteiro.

É por esse gancho que depuradores, *profilers* e compiladores JIT alternativos se
enfiam no Python sem precisar de um fork. A máquina de pilha é fixa; quem a
executa, não.

---

*Próxima parte: ler bytecode de verdade com o `dis`, num laço, numa compreensão e
numa chamada de função — e o que a sequência revela sobre o custo de cada uma.*

## Referências

- [The bytecode interpreter](https://github.com/python/cpython/blob/main/InternalDocs/interpreter.md) — a documentação interna de onde vêm as citações
- [`Python/ceval.c`](https://github.com/python/cpython/blob/main/Python/ceval.c) — o laço do interpretador
- [`Python/bytecodes.c`](https://github.com/python/cpython/blob/main/Python/bytecodes.c) — as definições de instrução, em DSL, de onde o `switch` é gerado
- [PEP 523 — Adding a frame evaluation API to CPython](https://peps.python.org/pep-0523/)
- [`dis`](https://docs.python.org/3/library/dis.html) — a lista de opcodes e o que cada um faz
