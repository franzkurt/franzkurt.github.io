---
title: "O objeto que contém a si mesmo, e as três defesas do CPython"
date: 2019-05-04 10:00:00 -0300
tags: [python, cpython, casos-de-canto]
description: "ls = []; ls.append(ls). Agora imprima. O interpretador não trava — e o que ele faz para não travar aparece em três lugares diferentes, cada um com uma estratégia."
---

*Aprofundamento da série **[Python in-depth](/2025/05/python-por-dentro-parte-0-o-mapa/)** — o índice das partes está na parte 0.*

*A partir de [Recursive Python objects](https://bernsteinbear.com/blog/recursive-python-objects/),
de Max Bernstein, com os comportamentos conferidos aqui no Python 3.13.5.*

Duas linhas:

```python
ls = []
ls.append(ls)
```

Agora a lista contém a si mesma. Imprimir isso deveria ser um laço infinito — o
`repr` da lista chama o `repr` do conteúdo, que é a própria lista, que chama o
`repr` do conteúdo...

Só que não trava:

```python
>>> ls
[[...]]
```

Aquele `...` não é um enfeite. É uma defesa, e o interessante é que o CPython
tem **três** defesas diferentes para o mesmo problema — cada uma com uma
estratégia, e uma delas simplesmente desiste.

<!--more-->

## Defesa 1: o `repr` lembra por onde passou

A saída `[[...]]` significa "aqui entraria algo que já estamos imprimindo". O
CPython mantém uma lista dos objetos em processo de representação; ao reencontrar
um, imprime `...` em vez de descer.

Vale com dicionário também:

```python
>>> d = {}
>>> d['chave'] = d
>>> d
{'chave': {...}}
```

É a defesa mais elegante das três porque **não falha**: ela produz uma saída
correta e finita para uma estrutura infinita.

## Defesa 2: a comparação confere identidade primeiro

Comparar a lista consigo mesma também deveria recursar. Não recursa:

```python
>>> ls == ls
True
>>> ls == [ls]
True
```

A segunda linha é a que revela o mecanismo. `ls` e `[ls]` são objetos
**diferentes**, então a comparação desce para os elementos — e ali encontra `ls`
contra `ls`, que é o mesmo objeto. A comparação de itens confere identidade
antes de conferir igualdade, e a identidade responde na hora.

Ou seja: a defesa não é um detector de ciclo. É um atalho que, por acaso, corta
todos os ciclos que importam.

## Defesa 3: desistir, com uma mensagem clara

A terceira aparece quando não existe resposta certa. Serializar para JSON:

```python
>>> import json
>>> json.dumps(ls)
ValueError: Circular reference detected
```

E aqui está a decisão de projeto que eu acho a mais correta das três. Não existe
JSON que represente uma lista que contém a si mesma — o formato não tem como
expressar isso. Então o `json` **não inventa** uma saída: ele detecta, para, e
diz exatamente o que houve.

Compare com o que teria acontecido sem a detecção: estouro de pilha, uma
`RecursionError` com mil quadros, e nenhuma pista sobre a causa.

O `copy.deepcopy`, por sua vez, dá conta — ele mantém uma tabela do que já
copiou, e ao reencontrar o original aponta para a cópia já feita:

```python
>>> type(copy.deepcopy(ls)).__name__
'list'
```

## Por que tupla e set não conseguem, e o que isso ensina

Lista e dicionário se auto-referenciam porque são **mutáveis**: dá para criar
vazio e depois inserir a si mesmo. Tupla não:

```python
t = (t,)     # o t da direita ainda não existe
```

Com set o obstáculo é outro, e mais profundo:

```python
>>> s = set()
>>> s.add(s)
TypeError: unhashable type: 'set'
```

Um set precisa do *hash* do que guarda, e set não tem hash — justamente porque é
mutável, e o hash mudaria junto. A proibição que impede a auto-referência é a
mesma que mantém o set funcionando.

A saída, em ambos os casos, é uma camada de indireção — um objeto que contém a
tupla, e que se coloca dentro dela:

```python
class C:
    def __init__(self):
        self.val = (self,)
    def __repr__(self):
        return repr(self.val)
```

```
>>> C()
((...),)
```

Funciona porque `C` tem hash (o padrão, por identidade) e é criado **antes** da
tupla. O mesmo truque com set:

```python
class S:
    def __init__(self):
        self.val = {self}
    def __repr__(self):
        return repr(self.val)
```

```
>>> S()
{set(...)}
```

## O que fica

**Recursão em estrutura de dados não é erro; é um caso que precisa de resposta.**
As três defesas mostram três respostas válidas: representar de forma abreviada,
cortar por identidade, ou recusar com mensagem.

**Recusar é uma resposta de primeira classe.** O `json.dumps` poderia ter tentado
algo — truncar, repetir uma vez, emitir `null`. Qualquer dessas seria pior que a
`ValueError`, porque produziria um arquivo que parece certo. É o mesmo princípio
dos [erros de medição](/2025/09/sete-erros-de-medicao/): o erro perigoso é o que
devolve resposta plausível.

**Imutabilidade e hash estão amarrados.** O `TypeError` do set não é limitação:
é a consequência direta de o hash precisar ser estável. Vale como resposta à
pergunta "por que não posso usar lista como chave de dicionário", que é a mesma
coisa vista de outro ângulo — assunto que a
[série de estruturas](/2026/08/lista-set-dict-por-dentro/) trata por dentro.

## Referências

- [Recursive Python objects](https://bernsteinbear.com/blog/recursive-python-objects/) — Max Bernstein, o texto que originou este
- [`reprlib`](https://docs.python.org/3/library/reprlib.html) — a biblioteca padrão para representação com limite
- [`copy`](https://docs.python.org/3/library/copy.html) — a tabela de memo que faz o `deepcopy` sobreviver a ciclos
- [`json`](https://docs.python.org/3/library/json.html) — onde `check_circular` está documentado
- [`Objects/object.c`](https://github.com/python/cpython/blob/main/Objects/object.c) — `Py_ReprEnter` e `Py_ReprLeave`, a defesa 1 na fonte
