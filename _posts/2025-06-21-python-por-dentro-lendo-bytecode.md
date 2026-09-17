---
title: "Python in-depth, parte 3: lendo bytecode de verdade com o dis"
date: 2025-06-21 10:00:00 -0300
tags: [python, cpython, internals, bytecode, performance]
description: "Um laço, uma compreensão e três formas de acessar um valor. A desmontagem mostra o que cada um custa — e entrega uma mudança de 2023 que ninguém anunciou no código que você escreve."
audio: /assets/audio/python-por-dentro-lendo-bytecode.mp3
audio_duracao: "5:38"
---

*Parte da série **Python in-depth**, sobre o funcionamento interno do Python. Se
os termos **token**, **bytecode**, **opcode** ou **pilha** não forem familiares,
a [parte 0](/2025/05/python-por-dentro-parte-0-o-mapa/) apresenta todos eles em
linguagem simples — e é lá que está o índice das partes e dos aprofundamentos.*

As duas partes anteriores cobriram
[como o fonte vira bytecode](/2025/06/python-por-dentro-do-fonte-ao-bytecode/) e
[por que o interpretador é uma máquina de pilha](/2025/06/python-por-dentro-maquina-de-pilha/).
Falta a parte que dá para fazer agora, no seu terminal: **ler o bytecode**.

O módulo `dis` desmonta qualquer função. E o que ele mostra responde perguntas
que a intuição erra com frequência — quanto custa acessar uma global, o que uma
compreensão realmente faz, e por que um laço não é uma construção da linguagem.

<!--more-->

## Um laço, instrução por instrução

Comece pelo mais simples que existe:

```python
def laco():
    total = 0
    for i in range(10):
        total += i
    return total
```

Desmontado:

```
RESUME                   0
LOAD_CONST               1 (0)
STORE_FAST               0 (total)
LOAD_GLOBAL              1 (range + NULL)
LOAD_CONST               2 (10)
CALL                     1
GET_ITER
L1:  FOR_ITER            7 (to L2)
     STORE_FAST          1 (i)
     LOAD_FAST_LOAD_FAST 1 (total, i)
     BINARY_OP          13 (+=)
     STORE_FAST          0 (total)
     JUMP_BACKWARD       9 (to L1)
L2:  END_FOR
     POP_TOP
     LOAD_FAST           0 (total)
     RETURN_VALUE
```

Três coisas para reparar.

**O `for` não existe.** O que existe é `GET_ITER`, que pede um iterador ao
objeto, e `FOR_ITER`, que tenta puxar o próximo item — e **salta para fora**
quando acabou. O corpo termina em `JUMP_BACKWARD`, voltando ao começo. Laço é
salto para trás, e foi assim que a instrução se chamou desde sempre.

**O iterador fica na pilha o tempo todo.** Por isso o `END_FOR` e o `POP_TOP` no
fim: é preciso descartá-lo. E por isso `co_stacksize` de um laço nunca é 1.

**`LOAD_FAST_LOAD_FAST` carrega duas variáveis numa instrução.** É uma
superinstrução, fusão de duas operações comuns num opcode só, para pagar metade
do despacho. Você não escreveu nada diferente; o compilador reconheceu o padrão.

## O que custa acessar um valor

Agora o exemplo que eu acho mais útil no dia a dia. Três acessos, três instruções
diferentes:

```python
G = 1
def acessos(obj, loc):
    a = loc        # LOAD_FAST    loc
    b = G          # LOAD_GLOBAL  G
    c = obj.attr   # LOAD_FAST obj  +  LOAD_ATTR attr
```

E os três custam coisas bem distintas:

| Instrução | O que faz | Custo |
|---|---|---|
| `LOAD_FAST` | índice num array pré-alocado do frame | um acesso a array |
| `LOAD_GLOBAL` | busca no dicionário do módulo, e depois nos builtins | uma ou duas buscas em tabela hash |
| `LOAD_ATTR` | consulta o tipo, depois o objeto, com regras de descritor | o mais caro dos três |

É daí que vem o conselho antigo de "copie a global para uma local dentro do laço
quente". Ele não é superstição: `LOAD_FAST` lê uma posição de array, `LOAD_GLOBAL`
consulta uma tabela hash — e se o nome não estiver no módulo, consulta uma
segunda, a dos builtins.

Há um detalhe bonito escondido aí. O compilador **não consegue distinguir** uma
global de um builtin: ambas viram `LOAD_GLOBAL`, porque a diferença só é
conhecida quando o programa roda. Guarde isso — é o gancho da próxima parte.

## A compreensão, e o que mudou nela

Agora o achado que motivou este texto. Desmonte uma compreensão trivial:

```python
def comp(): return [i*2 for i in range(3)]
```

E aparece isto, que não parece nada trivial:

```
LOAD_GLOBAL              1 (range + NULL)
LOAD_CONST               1 (3)
CALL                     1
GET_ITER
LOAD_FAST_AND_CLEAR      0 (i)
SWAP                     2
L1:  BUILD_LIST          0
     ...
     STORE_FAST_LOAD_FAST 0 (i, i)
     LIST_APPEND          2
     JUMP_BACKWARD        9
L3:  END_FOR
L4:  SWAP                 2
     STORE_FAST           0 (i)
     RETURN_VALUE
L5:  SWAP                 2
     POP_TOP
     STORE_FAST           0 (i)
     RERAISE              0
ExceptionTable:
  L1 to L4 -> L5 [2]
```

Uma compreensão de uma linha gerou uma **tabela de exceções** e um par de
instruções chamado `LOAD_FAST_AND_CLEAR` / `STORE_FAST`. Por quê?

Porque até o Python 3.11, uma compreensão era compilada como uma **função
aninhada**. A cada execução, o interpretador criava um objeto de função, chamava,
alocava um frame novo e descartava tudo em seguida. Esse frame inclusive aparecia
nos rastreamentos de erro.

A [PEP 709](https://peps.python.org/pep-0709/) é direta sobre por que era assim:

> A compilação de compreensões como função aninhada otimiza para a **simplicidade
> do compilador**, às custas do desempenho do código do usuário.

A partir do **3.12**, a compreensão passou a ser **embutida no frame de quem a
contém**. Sem função temporária, sem frame novo. O ganho medido: **1,96× num
microbenchmark** de compreensões, e **11% no conjunto do pyperformance**, que é
código real.

E aquela maquinaria estranha é o preço da mudança. Como a compreensão agora
divide o escopo com a função onde está, a variável do laço poderia **vazar** e
sobrescrever uma variável existente com o mesmo nome. Então o bytecode salva o
valor anterior de `i` (`LOAD_FAST_AND_CLEAR`), roda o laço, e o restaura no fim —
inclusive se der exceção no meio, que é para isso que serve a tabela.

Vale a pena olhar bem para esse trecho. Ele é a prova de que a compreensão
continua se comportando como antes, **e** de que o mecanismo por baixo mudou por
completo. Compatibilidade preservada em cima, arquitetura trocada embaixo.

## Como ler isso sozinho

Três comandos que cobrem quase tudo:

```python
import dis

dis.dis(minha_funcao)              # a desmontagem completa
dis.show_code(minha_funcao)        # constantes, nomes, co_stacksize, flags

for i in dis.get_instructions(f):  # tratável em código
    print(i.opname, i.argrepr)
```

E uma sugestão de uso que vale mais que decorar opcode: quando duas formas de
escrever a mesma coisa parecerem equivalentes, **desmonte as duas e conte as
instruções**. É mais rápido que cronometrar, não sofre com ruído de máquina, e
costuma explicar a diferença em vez de só medi-la.

Com uma ressalva que a próxima parte vai desenvolver: **contar instruções não é
medir tempo**. A partir do 3.11 o interpretador reescreve o próprio bytecode
enquanto roda, e o que o `dis` mostra é o ponto de partida, não o que executa no
quinto milésimo de segundo.

---

*Próxima parte: o interpretador que se especializa sozinho — como o Python 3.11
ficou substancialmente mais rápido sem trocar de arquitetura.*

## Referências

- [`dis`](https://docs.python.org/3/library/dis.html) — documentação do módulo e de cada instrução
- [PEP 709 — Inlined Comprehensions](https://peps.python.org/pep-0709/)
- [The bytecode interpreter](https://github.com/python/cpython/blob/main/InternalDocs/interpreter.md) — sobre escopo e as instruções de carregamento
- [Objetos de código](https://docs.python.org/3/reference/datamodel.html#code-objects) — `co_stacksize`, `co_consts`, `co_varnames`
