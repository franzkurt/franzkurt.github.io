---
title: "Python in-depth, parte 0: o que acontece quando você aperta enter"
date: 2025-05-31 10:00:00 -0300
tags: [python, cpython, internals, iniciantes]
description: "O mapa antes do detalhe. Se você já escreveu Python mas nunca parou para pensar como ele roda, este texto é o vocabulário e a visão geral que as próximas seis partes vão usar."
---

*Série **Python in-depth**, o percurso completo:
**0.** o mapa (esta) ·
**1.** [do fonte ao bytecode](/2025/06/python-por-dentro-do-fonte-ao-bytecode/) ·
**2.** [máquina de pilha](/2025/06/python-por-dentro-maquina-de-pilha/) ·
**3.** [lendo bytecode com o `dis`](/2025/06/python-por-dentro-lendo-bytecode/) ·
**4.** [o interpretador que se reescreve](/2025/06/python-por-dentro-interpretador-especializado/) ·
**5.** [do 3.9 ao 3.13](/2025/07/python-por-dentro-do-39-ao-313/) ·
**6.** [o que os projetistas escreveram](/2025/07/python-por-dentro-o-que-guido-escreveu/).*

*E os **aprofundamentos**, cada um a partir de uma fonte primária, datados junto
do texto que os originou:
[cache inline](/2021/01/cache-inline-como-o-interpretador-aprende/) ·
[o bytecode que se reescreve](/2021/02/quickening-o-bytecode-que-se-reescreve/) ·
[o ponteiro que carrega o número](/2021/02/ponteiro-etiquetado-e-o-preco-do-int/) ·
[anotar `int` não acelera](/2023/06/anotar-int-nao-deixa-o-python-rapido/) ·
[a fronteira que o JIT não atravessa](/2024/01/a-fronteira-que-o-jit-nao-atravessa/) ·
[o objeto que contém a si mesmo](/2019/05/o-objeto-que-contem-a-si-mesmo/).*

Você escreve um arquivo, digita `python programa.py`, aperta enter, e algo
acontece. Este texto é sobre esse *algo*.

Ele abre a série **Python in-depth**, que desce bem fundo no funcionamento do
Python — e esta parte existe para que **não seja preciso saber nada de antemão**
para acompanhar. Aqui está o mapa e o vocabulário; as partes seguintes gastam uma
seção inteira em cada caixinha dele.

Se você é estagiário, está no primeiro emprego, ou simplesmente nunca pensou
nisso, comece por aqui. Se já conhece o assunto, esta parte é dispensável — vá
direto para a [parte 1](/2025/06/python-por-dentro-do-fonte-ao-bytecode/).

<!--more-->

## A confusão mais comum: compilado ou interpretado?

A resposta curta é **os dois**, e a resposta longa é mais útil.

Costuma-se dizer que existem duas famílias de linguagens. As **compiladas**, como
C, em que um programa traduz o seu código para instruções que o processador
executa diretamente, e você distribui o resultado. E as **interpretadas**, em que
um programa lê o seu código e vai executando linha por linha.

O Python não é nenhum dos dois puros. Ele faz uma **tradução**, como uma
linguagem compilada — mas não traduz para instruções do processador. Traduz para
uma linguagem intermediária, inventada para ele, chamada **bytecode**. E aí um
segundo programa, o **interpretador**, executa esse bytecode.

Por que essa volta? Porque o bytecode é o mesmo em qualquer computador. O mesmo
`.py` roda no seu notebook e num servidor de arquitetura diferente, porque quem
lida com as diferenças é o interpretador, não o seu código.

## As quatro palavras que a série usa o tempo todo

Só quatro. Se você sair daqui com elas, o resto da série é acessível.

**Token.** O menor pedaço com significado do seu código. Na linha `x = a + 1`,
os tokens são `x`, `=`, `a`, `+`, `1`. É o que sobra quando o computador para de
ver texto e passa a ver símbolos. Quebrar o texto em tokens é a primeira coisa
que acontece.

**Árvore.** Depois dos tokens, o Python monta uma **árvore** que representa a
estrutura do que você escreveu. `x = a + 1` vira algo como: "uma atribuição, cujo
alvo é `x`, cujo valor é uma soma entre `a` e `1`". É uma árvore porque a soma
pode ter outra soma dentro, que pode ter uma chamada de função dentro, e assim
por diante. O nome técnico é **AST**, de *abstract syntax tree* — árvore de
sintaxe abstrata.

**Bytecode e opcode.** A árvore vira uma **lista de instruções muito simples**,
que é o bytecode. Cada instrução se chama **opcode** e faz uma coisa só:
"carregue a variável `a`", "some os dois últimos valores", "guarde em `x`".
Parece burro de tão simples, e é exatamente o ponto — instrução simples é rápida
de executar.

**Pilha.** O lugar onde essas instruções guardam os valores enquanto trabalham.
Imagine uma pilha de pratos: você só mexe no de cima. Para somar `a + 1`, o
Python coloca `a` na pilha, coloca `1` em cima, e a instrução de soma **tira os
dois** e **coloca o resultado**. Sempre pelo topo.

Essa última é a que mais gente estranha, então vale insistir: no nível do
bytecode **não existem variáveis nomeadas nas operações**. Existe uma pilha, e as
instruções empurram e puxam coisas dela.

## O caminho completo, em cinco passos

Com o vocabulário, o caminho fica legível:

```
seu arquivo .py
      ↓  (1) quebra em tokens
    tokens
      ↓  (2) monta a árvore
     árvore (AST)
      ↓  (3) vira lista de instruções
   instruções
      ↓  (4) limpa o que é inútil
   instruções melhores
      ↓  (5) vira a sequência final
    bytecode
      ↓  o interpretador executa
   seu programa rodando
```

Os passos 1 a 5 são a **compilação**, e acontecem em milissegundos, toda vez que
o arquivo é carregado. O que vem depois é a **execução**.

Aqueles arquivos `.pyc` na pasta `__pycache__` que aparecem sozinhos? É o
bytecode guardado em disco, para não refazer os cinco passos na próxima vez.
Nunca foi mistério nem sujeira — é cache.

## Você pode ver tudo isso agora

Nada aqui exige instalar nada. Abra o Python e experimente:

```python
>>> import dis
>>> def soma(a, b):
...     return a + b
...
>>> dis.dis(soma)
```

Vai sair algo assim:

```
LOAD_FAST    a
LOAD_FAST    b
BINARY_OP    +
RETURN_VALUE
```

Leia em voz alta: **carregue `a`; carregue `b`; some os dois; devolva.** É isso
que o seu `return a + b` virou. Quatro instruções, cada uma fazendo uma coisa.

Essa é a máquina que a série vai destrinchar.

## O que vem em cada parte

- **[Parte 1](/2025/06/python-por-dentro-do-fonte-ao-bytecode/) — os cinco
  passos por dentro.** Quem faz cada um, em qual arquivo do CPython, e a troca
  do analisador de sintaxe que aconteceu no Python 3.9.
- **[Parte 2](/2025/06/python-por-dentro-maquina-de-pilha/) — por que pilha.**
  Existe outro jeito de organizar isso, usado por outras linguagens. Por que o
  Python não foi por ali — e por que a explicação que se repete não sobreviveu
  quando fui medir.
- **[Parte 3](/2025/06/python-por-dentro-lendo-bytecode/) — lendo bytecode de
  verdade.** Um laço, uma compreensão de lista e três formas de acessar um
  valor, com o custo de cada uma.
- **[Parte 4](/2025/06/python-por-dentro-interpretador-especializado/) — o
  bytecode que muda sozinho.** Desde o 3.11, o interpretador reescreve as
  próprias instruções enquanto o programa roda. Dá para ver acontecendo.
- **[Parte 5](/2025/07/python-por-dentro-do-39-ao-313/) — o que mudou em cada
  versão**, e por que as mudanças formam uma corrente em vez de uma lista.
- **[Parte 6](/2025/07/python-por-dentro-o-que-guido-escreveu/) — o que os
  projetistas escreveram**, contra o que se repete por aí.

## Por que isso vale o seu tempo

Você não precisa disso para escrever Python. Milhões de pessoas produzem software
bom sem nunca ter aberto o `dis`.

O que muda é outra coisa. Quando você sabe que acessar uma variável local é
diferente de acessar uma global, deixa de decorar a regra de otimização e passa a
**deduzi-la**. Quando entende que a indentação vira token no primeiro passo,
para de achar que misturar tabulação e espaço é frescura do editor. E quando um
erro estranho aparece, você tem um modelo mental de onde procurar em vez de uma
lista de sintomas.

É a diferença entre saber que funciona e saber **por que**. A segunda envelhece
muito melhor.

## Referências

- [`dis`](https://docs.python.org/3/library/dis.html) — o desmontador usado nos exemplos, e a lista de opcodes
- [Glossário do Python](https://docs.python.org/3/glossary.html) — as definições oficiais de bytecode, token e afins
- [PEP 3147 — PYC Repository Directories](https://peps.python.org/pep-3147/) — de onde veio o `__pycache__`
- [Cached bytecode invalidation](https://docs.python.org/3/reference/import.html#cached-bytecode-invalidation) — quando o `.pyc` é reaproveitado e quando é refeito
- [Design and History FAQ](https://docs.python.org/3/faq/design.html) — as perguntas de projeto respondidas pelos próprios mantenedores
- [InternalDocs/compiler.md](https://github.com/python/cpython/blob/main/InternalDocs/compiler.md) — o caminho do fonte ao bytecode, na fonte
