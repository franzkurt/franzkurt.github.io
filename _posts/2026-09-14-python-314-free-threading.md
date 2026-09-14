---
title: "Python 3.14 na prática: o que mudou e o que o free threading custa"
date: 2026-09-14 15:30:00 -0300
tags: [python, engenharia, concorrência]
description: "As mudanças do 3.14 que você encontra no dia a dia, um benchmark real de free threading com e sem GIL, e a conta que ninguém coloca no slide: overhead de single-thread, extensões C que religam o GIL em silêncio e o estado das dependências."
---

O Python 3.14 saiu em 7 de outubro de 2025 e a manchete foi o free threading deixar
de ser experimento: a [PEP 779](https://peps.python.org/pep-0779/) declarou o build
sem GIL oficialmente suportado. É uma mudança grande, mas não é a que você vai
encontrar primeiro — as que aparecem no dia a dia são menores e mais imediatas.

Este texto tem duas partes: um passeio pelo que mudou e, depois, a conta honesta do
free threading, com um benchmark que rodei nos dois builds.

<!--more-->

## As mudanças que você encontra primeiro

### `except` sem parênteses

Pequeno, mas você vai usar hoje ([PEP 758](https://peps.python.org/pep-0758/)):

```python
# antes
except (TimeoutError, ConnectionRefusedError):
    ...

# 3.14
except TimeoutError, ConnectionRefusedError:
    ...
```

### Template strings

A [PEP 750](https://peps.python.org/pep-0750/) introduz o prefixo `t`. Diferente
de uma f-string, uma t-string **não** produz um `str`: produz um `Template` com as
partes literais e as interpolações separadas.

```python
from string.templatelib import Template

nome = "<script>alert(1)</script>"
template = t"Olá, {nome}!"

type(template)
# <class 'string.templatelib.Template'>

list(template)
# ['Olá, ', Interpolation('<script>alert(1)</script>', ...), '!']
```

A diferença importa: com f-string, o valor já virou texto antes de você poder
tratá-lo. Com t-string, quem processa o template ainda consegue escapar cada
interpolação de acordo com o destino — HTML, SQL, shell. É a peça que faltava para
bibliotecas oferecerem interpolação segura sem inventar uma mini-linguagem.

### Annotations adiadas

A [PEP 649](https://peps.python.org/pep-0649/) muda o momento em que as anotações
são avaliadas: agora só quando alguém as pede. Na prática, `from __future__ import
annotations` deixou de ser necessário e referência circular parou de exigir aspas.

```python
class No:
    def filho(self) -> No:   # antes: NameError; agora funciona
        ...
```

Para inspecionar em tempo de execução existe o módulo novo `annotationlib`, com
três formatos — `VALUE` (avalia), `FORWARDREF` (deixa marcadores para o que não
resolve) e `STRING` (devolve o texto).

O detalhe que morde: código que lia `__annotations__` diretamente esperando
strings, ou esperando valores já avaliados, pode ver o contrário do que via antes.
Quem usa Pydantic, dataclasses ou qualquer coisa que inspecione tipos em runtime
deve atualizar a biblioteca antes de atualizar o Python.

### Depurar um processo que já está rodando

Esta é a que mais me surpreendeu ([PEP 768](https://peps.python.org/pep-0768/)):

```bash
python -m pdb -p 12345          # conecta ao PID em execução
python -m asyncio ps 12345      # tarefas asyncio do processo
python -m asyncio pstree 12345  # árvore de corrotinas
```

Sem instrumentar o código, sem reiniciar com flag especial. Para aquele processo em
produção que travou e você não sabe onde, isso muda o jogo. Dá para desligar com
`PYTHON_DISABLE_REMOTE_DEBUG` ou `-X disable-remote-debug`.

### Outras que valem citar

- **`compression.zstd`** ([PEP 784](https://peps.python.org/pep-0784/)): Zstandard
  na biblioteca padrão, dentro de um novo pacote `compression` que também reexporta
  `gzip`, `lzma`, `bz2` e `zlib`.
- **`return` dentro de `finally`** agora emite `SyntaxWarning`
  ([PEP 765](https://peps.python.org/pep-0765/)) — ele engole exceções, e quase
  sempre é bug.
- **`multiprocessing` passou a usar `forkserver` por padrão** no Linux, em vez de
  `fork`. Mais seguro com threads, mas muda o comportamento de quem dependia de
  herdar estado do processo pai.
- **Mensagens de erro melhores**, incluindo sugestão de palavra-chave
  (`whille` → "Did you mean 'while'?").

## Free threading: o que o benchmark mostra

Peguei um trabalho puramente CPU-bound — contar primos por divisão sucessiva até
300.000 — e dividi entre N threads com `ThreadPoolExecutor`. Sem I/O, sem espera:
exatamente o caso em que o GIL sempre foi o teto.

Um detalhe do desenho que muda o resultado: a divisão do trabalho é **intercalada**,
não em faixas contíguas. Testar se 299.999 é primo custa muito mais que testar 3, e
com faixas contíguas a última thread receberia o dobro de trabalho da primeira — o
speedup medido sairia menor por desbalanceamento, não por causa do GIL.

```python
from concurrent.futures import ThreadPoolExecutor

LIMITE = 300_000

def conta_primos(resto, n_threads):
    c = 0
    for n in range(2 + resto, LIMITE, n_threads):   # intercalado
        d, ok = 2, True
        while d * d <= n:
            if n % d == 0:
                ok = False
                break
            d += 1
        if ok:
            c += 1
    return c

def roda(n):
    with ThreadPoolExecutor(max_workers=n) as ex:
        return sum(ex.map(lambda i: conta_primos(i, n), range(n)))
```

Rodei em três configurações, todas com **o mesmo interpretador 3.14.7 vindo do
mesmo toolchain** (`python-build-standalone`, via `uv`), na mesma máquina — 8
núcleos físicos, 16 lógicos. Melhor de três execuções:

| Threads | 3.14 (com GIL) | 3.14t (sem GIL) | 3.14t com `PYTHON_GIL=1` |
|---|---|---|---|
| 1 | 0,72 s | 0,60 s | 0,69 s |
| 2 | 0,75 s | 0,62 s | 0,64 s |
| 4 | 0,74 s | 0,43 s | 0,66 s |
| 8 | 0,72 s | **0,27 s** | 0,65 s |

Três leituras, em ordem de importância:

**A coluna do meio é o ponto.** De 0,72 s para 0,27 s — 2,7 vezes mais rápido no
mesmo hardware, com o mesmo código. A coluna da esquerda é plana: adicionar threads
num build com GIL não faz nada, porque só uma executa bytecode por vez.

**A coluna da direita é o alerta.** É o build free-threaded com o GIL religado, e
ela também é plana. Esse é exatamente o estado em que você fica quando importa uma
extensão C que não se declarou compatível: o interpretador é o certo, a flag é a
certa, e mesmo assim não há paralelismo. Volto nisso na próxima seção.

**O primeiro toolchain que usei estava errado.** Minha primeira medição comparava a
imagem Debian (com GIL) contra o build do `uv` (free-threaded), e o free-threaded
saiu mais rápido até com uma thread — o que não faz sentido. Não fazia: eram
compiladores e flags diferentes. Só a segunda rodada, com os dois builds da mesma
origem, mede o que diz medir. Se você for repetir esse benchmark, controle isso
antes de acreditar no número.

### Isso é bom ou só parece?

2,7x em 8 threads numa máquina de 8 núcleos físicos pode parecer pouco. Para saber
se o teto era do free threading ou da máquina, rodei a mesma carga em **processos**:

| Trabalhadores | 8 threads livres | 8 processos |
|---|---|---|
| Tempo absoluto | 0,27 s | 0,26 s |

Praticamente idênticos. O free threading chegou onde o `multiprocessing` chega —
o limite aqui é o hardware (8 núcleos físicos com SMT, frequência variável), não o
modelo de concorrência. Só que sem pagar serialização entre processos nem cópia de
memória.

Uma ressalva sobre a primeira linha da tabela: no build free-threaded, uma thread
foi **mais rápida** que no build com GIL (0,60 s contra 0,72 s). Não generalize a
partir disso — é um microbenchmark de aritmética inteira, sem extensão C e sem
estado compartilhado. A medição ampla que vale é a da documentação oficial, e ela
diz o contrário: de 1% a 8% mais lento.

## E agora a conta

O free threading não é otimização gratuita. É uma troca, e vale saber o que está do
outro lado.

### 1. Single-thread fica mais lento

A documentação oficial estima **de 1% a 8%** de overhead no pyperformance — perto de
1% no macOS aarch64, perto de 8% no Linux x86-64. Se a sua carga é um processo web
que já escala por workers, você paga esse pedágio sem receber nada em troca.

### 2. Memória cresce

Objetos não gerenciados pelo GC ganham cabeçalho maior (`None` passa de 16 para 32
bytes), strings internadas viram imortais e o esquema de liberação adiada (QSBR)
segura memória por mais tempo. Nada disso é dramático isolado; somado, aparece no
gráfico de RSS.

### 3. Uma extensão C pode religar o GIL sem você perceber

Este é o mais traiçoeiro. Se você importar um módulo C que não se declarou seguro
para free threading, **o interpretador religa o GIL para o processo inteiro**. Ele
imprime um aviso, mas um aviso no meio do log de subida de uma aplicação é
exatamente o tipo de coisa que ninguém lê.

Não confie no aviso. Confie na checagem:

```python
import sys, sysconfig

assert sysconfig.get_config_var("Py_GIL_DISABLED"), \
    "este build não é free-threaded"
assert not sys._is_gil_enabled(), \
    "o GIL foi religado por alguma extensão C"
```

Duas linhas na subida da aplicação transformam uma regressão silenciosa de
performance em uma falha alta. Vale também no CI.

### 4. As corridas que o GIL escondia agora acontecem

O GIL nunca deixou seu código thread-safe — apenas tornou a janela de corrida
pequena o bastante para a maioria dos bugs não aparecer em teste. Sem ele, a janela
abre. Código que fazia `self.contador += 1` de várias threads sempre esteve errado;
a diferença é que agora ele erra em produção.

## O estado das dependências

Aqui está a parte que decide se dá para adotar, e o caso do **mypy** ilustra bem os
dois lados.

O mypy é compilado com mypyc, e a versão compilada é 3 a 5 vezes mais rápida que a
interpretada. Enquanto não existiram wheels `cp314t`, instalar mypy num build
free-threaded devolvia silenciosamente a versão pura em Python — o CI não quebrava,
só ficava várias vezes mais lento, e a causa não aparecia em lugar nenhum. Hoje o
mypy publica wheels compiladas para `cp314t` (a partir da 1.20), então esse caso
específico está resolvido; mas o suporte a free threading no mypyc segue marcado
como experimental, com acesso a atributo nativo e a item de lista ainda não seguros
sob concorrência.

É o padrão que se repete pelo ecossistema: **a ausência de wheel raramente falha de
forma barulhenta.** Ela cai para compilação a partir do fonte (lenta), para uma
versão pura em Python (lenta) ou religa o GIL (silenciosa).

Os pacotes grandes já atravessaram: NumPy (2.1+), pandas (2.2.3+), SciPy (1.15+),
Pydantic (2.11+), cryptography (46+), Pillow (11+) e lxml (7+) publicam wheels
free-threaded. Antes de adotar, confira a sua árvore inteira em um dos dois
rastreadores:

- [py-free-threading.github.io/tracking](https://py-free-threading.github.io/tracking/)
- [hugovk.dev/free-threaded-wheels](https://hugovk.dev/free-threaded-wheels/)

## Como testar sem virar a chave

Instalar o build paralelo é uma linha com o `uv`:

```bash
uv python install 3.14t
uv run --python 3.14t script.py
```

E dá para ligar e desligar o GIL no mesmo build, o que torna a comparação honesta:

```bash
PYTHON_GIL=0 python script.py   # ou -X gil=0
PYTHON_GIL=1 python script.py   # ou -X gil=1
```

Se o seu problema é paralelismo mas você não quer a superfície de risco do free
threading, o 3.14 trouxe outra porta: a
[PEP 734](https://peps.python.org/pep-0734/) levou múltiplos interpretadores para a
biblioteca padrão, cada um com seu próprio GIL e memória isolada.

```python
from concurrent.futures import InterpreterPoolExecutor

with InterpreterPoolExecutor(max_workers=4) as ex:
    resultados = list(ex.map(minha_funcao, entradas))
```

Custa mais que thread e menos que processo, e o isolamento significa que corrida de
memória compartilhada simplesmente não existe — você paga na serialização do que
atravessa a fronteira.

## O que eu faria

- **Atualizar para o 3.14 normal:** sim, e logo. As anotações adiadas e o pdb remoto
  valem sozinhos, e o risco é o de sempre.
- **Rodar o CI também no 3.14t:** sim, mesmo sem intenção de usar em produção. É
  como você descobre cedo quais dependências ainda não atravessaram, e as corridas
  que o GIL vinha escondendo no seu próprio código.
- **Colocar free threading em produção:** só com trabalho CPU-bound de verdade, a
  árvore de dependências conferida e as duas linhas de asserção acima na subida.
  Sem carga paralela real, você só comprou de 1% a 8% de lentidão.

A pergunta que resolve a decisão não é "o GIL acabou?". É "eu tenho trabalho
CPU-bound que hoje está espremido em um núcleo?". Se a resposta for não, o 3.14
ainda tem bastante coisa boa para você — só não é essa.
