---
title: "Cache inline: como o interpretador aprende com o que já viu"
date: 2021-01-16 10:00:00 -0300
tags: [python, interpretadores, performance, cpython]
description: "Ler o.x parece de graça, mas é uma busca de nome dentro de um tipo, toda vez. O truque que resolve isso é de 1984, e o seu CPython reserva 18 bytes por leitura de atributo para usá-lo."
---

*Aprofundamento da série **[Python in-depth](/2025/05/python-por-dentro-parte-0-o-mapa/)** — o índice das partes está na parte 0.*

*Primeiro de três textos sobre como um interpretador fica rápido, a partir da
série de [Max Bernstein](https://bernsteinbear.com/blog/inline-caching/):
**1.** esta · **2.** [reescrever o próprio bytecode](/2021/02/quickening-o-bytecode-que-se-reescreve/) ·
**3.** [o ponteiro que carrega o número](/2021/02/ponteiro-etiquetado-e-o-preco-do-int/).*

Esta linha parece não custar nada:

```python
def le(o):
    return o.x
```

Mas pense no que o interpretador precisa fazer. Ele não sabe o tipo de `o` —
descobre na hora. E aí precisa procurar o nome `x`: primeiro no objeto, depois no
tipo, depois nas bases do tipo, seguindo a ordem de resolução. Toda vez.

O truque que resolve isso é de **1984**, e o seu Python usa uma versão dele agora
mesmo.

<!--more-->

## A observação que faz tudo funcionar

Deutsch e Schiffman, trabalhando em Smalltalk, notaram uma regularidade que
parece banal e não é:

> Num dado ponto do código, o objeto que chega costuma ser do mesmo tipo que o
> objeto que chegou da última vez que aquele ponto executou.

Repare na precisão da frase. Não diz "programas dinâmicos usam poucos tipos" —
isso seria falso. Diz que **cada ponto do código**, individualmente, costuma ver
sempre o mesmo tipo. Um programa com cinquenta classes pode ter um `o.x` que só
vê `Pedido`, outro que só vê `Cliente`, e os dois estarem certos.

Se isso vale, existe uma otimização óbvia: guarde a resposta ali mesmo, ao lado
da instrução.

## O cache, em três estados

A ideia é anexar a cada instrução um espacinho de memória com duas coisas:

| campo | conteúdo |
|---|---|
| chave | o tipo que apareceu da última vez |
| valor | onde encontrar o atributo, já resolvido |

E a instrução passa a ter três caminhos:

1. **Cache vazio** — faz a busca completa, guarda o resultado e o tipo.
2. **Acerto** — o tipo bate com a chave. Usa o valor guardado, sem busca.
3. **Erro** — o tipo é outro. Joga fora, faz a busca, guarda de novo.

É só isso. E funciona porque o caso 2 domina.

Um detalhe que muda a intuição: o cache **não é por nome**, é **por posição no
bytecode**. Dois `o.x` em linhas diferentes têm caches separados e
independentes. Isso importa mais do que parece, e volto nisso no fim.

## O seu CPython faz exatamente isso

Aqui deixa de ser teoria. Desde o 3.11, o CPython reserva espaço de cache
**embutido no próprio fluxo de bytecode**, e dá para contar:

```python
import dis
dis._inline_cache_entries["LOAD_ATTR"]
```

| instrução | entradas de cache | bytes reservados |
|---|---|---|
| `LOAD_ATTR` | **9** | 18 |
| `LOAD_GLOBAL` | 4 | 8 |
| `STORE_ATTR` | 4 | 8 |
| `CALL` | 3 | 6 |
| `BINARY_OP` | 1 | 2 |

Toda leitura de atributo do seu programa carrega 18 bytes de espaço em branco,
esperando ser preenchidos. Eles não são código: são o bloquinho de anotação da
instrução.

## E a anotação vira um opcode diferente

O CPython vai além do cache clássico: ele usa o que aprendeu para **trocar a
instrução**. Três classes que guardam `x` de maneiras diferentes:

```python
class ComDict:                    # atributo no dicionário da instância
    def __init__(self): self.x = 1

class ComSlots:
    __slots__ = ("x",)            # atributo em slot fixo
    def __init__(self): self.x = 2

class ComPropriedade:
    @property                     # atributo calculado
    def x(self): return 3
```

A mesma função `le(o)`, aquecida com 500 chamadas de cada uma, e o bytecode
inspecionado com `dis.get_instructions(le, adaptive=True)`:

| aquecida com | a instrução virou |
|---|---|
| `ComDict` | `LOAD_ATTR_INSTANCE_VALUE` |
| `ComSlots` | `LOAD_ATTR_SLOT` |
| `ComPropriedade` | `LOAD_ATTR_PROPERTY` |

Três opcodes diferentes, a partir do **mesmo código-fonte**. O interpretador
escolheu com base no que passou por ali.

O preço de cair no caminho mais caro, como mínimo de 7 repetições de 3 milhões
de leituras:

| caminho | por leitura |
|---|---|
| `LOAD_ATTR_INSTANCE_VALUE` | 14,4 ns |
| `LOAD_ATTR_PROPERTY` | 20,1 ns |

## Uma medição que eu não consegui fazer

Vale registrar, porque a tentativa ensina mais que o resultado.

Eu quis medir a **penalidade de o cache errar** — a mesma função vendo tipos
alternados. Montei o teste, rodei, e deu 1,27×. Rodei de novo: 0,59×. E de novo:
1,08×.

Isso não é medição, é ruído. O efeito, nesta máquina, é menor que a variação
entre execuções, e a única conclusão honesta é que **não consegui medir**. Fica o
registro de que o CPython absorve troca de tipo melhor do que o cache
monomórfico ingênuo sugeriria — mas quanto melhor, eu não sei dizer.

A primeira versão deste texto ia publicar o 1,27×. Teria sido um número inventado
com aparência de dado, que é o defeito que
[um artigo inteiro deste blog](/2025/09/sete-erros-de-medicao/) descreve.

## O que fica

**A otimização não vem de saber o tipo, vem de apostar nele.** O cache não prova
que `o` é `ComDict`; aposta que será, e confere a aposta com uma comparação
barata.

**Errar precisa ser barato, não impossível.** É a diferença entre um interpretador
e um compilador antecipado, e é o motivo de
[anotar `int` não acelerar nada](/2023/06/anotar-int-nao-deixa-o-python-rapido/):
a anotação não dá a garantia, e o interpretador não precisa dela.

**O cache é por ponto do código.** Isso explica por que uma função utilitária
chamada com dez tipos diferentes é mais lenta que dez funções específicas — não
por causa do `if`, mas porque ela tem um cache só para dez apostas.

Falta uma peça. Mesmo quando o cache acerta, ainda sobra o custo de *verificar se
o cache está preenchido* e de fazer uma chamada indireta. A
[parte 2](/2021/02/quickening-o-bytecode-que-se-reescreve/) mostra como se
elimina até isso, reescrevendo o bytecode em execução.

## Referências

- [Inline caching](https://bernsteinbear.com/blog/inline-caching/) — Max Bernstein, o texto que originou este
- [PEP 659 — Specializing Adaptive Interpreter](https://peps.python.org/pep-0659/) — como o CPython implementa isso
- [`dis`](https://docs.python.org/3/library/dis.html) — o desmontador, `adaptive=True` e `_inline_cache_entries`
- [Efficient implementation of the Smalltalk-80 system](https://www.semanticscholar.org/paper/Efficient-implementation-of-the-smalltalk-80-system-Deutsch-Schiffman/2f4002755b309cdb91e18116b8028005497d8400) — Deutsch e Schiffman, 1984, a observação original
- [InternalDocs/interpreter.md](https://github.com/python/cpython/blob/main/InternalDocs/interpreter.md) — a especialização documentada pelos mantenedores
