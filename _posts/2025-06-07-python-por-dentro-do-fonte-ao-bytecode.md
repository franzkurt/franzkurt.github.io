---
title: "Python por dentro, parte 1: os cinco estágios do fonte ao bytecode"
date: 2025-06-07 10:00:00 -0300
tags: [python, cpython, internals, compilador, parser]
description: "Entre o arquivo .py e a execução há cinco etapas, cada uma num arquivo diferente do CPython. E a segunda delas foi trocada por inteiro no Python 3.9, por um motivo que vale entender."
---

*Esta é uma série sobre o funcionamento interno do Python. Se os termos
**token**, **bytecode**, **opcode** ou **pilha** não forem familiares, a
[parte 0](/2025/05/python-por-dentro-parte-0-o-mapa/) apresenta todos eles em
linguagem simples, e é o ponto de partida recomendado.*

Quando você roda um `.py`, o Python não interpreta o seu texto. Ele **compila**
— não para código de máquina, mas para bytecode — e só então executa. Entre uma
coisa e outra existem cinco etapas bem definidas, e cada uma mora num arquivo
diferente do CPython.

Esta série percorre esse caminho por dentro, citando o código-fonte, e usa as
decisões de projeto que foram tomadas ao longo dos anos para explicar por que o
Python de hoje é como é. Começa aqui, no caminho do fonte ao bytecode — e a
segunda etapa dele foi **trocada por inteiro no Python 3.9**, que é onde a série
começa.

<!--more-->

## Os cinco estágios

A documentação interna do CPython é direta ao listar o que acontece:

> Em CPython, a compilação de código-fonte para bytecode envolve vários passos:
>
> 1. Tokenizar o código-fonte — `Parser/lexer/` e `Parser/tokenizer/`
> 2. Analisar o fluxo de tokens numa Árvore de Sintaxe Abstrata — `Parser/parser.c`
> 3. Transformar a AST numa sequência de instruções — `Python/compile.c`
> 4. Construir um Grafo de Fluxo de Controle e otimizá-lo — `Python/flowgraph.c`
> 5. Emitir bytecode a partir do grafo — `Python/assemble.c`

Repare que são **cinco arquivos distintos**, e que a fronteira entre eles é
nítida. Isso não é detalhe de organização: cada estágio tem uma representação
própria do programa, e trocar um estágio sem tocar nos outros é possível — que é
exatamente o que aconteceu no 3.9.

## Estágio 1: o tokenizador

O primeiro passo transforma texto em símbolos. Nada de estrutura ainda — só a
classificação de cada pedaço.

Dá para ver acontecendo, porque o Python expõe o próprio tokenizador:

```python
>>> import tokenize, io
>>> for t in tokenize.generate_tokens(io.StringIO("x = a + 1\n").readline):
...     print(tokenize.tok_name[t.type], repr(t.string))
NAME     'x'
OP       '='
NAME     'a'
OP       '+'
NUMBER   '1'
```

O tokenizador do Python tem uma responsabilidade que a maioria não tem: ele
**gera os tokens de indentação**. `INDENT` e `DEDENT` não existem no texto — são
inventados aqui, contando espaços. É por isso que a indentação do Python é
sintaxe de verdade e não convenção: ela vira token antes de qualquer análise.

## Estágio 2: o parser, que mudou no 3.9

Aqui está a decisão de projeto mais interessante desta parte da série.

Até o Python 3.8, o parser era **LL(1)** — uma família de analisadores que decide
o que está lendo olhando **um único token à frente**. É rápido e simples de
implementar, e cobrava um preço que foi ficando caro.

A [PEP 617](https://peps.python.org/pep-0617/) enumera quatro problemas, e vale
ler com atenção porque cada um explica uma esquisitice da linguagem:

**Regras que não eram LL(1) de verdade.** Algumas construções violavam a
restrição, e a saída foi deixá-las passar no parser e **rejeitá-las depois**, na
geração da AST. Ou seja: parte da gramática do Python não estava na gramática.

**Geração de AST acoplada à forma da árvore.** O código precisava inspecionar o
formato do nó para descobrir qual alternativa da gramática tinha casado. Manter
isso era penoso.

**Recursão à esquerda proibida.** Não dava para escrever a regra natural
`expr: expr '+' term`. Era preciso reescrever como `expr: term ('+' term)*`, o
que distorce a árvore em relação ao que a linguagem realmente é.

**Uma árvore intermediária desperdiçada.** O sistema construía uma Árvore de
Sintaxe Concreta antes da AST, consumindo memória com longas correntes de nós de
filho único.

O PEG resolve os quatro. Ele usa **escolha ordenada** — tenta as alternativas em
sequência em vez de deduzir qual é pelo próximo token —, suporta recursão à
esquerda por memoização, e não tem ambiguidade: se uma string analisa, ela tem
exatamente uma árvore válida.

O PEG entrou no **3.9** com o parser antigo ainda disponível como alternativa, e
o antigo foi **removido no 3.10**. É a forma correta de trocar uma peça central:
um ciclo inteiro com as duas convivendo.

Há um detalhe de implementação que o CPython chama de incomum, e ele importa:

> A partir do Python 3.9, o parser do Python é um parser PEG de um desenho um
> tanto incomum. É incomum no sentido de que a entrada do parser é **um fluxo de
> tokens**, e não um fluxo de caracteres, que é o mais comum em parsers PEG.

Ou seja, mantiveram o tokenizador separado em vez de fundir as duas etapas — o
que preservou o estágio 1 intacto durante a troca.

E vale saber de onde o parser vem: ele é **gerado**. A gramática fica em
[`Grammar/python.gram`](https://github.com/python/cpython/blob/main/Grammar/python.gram),
e `Parser/parser.c` é produzido a partir dela. Mexer na sintaxe do Python é
editar uma gramática, não escrever um analisador.

O resultado do estágio 2 é a AST, e ela também é visível:

```python
>>> import ast
>>> print(ast.dump(ast.parse("x = a + 1\n"), indent=2))
Module(
  body=[
    Assign(
      targets=[Name(id='x', ctx=Store())],
      value=BinOp(
        left=Name(id='a', ctx=Load()),
        op=Add(),
        right=Constant(value=1)))])
```

Repare no `ctx=Store()` contra `ctx=Load()`: a árvore já sabe que `x` está sendo
**escrito** e `a` está sendo **lido**. Essa distinção, que o texto não carrega, é
o que permite o compilador escolher instruções diferentes mais adiante.

## Estágios 3, 4 e 5: até o bytecode

Da AST em diante o trabalho é do compilador, e ele se divide em três.

**`Python/compile.c`** percorre a árvore e emite uma sequência de instruções.
É aqui que se decide, por exemplo, que carregar uma variável local usa uma
instrução e carregar uma global usa outra — a informação de escopo é resolvida
neste ponto, não em tempo de execução.

**`Python/flowgraph.c`** monta o grafo de fluxo de controle e otimiza. É onde
código inalcançável some, saltos para saltos são encurtados e blocos vazios
desaparecem. Otimização em Python acontece aqui, e é bem mais modesta do que as
pessoas imaginam.

**`Python/assemble.c`** transforma o grafo em bytecode linear — a sequência de
bytes que vai para o objeto de código, junto com a tabela de constantes, os nomes
de variáveis e a tabela de exceções.

## O que isso muda na prática

Três coisas que eu levaria daqui.

**A indentação é sintaxe, resolvida no primeiro estágio.** Misturar tabulação e
espaço não é questão de estilo: é ambiguidade num tokenizador que precisa contar
colunas.

**Mensagem de erro melhor não é cosmética — é consequência de arquitetura.** As
mensagens mais úteis que chegaram do 3.10 em diante só foram possíveis porque o
parser novo sabe qual alternativa da gramática ele estava tentando. O parser
antigo não tinha essa informação para dar.

**Sintaxe nova custa menos do que parece.** Como a gramática é um arquivo que
gera o parser, propor sintaxe é editar uma regra e rodar o gerador. O que é caro
é decidir se a sintaxe deve existir — não implementá-la.

---

*Próxima parte: por que o interpretador é uma máquina de pilha, e o que acontece
quando se mede a alternativa em vez de repetir a explicação de sempre.*

## Referências

- [Compiler design](https://github.com/python/cpython/blob/main/InternalDocs/compiler.md) — a documentação interna do CPython que lista os cinco estágios
- [PEP 617 — New PEG parser for CPython](https://peps.python.org/pep-0617/)
- [`Grammar/python.gram`](https://github.com/python/cpython/blob/main/Grammar/python.gram) — a gramática de onde o parser é gerado
- [`Python/compile.c`](https://github.com/python/cpython/blob/main/Python/compile.c) · [`Python/flowgraph.c`](https://github.com/python/cpython/blob/main/Python/flowgraph.c) · [`Python/assemble.c`](https://github.com/python/cpython/blob/main/Python/assemble.c)
- [`tokenize`](https://docs.python.org/3/library/tokenize.html) e [`ast`](https://docs.python.org/3/library/ast.html) — os módulos usados nos exemplos
