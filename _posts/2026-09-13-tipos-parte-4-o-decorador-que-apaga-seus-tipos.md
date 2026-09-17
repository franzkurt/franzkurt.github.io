---
title: "Tipos e estruturas, parte 4: o decorador que apaga os seus tipos"
date: 2026-09-13 10:00:00 -0300
tags: [python, tipagem, design, engenharia]
description: "Você anotou a função inteira, pôs um @cronometra em cima, e o mypy passou a aceitar soma(\"isso\", \"nao e float\"). O decorador apagou a assinatura — e existe uma construção para isso desde o 3.10."
---

*Série: **1.** [os tipos escalares por dentro](/2026/08/tipos-em-python-por-dentro/) ·
**2.** [as estruturas de dados](/2026/08/lista-set-dict-por-dentro/) ·
**3.** [aceite o geral, devolva o específico](/2026/08/type-hints-aceite-o-geral-devolva-o-especifico/) ·
**4.** esta.*

A [parte 3](/2026/08/type-hints-aceite-o-geral-devolva-o-especifico/) tratou do
caso comum: anotar parâmetro e retorno direito. Este trata dos casos em que
fazer isso **não basta** — e em que a anotação que você escreveu some sem
aviso.

O ponto de partida veio de
[Justin A. Ellis](https://jellis18.github.io/post/2023-01-15-advanced-python-types/);
os exemplos abaixo foram reescritos e conferidos aqui, no Python 3.13.5 com
mypy 2.3.1 **e** pyright 1.1.414 — os dois verificadores concordam em cada caso
mostrado.

<!--more-->

## O decorador que apaga a assinatura

Um cronômetro comum, anotado com o que a maioria escreveria:

```python
def cronometra(f: Callable[..., Any]) -> Callable[..., Any]:
    @functools.wraps(f)
    def interna(*args: Any, **kwargs: Any) -> Any:
        ini = time.perf_counter()
        r = f(*args, **kwargs)
        print(f"{f.__name__}: {time.perf_counter()-ini:.6f}s")
        return r
    return interna

@cronometra
def soma(a: float, b: float) -> float:
    return a + b
```

A `soma` está anotada. O decorador está anotado. Pergunte ao verificador o que
ele enxerga:

```
$ mypy exemplo.py
note: Revealed type is "def (*Any, **Any) -> Any"
Success: no issues found in 1 source file
```

O `Success` ali é o problema, porque o arquivo continha esta linha:

```python
soma("isso", "nao e float")
```

**O mypy aprovou.** E o pyright também, que relata o mesmo de outro jeito:
`Type of "soma" is "(...) -> Any"`, zero erros. Não porque falharam — porque,
depois do decorador, `soma` é literalmente `(*Any, **Any) -> Any`. A assinatura que você escreveu foi
substituída pela do invólucro, e `Callable[..., Any]` é a forma de dizer
"qualquer coisa".

Isso é pior do que não anotar: você tem a impressão de cobertura sobre a função
mais usada do módulo, e não tem nenhuma.

## `ParamSpec`: a variável que carrega a lista de parâmetros

`TypeVar` captura **um** tipo. O que falta aqui é capturar uma *assinatura
inteira* — nome, posição, valor padrão, tudo — e devolvê-la do outro lado. É o
que a [PEP 612](https://peps.python.org/pep-0612/) trouxe no 3.10:

```python
P = ParamSpec("P")
T = TypeVar("T")

def cronometra(f: Callable[P, T]) -> Callable[P, T]:
    @functools.wraps(f)
    def interna(*args: P.args, **kwargs: P.kwargs) -> T:
        ini = time.perf_counter()
        r = f(*args, **kwargs)
        print(f"{f.__name__}: {time.perf_counter()-ini:.6f}s")
        return r
    return interna
```

Três trocas, e só três: `Callable[..., Any]` virou `Callable[P, T]`, e os
`*args: Any, **kwargs: Any` viraram `*args: P.args, **kwargs: P.kwargs`. O
mesmo arquivo, agora:

```
note: Revealed type is "def (a: float, b: float) -> float"
error: Argument 1 to "soma" has incompatible type "str"; expected "float"
error: Argument 2 to "soma" has incompatible type "str"; expected "float"
Found 2 errors in 1 file
```

A assinatura atravessou o decorador. **A regra prática:** todo decorador que
devolve uma função com a mesma interface deve usar `ParamSpec`. Se você digitou
`Callable[..., Any]` num decorador, provavelmente apagou alguma coisa.

## `TypeVar` com limite: o que o parâmetro precisa saber fazer

O segundo caso é o oposto: não perder informação, e sim **exigir** o mínimo.

Uma função `maior` genérica não deve aceitar qualquer coisa — só o que sabe se
comparar. E não deve exigir uma classe base, pelo motivo que a
[parte 3](/2026/08/type-hints-aceite-o-geral-devolva-o-especifico/) discutiu:
isso obrigaria todo mundo a herdar de algo seu.

A combinação certa é um protocolo usado como **limite** do `TypeVar`:

```python
class Comparavel(Protocol):
    def __lt__(self, outro: Self, /) -> bool: ...

T = TypeVar("T", bound=Comparavel)

def maior(a: T, b: T) -> T:
    return b if a < b else a
```

O `Self` ali é o que faz a coisa fechar: diz "comparável **com o próprio tipo**",
não com qualquer objeto. E o resultado é que o tipo concreto sobrevive à
passagem:

```
maior(1, 2)          →  int
maior("a", "b")      →  str
maior([1], [2])      →  list[int]

maior(SemOrdem(), SemOrdem())
error: Value of type variable "T" of "maior" cannot be "SemOrdem"
```

Não é `object` na saída, não é `Any`: é `list[int]` quando entrou `list[int]`.
Quem chama continua podendo indexar o retorno.

Vale notar o paralelo, porque ele ajuda a fixar: isso é a mesma ideia de
*trait bound* do Rust — "aceito qualquer tipo que implemente esta capacidade" —
e o blog já
[comparou as duas linguagens](/2026/09/python-e-rust-duas-apostas/) por outros
ângulos.

## `@overload`: quando o retorno depende do argumento

O terceiro caso é o único em que genérico não resolve: a função tem **formas
diferentes**, e o tipo de saída depende de qual você usou.

O exemplo canônico é o decorador que funciona das duas maneiras — com e sem
argumento:

```python
@cronometra                                    # sem parênteses
def soma(a: float, b: float) -> float: ...

@cronometra(relator=meu_relator)               # com argumento
def produto(a: float, b: float) -> float: ...
```

São duas funções diferentes escondidas no mesmo nome. Sem argumento, ela recebe
a função e devolve a função. Com argumento, recebe a configuração e devolve **um
decorador**. `@overload` declara as duas:

```python
@overload
def cronometra(f: Callable[P, T], /) -> Callable[P, T]: ...
@overload
def cronometra(*, relator: Relator) -> Callable[[Callable[P, T]], Callable[P, T]]: ...

def cronometra(f=None, *, relator=None):
    ...                                        # a implementação, uma só
```

As duas primeiras não têm corpo — são declarações para o verificador. A terceira
é o código que roda. E o resultado é que as duas formas chegam do outro lado
inteiras:

```
soma     →  def (a: float, b: float) -> float
produto  →  def (a: float, b: float) -> float
Success: no issues found
```

## Onde parar

Uma ressalva que o texto do Ellis faz e eu repito, porque é a que mais economiza
arrependimento: **use `@overload` com parcimônia, só quando genérico não dá
conta.**

Cada sobrecarga é uma assinatura a mais para alguém ler, e o corpo único precisa
atender a todas elas — sem ajuda do verificador, porque a implementação fica
fora do que as sobrecargas declaram. Duas formas genuinamente distintas
justificam. Três variações do mesmo parâmetro, normalmente, são um `TypeVar` que
faltou.

E a ressalva maior, que vale para a série toda: nada disso é sobre velocidade.
A anotação não chega ao bytecode, e
[nem o `int` mais explícito acelera uma soma](/2023/06/anotar-int-nao-deixa-o-python-rapido/).
O que essas três construções mudam é **quando** o erro aparece — e, no caso do
decorador, se ele aparece.

## Referências

- [Some Advanced Typing Concepts in Python](https://jellis18.github.io/post/2023-01-15-advanced-python-types/) — Justin A. Ellis, o texto que originou este
- [PEP 612 — Parameter Specification Variables](https://peps.python.org/pep-0612/) — o `ParamSpec`
- [PEP 673 — Self Type](https://peps.python.org/pep-0673/) — o `Self` usado no protocolo
- [PEP 544 — Protocols](https://peps.python.org/pep-0544/) — protocolo como limite de `TypeVar`
- [`typing.overload`](https://docs.python.org/3/library/typing.html#typing.overload) — a documentação, com as regras de resolução
