---
title: "Erro como valor: o que Rust e Go fazem, e quanto isso custa em Python"
date: 2021-12-18 10:00:00 -0300
tags: [python, rust, go, tipagem, design]
description: "Dos três estilos de tratar erro, só um faz o verificador de tipos exigir que você trate. E ele é o mais caro: 2,5 vezes o custo da exceção no caminho feliz. Os dois números medidos aqui."
---

*A partir de [Exceptions in Python, Rust and Go](https://jellis18.github.io/post/2021-12-13-python-exceptions-rust-go/),
de Justin A. Ellis. Os três estilos foram reimplementados aqui e medidos no
Python 3.13.5, com mypy 2.3.1 e pyright 1.1.414.*

Olhe esta assinatura e diga o que pode dar errado:

```python
def divide(x: float, y: float) -> float:
```

Não dá. A função pode levantar `ZeroDivisionError` e a assinatura não conta —
está na documentação, se alguém escreveu, ou no corpo, se você abrir.

Rust e Go resolvem isso da mesma maneira: **o erro vira valor de retorno**. A
pergunta interessante não é se dá para fazer isso em Python (dá), é o que se
ganha e o que se paga. Os dois dão para medir.

<!--more-->

## Os três estilos, em Python

**Exceção**, o jeito da linguagem:

```python
def divide_exc(x: float, y: float) -> float:
    if y == 0:
        raise ZeroDivisionError("não dá para dividir por zero")
    return x / y
```

**Tupla**, o jeito do Go — devolve o valor e o erro lado a lado:

```python
def divide_go(x: float, y: float) -> tuple[float, ZeroDivisionError | None]:
    if y == 0:
        return 0.0, ZeroDivisionError("não dá para dividir por zero")
    return x / y, None
```

**`Result`**, o jeito do Rust — um de dois tipos, e só um deles tem o valor:

```python
class Ok(Generic[T, E]):
    __match_args__ = ("valor",)
    def __init__(self, valor: T) -> None: self.valor = valor
    def unwrap(self) -> T: return self.valor
    def unwrap_or(self, padrao: T) -> T: return self.valor

class Err(Generic[T, E]):
    __match_args__ = ("erro",)
    def __init__(self, erro: E) -> None: self.erro = erro
    def unwrap(self) -> NoReturn: raise self.erro
    def unwrap_or(self, padrao: T) -> T: return padrao

Result = Union[Ok[T, E], Err[T, E]]
```

Os três passam em `mypy --strict` e em `pyright` com zero erros. E o terceiro
casa com `match`, que chegou no 3.10:

```python
match divide_rust(x, y):
    case Ok(v):  ...
    case Err(e): ...
```

## O teste que separa os três

Escrever os três é fácil. O que importa é: **qual deles faz a ferramenta cobrar
quando você esquece de tratar o erro?**

Montei o esquecimento nos três estilos, no mesmo arquivo:

```python
a = divide_exc(6, 0) + 1              # 1. ignora que pode explodir
v, err = divide_go(6, 0); b = v + 1   # 2. usa o valor sem olhar o erro
c = divide_rust(6, 0).valor + 1       # 3. pega o valor sem desembrulhar
```

O resultado, e os dois verificadores concordam:

| estilo | mypy | pyright |
|---|---|---|
| exceção | passa | passa |
| tupla (Go) | passa | passa |
| `Result` (Rust) | **erro** | **erro** |

```
error: Item "Err[float, ZeroDivisionError]" of "Ok[...] | Err[...]"
       has no attribute "valor"  [union-attr]
```

Só o `Result` cobra. E o motivo é estrutural: o tipo de retorno é uma **união**,
e o verificador sabe que um dos lados não tem o atributo. Você é obrigado a
estreitar — com `match`, com `isinstance`, ou com `unwrap_or` — antes de chegar
ao valor.

O estilo do Go **não** cobra, e isso me surpreendeu. A tupla anota o erro no tipo,
o que já é melhor que nada, mas nada impede o chamador de ignorar o segundo
elemento. Em Go o compilador reclama de variável não usada; em Python, não há
equivalente.

## E o preço

Medi os três, como mínimo de 15 repetições de 400 mil chamadas. As razões abaixo
se mantiveram em três execuções seguidas; os absolutos variam com a máquina.

**Caminho feliz**, quando nada dá errado:

| estilo | por chamada | |
|---|---|---|
| exceção | 69 ns | 1,00× |
| tupla (Go) | 93 ns | 1,34× |
| `Result` (Rust) | 178 ns | **2,57×** |

**Caminho de erro**, quando dá:

| estilo | por chamada | |
|---|---|---|
| exceção lançada e capturada | 243 ns | 1,00× |
| tupla (Go) | 144 ns | 0,59× |
| `Result` (Rust) | 218 ns | 0,90× |

Duas leituras saem daí.

**A exceção é o estilo mais barato — quando não acontece.** É o desenho do
Python: `try` não custa nada enquanto nada é levantado, e levantar custa caro.
Isso está certo para erro que é exceção de verdade.

**O `Result` custa 2,5× no caminho feliz**, e o motivo é óbvio quando se vê:
toda chamada **aloca um objeto** — um `Ok` ou um `Err` — que a exceção não aloca.
É o custo de o erro ser um valor: valor ocupa lugar.

## Onde eu usaria cada um

A conclusão do Ellis é que esses padrões dificilmente virariam padrão em Python,
e concordo. Mas a medição sugere um critério melhor que gosto pessoal:

**Erro raro e excepcional → exceção.** Arquivo que sumiu, rede que caiu, invariante
violada. O caminho feliz é o que roda milhões de vezes, e é o barato.

**Erro esperado e frequente → valor.** Validação de entrada, parsing, busca que
pode não achar. Aqui o "erro" faz parte do contrato, e 2,5× num caminho que já
ia ramificar de qualquer jeito costuma não importar.

**Quando o custo de esquecer é alto → `Result`, apesar do preço.** É o único que
transforma "esqueci de tratar" em erro de verificação. Num punhado de funções
críticas isso vale muito mais que 100 nanossegundos.

E vale a comparação com o Rust de verdade, que o blog já
[fez por outros ângulos](/2026/09/python-e-rust-duas-apostas/): lá o `Result` não
aloca — ele é um *enum* de tamanho conhecido, resolvido em tempo de compilação, e
o `?` propaga sem custo. O padrão é o mesmo; o preço, não. Em Python ele é uma
convenção construída em cima de objetos; em Rust, é o próprio sistema de tipos.

## Referências

- [Exceptions in Python, Rust and Go](https://jellis18.github.io/post/2021-12-13-python-exceptions-rust-go/) — Justin A. Ellis, o texto que originou este
- [Recoverable Errors with Result](https://doc.rust-lang.org/book/ch09-02-recoverable-errors-with-result.html) — o `Result` no livro oficial do Rust
- [Effective Go: errors](https://go.dev/doc/effective_go#errors) — a convenção do Go
- [PEP 634 — Structural Pattern Matching](https://peps.python.org/pep-0634/) — o `match` usado aqui
- [`typing`](https://docs.python.org/3/library/typing.html) — `Generic`, `NoReturn` e `Union`
