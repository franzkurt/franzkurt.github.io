---
title: "Anotar `int` não deixa o Python rápido, e o motivo é melhor que a resposta pronta"
date: 2026-09-11 10:00:00 -0300
tags: [python, tipos, compiladores, performance, engenharia]
description: "Doze linhas em que o mypy --strict passa sem um erro, a anotação diz int, e a soma devolve 42. Não é bug do verificador: é o que uma anotação promete, e o que ela não promete."
---

Existe uma frase que circula em toda discussão sobre desempenho de Python: *"se
tem type hint, dá para compilar para código nativo"*. Ela é intuitiva, e está
errada — mas o motivo de estar errada é mais interessante que a correção.

Este artigo traz para o português o argumento de
[Max Bernstein](https://bernsteinbear.com/blog/typed-python/), com as medições
refeitas aqui, no Python 3.13.5 e no mypy 2.3.1. A tese dele cabe numa linha:

> *types are very broad hints and they are sometimes lies*

Dicas muito amplas, e às vezes mentiras. Vale ver por quê, porque a explicação
passa exatamente pelo que a [série sobre o interpretador](/2025/05/python-por-dentro-parte-0-o-mapa/)
descreveu.

<!--more-->

## Doze linhas que o verificador aprova

```python
efeitos: list[str] = []

def soma(x: int, y: int) -> int:
    return x + y

class ComEfeito(int):
    def __add__(self, outro: int) -> int:
        efeitos.append("mandei um e-mail indesejado")
        return 42

a: int = ComEfeito(1)
print(soma(a, 2))
print(efeitos)
```

Rodando:

```
$ mypy --strict exemplo.py
Success: no issues found in 1 source file

$ python3 exemplo.py
42
['mandei um e-mail indesejado']
```

Pare um segundo nesse resultado. **O `mypy --strict` não achou nada**, e não é
falha dele: não há nada para achar. `ComEfeito` *é* um `int` — `isinstance`
confirma. A anotação `x: int` é verdadeira. A anotação de retorno `-> int` é
verdadeira, porque 42 é um inteiro.

E ainda assim `soma(a, 2)` devolveu **42** em vez de 3, e mandou um e-mail no
caminho.

## O que `x: int` promete de verdade

Aqui está a dobra do argumento. Quando você escreve `x: int`, você não está
dizendo "x é um inteiro". Está dizendo:

> x é uma instância de `int` **ou de qualquer subclasse de `int`**.

Parece uma distinção acadêmica. Não é. Subclasse pode redefinir `__add__`, e
`__add__` é código arbitrário. Então `x + y`, com os dois anotados como `int`,
**não é uma soma** — é uma chamada de método que talvez some.

Um compilador que quisesse emitir uma instrução `add` de processador ali
precisaria de uma garantia que a anotação não dá. Ele teria que emitir, no
lugar, a mesma cascata de verificações que o interpretador já faz. Bernstein
descreve o despacho de operador binário do CPython pedindo ao leitor apenas que
diga *"ooh"*, *"aah"* e *"wow, so many if-statements"*.

## O interpretador resolve isso — e a solução explica o problema

O detalhe que fecha o raciocínio, e que eu não vi no texto original: **o CPython
já faz essa otimização.** Só que em tempo de execução.

Desde o 3.11, o [interpretador especializado](/2025/06/python-por-dentro-interpretador-especializado/)
observa que tipos realmente passam por cada instrução e troca o opcode genérico
por um especializado. Dá para ver acontecendo:

```python
for _ in range(200):
    soma(1, 2)          # 200 chamadas com int exato

dis.get_instructions(soma, adaptive=True)
```

```
BINARY_OP_ADD_INT          ← especializou
```

Agora a mesma função, aquecida com a subclasse:

```
BINARY_OP                  ← continuou genérica
```

E o preço da diferença, em 2 milhões de chamadas:

| entrada | por chamada |
|---|---|
| `int` exato | **51,6 ns** |
| subclasse de `int` | **98,3 ns** |

Quase o dobro, e **a anotação é a mesma nos dois casos**.

Repare no que isso significa. O interpretador consegue o que o compilador
estático não consegue, e não é por ser mais esperto — é por **poder voltar
atrás**. Ele especula que os tipos continuarão os mesmos, instala uma guarda
barata, e se a guarda falhar ele *desotimiza* e cai no caminho genérico.

Um compilador antecipado não tem essa saída. Ele precisa estar certo na primeira
vez, para sempre, para todo programa que venha a importar aquele módulo. É a
diferença entre apostar podendo desistir e apostar sem poder.

## As outras travas, medidas

O problema da subclasse é o mais elegante, mas não está sozinho.

**Inteiro é objeto no heap.** Um `int` de 64 bits em C ocupa 8 bytes num
registrador. No Python:

```python
sys.getsizeof(1)        # 28 bytes
sys.getsizeof(2**100)   # 40 bytes
```

Todo inteiro é um `PyLongObject` alocado, de precisão arbitrária, com cabeçalho
— como a [parte 1 da série de tipos](/2026/08/tipos-em-python-por-dentro/)
detalhou. Somar dois deles é chamada de função, não instrução de máquina. E as
bibliotecas de C com que o Python fala esperam exatamente esses objetos, o que
a [parte 3 da tríade](/2026/09/triade-custo-da-fronteira/) mediu pelo lado do
custo de travessia.

**Nome global é busca, não constante.** Isto muda o comportamento de uma função
já definida:

```python
def area(r: float) -> float:
    return len(str(r))

area(1.5)                  # 3
builtins.len = lambda x: 999
area(1.5)                  # 999
```

O bytecode mostra por quê — não há chamada fixa, há uma consulta:

```
LOAD_GLOBAL   len + NULL
LOAD_GLOBAL   str + NULL
CALL
```

Um compilador não pode dobrar `len` numa constante, porque qualquer código em
qualquer lugar pode trocá-lo antes da próxima chamada.

**Atributo também é código.** Uma classe pode definir `__getattr__`, e aí, nas
palavras de Bernstein, ler um atributo vira executar *"opaque blobs of user
code"*. O acesso mais banal do Python é um ponto de extensão.

## Então o que funciona

Funciona, e bem — só que não do jeito que a frase do começo sugere. Mypyc,
Cython e Numba entregam ganhos reais, e a razão é a mesma nos três: eles **não
compilam Python**. Compilam um dialeto restrito, que troca dinamismo por
velocidade.

O caso mais explícito é o Static Python, do Cinder: com `import __static__`, o
Cinder troca o compilador de bytecode padrão por outro que, na frase do próprio
texto, *"compiles a different language!"* — ele passa a proibir criação
dinâmica de atributo, converte as classes para `__slots__` automaticamente e
gera bytecode diferente.

Ou seja: a anotação não é a fonte da velocidade. A **restrição** é. A anotação
só descreve a restrição que você concordou em aceitar.

## O que eu levo disto

Três coisas.

**Anotação é contrato de interface, não declaração de representação.** Ela diz
o que você pode fazer com o valor, não como ele está na memória — e é a segunda
informação que um compilador precisa.

**"É subclasse" é a cláusula que quase ninguém lê.** Todo raciocínio sobre
otimização baseado em tipo esbarra nela, e a mesma cláusula é o que faz herança
funcionar. Não dá para ter as duas.

**Quando o ganho aparece, procure a restrição que o pagou.** Se um projeto ficou
rápido "só de adicionar tipos", alguma dinamicidade foi embora junto. Vale saber
qual, antes de descobrir no dia em que precisar dela.

Nada disso desmerece anotar. Só é outro benefício, e a
[parte 3 da série de tipos](/2026/08/type-hints-aceite-o-geral-devolva-o-especifico/)
trata dele: o verificador cobra o contrato antes do teste rodar. O que ele não
faz é te dar um `add` de processador.

## Referências

- [Compiling typed Python](https://bernsteinbear.com/blog/typed-python/) — Max Bernstein, o texto que originou este
- [PEP 659 — Specializing Adaptive Interpreter](https://peps.python.org/pep-0659/) — a especialização medida acima
- [`Objects/longobject.c`](https://github.com/python/cpython/blob/main/Objects/longobject.c) — o inteiro alocado no heap
- [`dis`](https://docs.python.org/3/library/dis.html) — o desmontador, e o parâmetro `adaptive`
- [Static Python](https://github.com/facebookincubator/cinder) — o dialeto do Cinder citado no fim
