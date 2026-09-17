---
title: "Tipos e estruturas, parte 3: aceite o mais geral, devolva o mais específico"
date: 2026-08-23 10:00:00 -0300
tags: [python, tipagem, design, engenharia]
description: "Declarar dict quando você só lê é exigir do chamador mais do que você precisa. A hierarquia de collections.abc existe para isso — e o verificador de tipos até sugere a correção sozinho."
---

*Série em quatro partes: **1.** [os tipos escalares por dentro](/2026/08/tipos-em-python-por-dentro/) · **2.** [as estruturas de dados](/2026/08/lista-set-dict-por-dentro/) · **3.** [como declarar o que sua função aceita](/2026/08/type-hints-aceite-o-geral-devolva-o-especifico/) · **4.** [o decorador que apaga os seus tipos](/2026/09/tipos-parte-4-o-decorador-que-apaga-seus-tipos/).*

Os dois textos anteriores desta linha olharam o que os tipos **são** — os
[não-compostos por dentro](/2026/08/tipos-em-python-por-dentro/) — e o que as
estruturas **fazem** — [lista, set e dict](/2026/08/lista-set-dict-por-dentro/).
Falta o terceiro movimento: como **declarar** o que a sua função aceita.

E aqui a maioria do código erra na mesma direção. Não por falta de anotação: por
anotar **demais**.

```python
def processar(config: dict[str, int]) -> int:
    return config["timeout"] * 2
```

Essa função só **lê** o `config`. Mas a anotação exige um `dict` — e com isso
recusa qualquer outra coisa que se comporte como um mapa, e não promete nada
sobre não modificar o que recebeu. As duas pontas do contrato estão erradas ao
mesmo tempo.

<!--more-->

## Anotação é contrato, não implementação

Vale reancorar: como vimos no primeiro texto, o interpretador **não verifica**
anotação nenhuma. `def f(x: int) -> str: return x` roda sem reclamar.

Isso significa que a anotação tem exatamente uma função útil: **declarar o
contrato** para quem lê o código e para as ferramentas que o verificam. E
contrato tem dois lados que puxam em direções opostas:

- O **parâmetro** é uma **exigência** que você faz a quem chama. Quanto mais
  específico, mais você exige.
- O **retorno** é uma **promessa** que você faz a quem chama. Quanto mais
  específico, mais você entrega.

Daí sai a regra que resolve quase tudo: **aceite o mais geral que servir, devolva
o mais específico que você tiver.**

## A hierarquia que existe justamente para isso

O módulo `collections.abc` tem uma escada de abstrações, e cada degrau exige um
punhado de métodos. Medindo direto no Python:

| Tipo abstrato | Exige | Serve para |
|---|---|---|
| `Iterable` | `__iter__` | percorrer uma vez |
| `Container` | `__contains__` | testar `in` |
| `Sized` | `__len__` | saber o tamanho |
| `Collection` | os três acima | percorrer, testar e medir |
| `Sequence` | `__getitem__`, `__len__` | acessar por índice |
| `Mapping` | `__getitem__`, `__iter__`, `__len__` | **ler** um mapa |
| `MutableMapping` | os três + `__setitem__`, `__delitem__` | ler **e escrever** |

Repare na última dupla, porque é a mais útil na prática. A diferença entre
`Mapping` e `MutableMapping` são exatamente os dois métodos de **escrita**.

Ou seja: quando você anota um parâmetro como `Mapping`, está fazendo uma promessa
verificável de que **não vai modificar** aquilo. Não é comentário, não é
convenção — é checável.

## E o verificador cobra

Rodando um verificador de tipos no exemplo:

```python
def so_le(config: Mapping[str, int]) -> int:
    config["novo"] = 1          # ← aqui
    return config["a"]
```

```
error: Unsupported target for indexed assignment ("Mapping[str, int]")
```

A anotação deixou de ser documentação e virou barreira. Se alguém no futuro
acrescentar uma escrita naquela função, o verificador reprova antes do teste
rodar — e o chamador, que passou o dicionário dele, continua sabendo que ninguém
mexeu nele.

Volte ao exemplo do começo e aplique:

```python
def processar(config: Mapping[str, int]) -> int:
    return config["timeout"] * 2
```

Uma palavra trocada, e três coisas mudaram: a função passou a aceitar qualquer
mapa (não só `dict`), passou a prometer que não modifica, e ficou impossível de
alterar por descuido.

## Variância, ou por que `list[Cachorro]` não é `list[Animal]`

Agora a parte que confunde todo mundo, e que tem uma explicação simples.

```python
class Animal: pass
class Cachorro(Animal): pass

def aceita_lista(xs: list[Animal]) -> None: ...

cachorros: list[Cachorro] = [Cachorro()]
aceita_lista(cachorros)
```

Parece óbvio que deveria funcionar — cachorro é animal. O verificador discorda, e
a resposta dele é uma aula:

```
error: Argument 1 to "aceita_lista" has incompatible type
       "list[Cachorro]"; expected "list[Animal]"
note: "list" is invariant
note: Consider using "Sequence" instead, which is covariant
```

O motivo é a **mutabilidade**. Se `list[Cachorro]` pudesse ser passada onde se
espera `list[Animal]`, a função poderia fazer `xs.append(Gato())` — perfeitamente
válido para uma lista de animais — e quem chamou ficaria com um gato dentro da
lista de cachorros dele.

Por isso `list` é **invariante**: não aceita subtipos nem supertipos, só o tipo
exato. E por isso `Sequence`, que é somente-leitura, pode ser **covariante**: sem
escrita, o problema não existe.

Repare no que o verificador fez: ele **sugeriu a solução**. Trocar `list` por
`Sequence` no parâmetro resolve a variância *e* aplica a regra geral do texto, de
uma vez.

## Protocolo: duck typing que a ferramenta enxerga

Há um caso em que nenhum tipo abstrato pronto serve: quando o que você precisa é
"qualquer coisa que tenha o método `fechar`".

Em Python isso sempre funcionou em tempo de execução — é *duck typing*. O que não
existia era uma forma de **declarar** isso. A
[PEP 544](https://peps.python.org/pep-0544/) resolveu, com **protocolos**:

```python
from typing import Protocol

class TemFechar(Protocol):
    def fechar(self) -> None: ...

def encerrar(r: TemFechar) -> None:
    r.fechar()
```

E agora qualquer classe que tenha um `fechar()` serve — **sem herdar de nada**:

```python
class Arquivo:
    def fechar(self) -> None: ...

class Timer:
    def parar(self) -> None: ...   # nome diferente

encerrar(Arquivo())   # ok
encerrar(Timer())     # error: incompatible type "Timer"; expected "TemFechar"
```

Isso é *tipagem estrutural*: o que vale é a **forma** do objeto, não a
ascendência dele. É o duck typing que o Python sempre teve, agora visível para a
ferramenta.

Protocolo não se limita a método. Atributo também conta, e isso cobre o caso de
"qualquer coisa que tenha um `nome`":

```python
class TemNome(Protocol):
    nome: str
```

## Protocolo ou classe base abstrata?

Esta é a pergunta que importa na hora de escrever, porque as duas resolvem o
mesmo problema por caminhos opostos. Vale medir a diferença em vez de decorá-la.

**A ABC pergunta de quem você herdou.** Uma classe que tem exatamente o método
exigido, mas não herdou nada, é rejeitada:

```python
from abc import ABC, abstractmethod

class BaseABC(ABC):
    @abstractmethod
    def fechar(self) -> None: ...

class SoTemFechar:                 # tem fechar(), não herdou nada
    def fechar(self) -> None: ...

isinstance(SoTemFechar(), BaseABC)   # False
BaseABC.register(SoTemFechar)        # o dono da ABC precisa autorizar
isinstance(SoTemFechar(), BaseABC)   # True
```

Repare em quem faz o `register`: é **o lado da abstração**. Para tipar uma
classe de uma biblioteca de terceiros, você teria que registrá-la você mesmo, de
fora, para uma hierarquia que não é sua.

**O protocolo pergunta o que você tem.** Não há registro, não há herança, e a
classe de terceiros serve sem que ninguém seja avisado.

Em compensação, a ABC entrega uma coisa que o protocolo não entrega: ela
**impede a classe incompleta de existir**.

```python
class Incompleta(BaseABC): pass
Incompleta()
# TypeError: Can't instantiate abstract class Incompleta without an implementation
```

Isso é erro em tempo de execução, na hora de instanciar, sem verificador nenhum
instalado. Protocolo não faz isso: a cobrança dele acontece no verificador, na
chamada, e um programa sem verificador roda igual.

| | Classe base abstrata | Protocolo |
|---|---|---|
| Critério | herança (ou `register`) | forma do objeto |
| Quem precisa agir | o autor da classe concreta | ninguém |
| Serve para classe de terceiros | só registrando | sim, direto |
| Classe incompleta | `TypeError` ao instanciar | passa, se ninguém verificar |
| Herança múltipla | pesa na MRO | não entra na MRO |
| Quando existe | desde o 2.6 | desde o 3.8 |

A regra que eu uso: **se você é dono das duas pontas e quer garantir
implementação, ABC. Se você só quer descrever o que aceita, protocolo.** Anotar
parâmetro é quase sempre o segundo caso.

### `runtime_checkable`, e a letra miúda dele

Por padrão, protocolo é coisa de verificador — `isinstance` com ele é erro:

```python
isinstance(obj, TemFechar)
# TypeError: Instance and class checks can only be used with @runtime_checkable protocols
```

O decorador `@runtime_checkable` libera o `isinstance`. Só que ele confere
**menos do que parece**: olha se o nome existe, e não olha a assinatura.

```python
from typing import Protocol, runtime_checkable

@runtime_checkable
class TemFechar(Protocol):
    def fechar(self) -> None: ...

class AssinaturaErrada:
    def fechar(self, a, b, c): return 1    # três argumentos a mais

isinstance(AssinaturaErrada(), TemFechar)  # True
```

Aquele `True` é uma promessa que o objeto não cumpre: `obj.fechar()` vai
levantar `TypeError`. O verificador estático pegaria; o `isinstance` não pega.
E com atributo em vez de método, o `issubclass` nem é permitido:

```python
issubclass(X, TemNome)
# TypeError: Protocols with non-method members don't support issubclass()
```

Ou seja: `runtime_checkable` é útil para despachar, não para garantir.

### O `collections.abc` já era meio protocolo

Fecha o círculo com a tabela lá de cima. Aquelas abstrações não exigem herança
de verdade — elas implementam `__subclasshook__` e aceitam pela forma:

```python
from collections.abc import Iterable

class MeuIteravel:
    def __iter__(self): return iter([])

isinstance(MeuIteravel(), Iterable)   # True, sem herdar nada
```

Então quando você anota `Iterable` ou `Sized`, já está fazendo tipagem
estrutural — a PEP 544 generalizou para os seus próprios tipos um mecanismo que
a biblioteca padrão vinha usando desde o 2.6.

## A sintaxe foi ficando mais leve

Vale registrar como a escrita disso mudou, porque código antigo parece diferente
sem estar errado:

- **3.9 ([PEP 585](https://peps.python.org/pep-0585/))** — `list[str]` e
  `dict[str, int]` passaram a funcionar direto. Antes era preciso importar
  `List` e `Dict` do módulo `typing`, que existiam como duplicata só para isso.
- **3.10 ([PEP 604](https://peps.python.org/pep-0604/))** — `int | None` no lugar
  de `Optional[int]`, e `int | str` no lugar de `Union[int, str]`. Sem importar
  nada.
- **3.12 ([PEP 695](https://peps.python.org/pep-0695/))** — genéricos sem
  cerimônia: `def primeiro[T](xs: Sequence[T]) -> T`, sem declarar `TypeVar` nem
  herdar de `Generic`.

Se o seu código ainda importa `List`, `Dict` e `Optional`, não está errado — está
velho. Dá para trocar mecanicamente.

## Quando restringir passa do ponto

Duas armadilhas na direção oposta, porque a regra tem dois lados.

**Não abstraia o retorno.** `-> Iterable[str]` num método que devolve uma lista
força quem chama a converter antes de indexar ou medir. O retorno é promessa:
prometa o que você tem. Se devolve `list`, anote `list`.

**`Any` desliga tudo.** Ele não é "tipo desconhecido" — é "não verifique". Quando
o tipo é mesmo desconhecido, `object` é honesto e continua sendo checado: você é
obrigado a estreitar antes de usar.

E uma ressalva que vale para o texto inteiro: nada disso acelera o seu programa
em um microssegundo. Anotação não chega ao bytecode. O que ela muda é **quando**
o erro aparece — na sua máquina, ao editar, em vez de em produção, às três da
manhã. Por que nem o `int` mais explícito acelera uma soma tem explicação
própria, e ela é boa: [está aqui](/2026/09/anotar-int-nao-deixa-o-python-rapido/).

A [parte 4](/2026/09/tipos-parte-4-o-decorador-que-apaga-seus-tipos/) continua
daqui, com os casos em que anotar parâmetro e retorno **não basta** — a começar
pelo decorador que apaga a assinatura que você acabou de escrever.

## Referências

- [`collections.abc`](https://docs.python.org/3/library/collections.abc.html) — a hierarquia e o que cada tipo exige
- [`typing`](https://docs.python.org/3/library/typing.html) — o módulo e a documentação de variância
- [`abc`](https://docs.python.org/3/library/abc.html) — `register`, `__subclasshook__` e a instanciação barrada
- [PEP 3119 — Introducing Abstract Base Classes](https://peps.python.org/pep-3119/) — o desenho das ABCs, de 2007
- [PEP 544 — Protocols: Structural subtyping](https://peps.python.org/pep-0544/)
- [PEP 585 — Type Hinting Generics In Standard Collections](https://peps.python.org/pep-0585/)
- [PEP 604 — Allow writing union types as X | Y](https://peps.python.org/pep-0604/)
- [PEP 695 — Type Parameter Syntax](https://peps.python.org/pep-0695/)
