---
title: "Python in-depth, parte 5: do 3.9 ao 3.13, uma decisão puxando a outra"
date: 2025-07-05 10:00:00 -0300
tags: [python, cpython, internals, versões, performance]
description: "Cinco versões que parecem uma lista de novidades e são uma cadeia. O parser novo do 3.9 é o que tornou o match do 3.10 possível, e os objetos imortais do 3.12 são pré-requisito do free threading do 3.13."
---

*Parte da série **Python in-depth**, sobre o funcionamento interno do Python. Se
os termos **token**, **bytecode**, **opcode** ou **pilha** não forem familiares,
a [parte 0](/2025/05/python-por-dentro-parte-0-o-mapa/) apresenta todos eles em
linguagem simples — e é lá que está o índice das partes e dos aprofundamentos.*

As quatro partes anteriores desta série olharam o Python parado: o
[caminho do fonte ao bytecode](/2025/06/python-por-dentro-do-fonte-ao-bytecode/),
a [máquina de pilha](/2025/06/python-por-dentro-maquina-de-pilha/), o
[bytecode na prática](/2025/06/python-por-dentro-lendo-bytecode/) e o
[interpretador que se especializa](/2025/06/python-por-dentro-interpretador-especializado/).

Esta parte olha o Python em movimento. E a tese é que as mudanças de 3.9 para cá
**não são uma lista de novidades** — são uma cadeia em que cada elo depende do
anterior. Quem olha versão a versão vê recursos soltos; quem olha a sequência vê
um plano.

<!--more-->

## 3.9 — trocar o parser antes de precisar dele

A mudança que abre a série também abre esta parte: o **parser PEG**
([PEP 617](https://peps.python.org/pep-0617/)), com o antigo mantido por um
ciclo, selecionável por opção de linha de comando.

Para ver o que isso destravou, é preciso saber o que o antigo **não conseguia
fazer**. Ele era `LL(1)`: escolhia qual regra da gramática aplicar olhando
**um único token à frente**.

Isso é rápido, é simples de implementar, e é uma camisa de força. A PEP 617 é
direta sobre o preço que se pagava:

> *This new parser would allow the elimination of multiple "hacks" that exist
> in the current grammar to circumvent the LL(1)-limitation.*

O PEG não tem esse teto. A mesma PEP descreve que ele tem *"infinite
lookahead"* — pode considerar quantos tokens precisar antes de decidir a regra.
Em troca, precisa de uma técnica chamada *packrat parsing* para não estourar o
tempo, porque a busca com retrocesso seria exponencial sem ela.

E aqui está a parte que eu achava ser só interpretação minha, até ler o plano de
migração da própria PEP. Não é que "nenhum recurso novo apareceu" por acaso:
**foi proibido aparecer.**

> *In the meanwhile and until the old parser is removed, no new Python Grammar
> addition will be added that requires the PEG parser.*

Ou seja, o 3.9 entregou de propósito um parser mais capaz **sem usar a
capacidade nova**, para que a troca pudesse ser revertida se desse errado. O
retorno ficou represado por uma versão inteira, por decisão explícita.

## 3.10 — os recursos que só existem por causa do 3.9

Removido o parser antigo, a represa abre. Duas coisas chegam, e as duas têm a
mesma origem.

**Gerenciadores de contexto entre parênteses.** Isto passou a ser válido:

```python
with (
    open("a") as f,
    open("b") as g,
):
    ...
```

Parece detalhe de formatação e não é. Com um token de antecedência, ao encontrar
o `(` o parser não tem como saber se aquilo é uma tupla comum ou uma lista de
gerenciadores — o que distingue os dois é o `as`, que pode estar muitos tokens
depois. A documentação do 3.10 não deixa dúvida sobre a causa:

> *This new syntax uses the non LL(1) capacities of the new parser.*

**Casamento de padrões**, o `match`/`case`
([PEP 634](https://peps.python.org/pep-0634/)). O mesmo problema, mais agudo:

```python
match ponto:
    case Ponto(x=0, y=0): ...   # padrão de classe, não chamada de função
    case (a, b): ...            # padrão de sequência, não tupla
    case x if x > 10: ...       # padrão com guarda
```

Nenhuma das três se distingue da construção comum de mesma aparência olhando um
token à frente. Com o parser antigo, cada uma exigiria mais um dos *hacks* que a
PEP 617 existia para eliminar.

E as **mensagens de erro**, que vieram na mesma versão e pela mesma razão: o
parser sabe qual alternativa da gramática estava tentando quando falhou. Seis
exemplos, todos rodados no 3.13:

| o que você escreveu | o que o Python responde |
|---|---|
| `x = (1, 2` | `'(' was never closed` |
| `if x = 1:` | `invalid syntax. Maybe you meant '==' or ':=' instead of '='?` |
| `if x` | `expected ':'` |
| `d = {'a': 1 'b': 2}` | `invalid syntax. Perhaps you forgot a comma?` |
| `f'{x'` | `f-string: expecting '}'` |
| `print 'oi'` | `Missing parentheses in call to 'print'. Did you mean print(...)?` |

Nenhuma dessas seis é trabalho de redação. São consequência de o parser saber
onde estava quando tropeçou — informação que o LL(1) descartava.

Trocar uma peça central um ciclo antes de precisar dela, e segurar o benefício
de propósito para poder voltar atrás, é o tipo de decisão que só se reconhece
depois.

## 3.11 — a maior aceleração de uma versão só

O **interpretador adaptativo especializado**
([PEP 659](https://peps.python.org/pep-0659/)), assunto da parte 4, chega junto
com o salto de desempenho mais comentado da história da linguagem: **de 10% a
60%**, dependendo da carga.

Duas outras peças entram no mesmo pacote:

**Exceções de custo zero.** O `try` deixou de custar caro quando **nada** é
lançado. Antes, entrar num bloco protegido montava estado; agora o custo é
deslocado para o momento da exceção, consultando uma tabela. Código defensivo
parou de pagar pedágio pelo caso que não acontece.

**Localização fina de erro**
([PEP 657](https://peps.python.org/pep-0657/)): o rastreamento passou a apontar
a **coluna exata**, não só a linha. Aquele `^^^^` embaixo da subexpressão que
falhou vem daqui — e é possível porque cada instrução de bytecode agora carrega
o intervalo de colunas que a originou.

## 3.12 — duas mudanças que parecem não ter relação

**Compreensões embutidas** ([PEP 709](https://peps.python.org/pep-0709/)), que a
parte 3 desmontou: some a função temporária, some o frame, e vêm 11% no conjunto
do pyperformance.

**GIL por interpretador** ([PEP 684](https://peps.python.org/pep-0684/)): cada
subinterpretador passa a ter a própria trava, o que permite usar vários núcleos
dentro de um processo — desde que o trabalho seja dividido em subinterpretadores.

**Sintaxe de parâmetro de tipo** ([PEP 695](https://peps.python.org/pep-0695/)):
`class Caixa[T]`, sem importar `TypeVar` nem herdar de `Generic`.

E **objetos imortais** ([PEP 683](https://peps.python.org/pep-0683/)), que
passaram quase sem comentário: objetos que vivem o processo inteiro ganham uma
contagem de referências que nunca é alterada.

Essa última parece uma micro-otimização. Não é — é a próxima peça da cadeia.

## 3.13 — o elo que explica o 3.12

Chega o **free threading** ([PEP 703](https://peps.python.org/pep-0703/)), ainda
experimental: um build do CPython **sem o GIL**.

Agora olhe para trás. Sem GIL, cada incremento de contagem de referências em
`None`, em `True` ou no inteiro `1` viraria uma escrita atômica numa linha de
cache disputada por todas as threads do processo — o padrão que destrói
escalabilidade. Tornar esses objetos **imortais** no 3.12 elimina a escrita.

Ou seja: os objetos imortais não eram uma micro-otimização. Eram **pré-requisito**.
E o GIL por interpretador, da mesma versão, foi o passo intermediário — dividir a
trava antes de tentar removê-la.

Chega também o **compilador JIT experimental**
([PEP 744](https://peps.python.org/pep-0744/)), desligado por padrão, que gera
código de máquina em vez de só bytecode especializado. O ganho inicial é modesto,
cerca de 5%, e o próprio PEP é explícito quanto ao objetivo: construir consenso
sobre os critérios para o JIT deixar de ser experimental. É um elo anunciado
antes de estar pronto, que é como esse projeto tem trabalhado.

## Tudo junto, na ordem

| Versão | O que entrou | O que isso destravou |
|---|---|---|
| 3.9 | parser PEG | a sintaxe do `match` e as mensagens de erro do 3.10 |
| 3.10 | `match`/`case`, erros melhores | — |
| 3.11 | interpretador especializado | o caminho do JIT |
| 3.12 | objetos imortais, GIL por interpretador | o free threading do 3.13 |
| 3.13 | free threading, JIT experimental | — |

Lendo a coluna da direita, o padrão fica claro: **a versão que entrega o recurso
quase nunca é a que fez o trabalho difícil.** O parser saiu um ciclo antes do
`match`. A imortalidade saiu um ciclo antes do free threading. O interpretador
especializado saiu dois ciclos antes do JIT.

E há uma consequência prática para quem lê notas de versão: mudança interna
anunciada sem benefício visível costuma ser a peça mais importante do release. O
recurso que aparece na manchete normalmente já estava pago.

## Referências

- [PEP 617 — New PEG parser for CPython](https://peps.python.org/pep-0617/)
- [PEP 634 — Structural Pattern Matching](https://peps.python.org/pep-0634/)
- [PEP 657 — Include Fine Grained Error Locations in Tracebacks](https://peps.python.org/pep-0657/)
- [PEP 659 — Specializing Adaptive Interpreter](https://peps.python.org/pep-0659/)
- [PEP 683 — Immortal Objects](https://peps.python.org/pep-0683/)
- [PEP 684 — A Per-Interpreter GIL](https://peps.python.org/pep-0684/)
- [PEP 695 — Type Parameter Syntax](https://peps.python.org/pep-0695/)
- [PEP 703 — Making the Global Interpreter Lock Optional](https://peps.python.org/pep-0703/)
- [PEP 709 — Inlined Comprehensions](https://peps.python.org/pep-0709/)
- [PEP 744 — JIT Compilation](https://peps.python.org/pep-0744/)
- [What's New in Python](https://docs.python.org/3/whatsnew/index.html) — as notas oficiais de cada versão
