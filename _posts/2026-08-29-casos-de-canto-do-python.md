---
title: "Quinze casos de canto do Python, todos medidos"
date: 2026-08-29 10:00:00 -0300
tags: [python, cpython, internals, estrutura-de-dados, performance]
description: "Um emoji que quadruplica uma string, uma chave que fica inalcançável sem erro, um dict que não encolhe. Quinze comportamentos que parecem bug e são consequência direta de como o CPython é feito."
---

Um caso de canto bem escolhido não é curiosidade de trivia. Ele é a prova de que
você entendeu o mecanismo: se a implementação é de um jeito, então **este**
comportamento estranho tem que acontecer — e acontece.

Este texto reúne quinze deles. Os sete primeiros saem de como o CPython
representa os [tipos não-compostos](/2026/08/tipos-em-python-por-dentro/); os oito
seguintes, do layout das [estruturas de dados](/2026/08/lista-set-dict-por-dentro/).
Os dois textos, mais o de [type hints](/2026/08/type-hints-aceite-o-geral-devolva-o-especifico/),
formam a sequência de onde estes casos saem.
Rodei todos antes de escrever, e o valor está menos no truque e mais em cada um
apontar de volta para uma decisão de implementação concreta.

<!--more-->

## Os sete dos tipos escalares

### 1. A fronteira do cache é assimétrica

O cache não é simétrico em torno do zero. São **5** negativos e 257 positivos
(ou 1025, no `main`):

```python
>>> -6 is int('-6'),  -5 is int('-5')
(False, True)
```

Cinco negativos porque índices negativos pequenos aparecem muito (`lista[-1]`),
e além disso quase nada.

### 2. Aquele exemplo do 257 só funciona no REPL

Este é o mais traiçoeiro, e me obriga a uma ressalva sobre a demonstração acima.
Num **arquivo**:

```python
a = 257
b = 257
print(a is b)   # True
```

Dá `True`. Não porque 257 foi cacheado, mas porque o compilador **desduplica
constantes iguais dentro do mesmo code object** — as duas linhas viram uma
referência só na tabela de constantes da função ou do módulo.

No REPL cada linha é compilada separadamente, então são dois objetos e o
resultado é `False`. Mesma expressão, dois resultados, e a diferença é a unidade
de compilação.

### 3. Um emoji quadruplica a string

Desde a [PEP 393](https://peps.python.org/pep-0393/), uma string escolhe **uma
largura por caractere para o texto inteiro**, decidida pelo caractere mais largo
que ela contém. Com mil caracteres:

| Conteúdo | Tamanho |
|---|---|
| 1000 letras ASCII | 1.041 B |
| 999 ASCII + 1 emoji | **4.060 B** |

Quase quatro vezes, por um caractere. E fatiar devolve a largura menor: `s[:999]`
volta a 1.040 bytes.

Quem monta identificadores ou chaves concatenando texto de usuário está sujeito
a isto — um emoji num campo faz a string inteira pagar 4 bytes por caractere.

### 4. `NaN` é diferente de si mesmo, e ainda assim está na lista

```python
>>> nan = float('nan')
>>> nan == nan
False
>>> nan in [nan]
True
```

O `in` não usa só igualdade: ele testa **identidade primeiro**, como atalho. Como
é o mesmo objeto, encontra. A consequência aparece no `set`:

```python
>>> len({nan, nan})                        # mesmo objeto
1
>>> len({float('nan'), float('nan')})      # dois objetos
2
```

Dois valores que não são iguais a nada, nem a si mesmos, e o conjunto guarda os
dois.

### 5. `float` não alcança o que `int` alcança

`int` não tem limite de tamanho; `float` tem 53 bits de mantissa. O encontro dos
dois é silencioso:

```python
>>> float(2**53) == float(2**53 + 1)
True
```

Dois inteiros diferentes viram o mesmo float. Acima disso, a conversão desiste:

```python
>>> float(2**10000)
OverflowError: int too large to convert to float
```

O inteiro em si não reclama — `2**10000` tem 3.011 dígitos e ocupa 1.360 bytes.

### 6. Existe zero negativo, e ele se esconde

```python
>>> -0.0 == 0.0
True
>>> math.copysign(1, -0.0)
-1.0
```

São iguais na comparação e distinguíveis pelo sinal. E como a comparação é o que
o dict usa, `{0.0: 'a', -0.0: 'b'}` guarda **uma** entrada.

### 7. `bool` não pode ser herdado

```python
>>> class B(bool): pass
TypeError: type 'bool' is not an acceptable base type
```

Porque só devem existir dois booleanos. Permitir subclasse permitiria um terceiro
objeto verdadeiro que não é `True`, e `is True` deixaria de ser confiável.

## Os oito das estruturas de dados

### 8. Apagar e reinserir manda a chave para o fim

```python
>>> d = {'a': 1, 'b': 2, 'c': 3}
>>> del d['b']; d['b'] = 9
>>> list(d)
['a', 'c', 'b']
```

O `dk_entries` é denso e preenchido em sequência. Uma entrada apagada não deixa
buraco para ser reocupado na mesma posição: a chave nova é **acrescentada no
fim**. Quem usa dict como registro ordenado e atualiza uma chave apagando e
reinserindo perde a posição sem aviso.

### 9. Dict não encolhe quando você apaga

```python
>>> d = {i: i for i in range(1000)}   # 36.952 bytes
>>> for i in range(999): del d[i]
>>> sys.getsizeof(d)                  # 36.952 bytes, com 1 item
```

Um dict novo com um item ocupa 224 bytes. Este ocupa 36.952 — **165 vezes mais**
— e continua assim depois de uma inserção. O redimensionamento para baixo só
acontece em condições específicas, então um dict que já foi grande continua
grande. Se você usa um dict como cache que esvazia, crie um novo em vez de
limpar o antigo.

### 10. Set de inteiros pequenos parece ordenado

```python
>>> list({3, 1, 2})
[1, 2, 3]
>>> list({100, 1, 50})
[1, 50, 100]
```

Parece que set ordena. Não ordena. É que `hash(n) == n` para inteiro pequeno, e
a posição na tabela é o hash módulo o tamanho — então eles caem em ordem
crescente por acidente. Ponha um inteiro grande ou uma string no meio e a
ilusão desaparece.

De quebra, um detalhe: `hash(-1)` é **-2**, não -1, porque -1 é reservado para
sinalizar erro na API C.

### 11. Set de strings muda de ordem a cada processo

```
$ python3 -c "print(list({'alfa','beta','gama','delta'}))"
['beta', 'alfa', 'delta', 'gama']
$ python3 -c "print(list({'alfa','beta','gama','delta'}))"
['alfa', 'delta', 'beta', 'gama']
```

Mesmo código, mesma máquina, ordens diferentes. O hash de string é aleatorizado
por processo desde o 3.3, como defesa contra ataque de colisão. Teste que depende
da ordem de um set de strings passa na sua máquina e falha na CI, ou vice-versa —
e só às vezes.

### 12. Chave cujo hash muda: o valor some sem erro

```python
>>> class Chave:
...     def __init__(s, v): s.v = v
...     def __hash__(s): return hash(s.v)
...     def __eq__(s, o): return s.v == o.v
>>> k = Chave(1); d = {k: 'guardado'}
>>> k.v = 2
>>> k in d
False
>>> len(d), list(d.values())
(1, ['guardado'])
```

O valor continua lá, contado no `len`, visível no `values()` — e **inalcançável
pela chave**. Nenhuma exceção. É a razão técnica pela qual chave de dict deve ser
imutável, e o modo de falha é silencioso: você não perde o dado, perde o caminho
até ele.

### 13. Três chaves diferentes viram uma

```python
>>> {1: 'int', 1.0: 'float', True: 'bool'}
{1: 'bool'}
```

Como `1 == 1.0 == True` e os três têm o mesmo hash, são a **mesma chave**. E
repare no resultado: a chave que fica é a **primeira** (o `1`, do tipo `int`), o
valor que fica é o **último**. Inserir não substitui a chave, só o valor.

O mesmo vale para `{0.0: 'a', -0.0: 'b'}` — uma entrada só.

### 14. O primeiro item de um dict custa 160 bytes

```python
>>> sys.getsizeof({})       # 64
>>> sys.getsizeof({1: 1})   # 224
```

O dict vazio é só o cabeçalho; a tabela é alocada na primeira inserção. Em código
que cria milhões de dicts pequenos, a diferença entre vazio e com-um-item é o que
domina o consumo.

### 15. `__slots__` corta 38%, e formas heterogêneas custam o triplo

Medindo com `tracemalloc` a criação de 20 mil instâncias, sem tocar no
`__dict__`:

| Classe | Por objeto |
|---|---|
| 3 atributos no `__init__` | 104,8 B |
| os mesmos 3, com `__slots__` | **64,6 B** |
| 50 conjuntos de chaves diferentes | **296,9 B** |

O `__slots__` elimina o dicionário por completo. E o último caso mostra o custo
real de sair do padrão: quando as instâncias deixam de ter a mesma forma, o
compartilhamento de chaves acaba e o consumo quase triplica. Um punhado de
exceções não pesa — medi um em mil e não mudou nada. O que pesa é heterogeneidade
em escala.

## O que quinze casos de canto ensinam

Relendo a lista de uma vez, três padrões aparecem.

**A identidade vaza por todo lado.** O cache de inteiros, o `in` que testa `is`
antes de `==`, o `{nan, nan}` com um elemento e o `{float('nan'), float('nan')}`
com dois — em todos, o resultado depende de **qual objeto** é, não de qual valor.
Python esconde ponteiros até a hora em que não esconde.

**Igualdade e hash mandam mais que tipo.** `1`, `1.0` e `True` são a mesma chave.
`0.0` e `-0.0` são a mesma chave. Uma chave cujo hash muda desaparece. Nada disso
é sobre classe; é sobre as duas funções que a tabela consulta.

**O que a estrutura guarda explica o que ela faz.** O array denso do dict manda a
chave reinserida para o fim; a tabela que não encolhe deixa o dict gordo para
sempre; `hash(n) == n` faz o set parecer ordenado. Nenhum desses é regra da
linguagem — todos são consequência de um arquivo em C.

E é por isso que vale conhecê-los. Não para usar em código, mas porque no dia em
que um deles aparecer num bug de produção, você vai reconhecer a forma em vez de
gastar a tarde procurando o que quebrou.

## Referências

- [Floating-Point Arithmetic: Issues and Limitations](https://docs.python.org/3/tutorial/floatingpoint.html) — o tutorial oficial sobre por que `0.1 + 0.2` não dá `0.3`
- [PEP 393 — Flexible String Representation](https://peps.python.org/pep-0393/) — por que uma string muda de tamanho conforme o conteúdo
- [`sys.getsizeof`](https://docs.python.org/3/library/sys.html#sys.getsizeof) — a medida usada aqui, e as ressalvas dela
- [`tracemalloc`](https://docs.python.org/3/library/tracemalloc.html) — o que usar quando `getsizeof` mede a coisa errada
- [Design and History FAQ](https://docs.python.org/3/faq/design.html) — vários destes casos de canto respondidos pelos mantenedores
