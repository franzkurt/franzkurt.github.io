---
title: "A tríade, parte 1: o código em C que compila, roda e mente"
date: 2026-09-07 10:00:00 -0300
tags: [c, rust, python, compiladores]
description: "Uma verificação de overflow que o compilador apaga. Uma checagem de ponteiro nulo que desaparece do assembly. Os dois casos compilam sem aviso, rodam sem erro, e devolvem a resposta errada."
---

*Série em três camadas: o blog já tem [Python in-depth](/2025/05/python-por-dentro-parte-0-o-mapa/)
e [Python e Rust](/2026/09/python-e-rust-duas-apostas/). Falta a camada de baixo —
o C, em que o CPython é escrito e contra o qual o Rust foi desenhado.*

Existe um padrão que atravessa quase tudo o que eu escrevo aqui: **o erro
perigoso não é o que quebra, é o que devolve resposta plausível.** Já vimos isso
em [medição](/2025/09/sete-erros-de-medicao/), em
[regra de negócio](/2025/10/secure-by-design-hamlet-negativo/) e em
[auditoria](/2026/08/agi-pessoal-garry-tan/).

Este texto é sobre a forma mais pura dele, uma camada abaixo de tudo: o
comportamento indefinido do C. Não é bug do compilador, não é erro de quem
escreveu. É a linguagem funcionando como especificada — e o resultado é código
que compila sem aviso, roda sem erro, e responde errado.

<!--more-->

## O caso um: a verificação de overflow que não existe

Você quer somar 100 a um inteiro e proteger contra estouro. A verificação óbvia:

```c
int checa_overflow(int x) {
    return x + 100 > x;      // falso se estourou
}
```

Lê-se bem: normalmente `x + 100` é maior que `x`; se estourou, deu a volta e
ficou menor. A função devolveria 0 avisando do problema.

Agora compile e rode:

```
  checa_overflow(5)        = 1   (esperado 1)
  checa_overflow(INT_MAX)  = 1   (esperado 0 — vai estourar!)
```

Com o maior inteiro possível, a função diz que **está tudo bem**.

Olhe o assembly que o `gcc -O2` gerou:

```asm
checa_overflow:
    movl    $1, %eax
    ret
```

Duas instruções. Carregue 1, devolva. **A comparação não está lá.** E não está
nem sem otimização nenhuma — mesmo com `-O0` o corpo é o mesmo `movl $1, %eax`.

O raciocínio do compilador é impecável e é o problema. Overflow de inteiro com
sinal é comportamento indefinido em C. Programa correto não causa comportamento
indefinido. Logo, `x + 100` **nunca** estoura. Logo, é sempre maior que `x`.
Logo, a função sempre devolve 1, e a comparação é código morto.

Ele não ignorou a sua verificação. Ele **provou** que ela é desnecessária, usando
uma premissa que você não sabia que tinha assinado.

## A mesma linha, uma flag, outra resposta

O que torna esse caso desconfortável é o quanto ele é frágil. Compile de novo com
`-fwrapv`, que diz ao gcc para tratar overflow com sinal como definido:

```
  checa_overflow(INT_MAX)  = 0   (esperado 0 — vai estourar!)
```

Agora responde certo. E o assembly voltou a ter a comparação:

```asm
checa_overflow:
    xorl    %eax, %eax
    cmpl    $2147483547, %edi
    setle   %al
    ret
```

Ali está: compara com 2.147.483.547, que é `INT_MAX - 100`.

Mesmo código-fonte. Mesmo compilador. Uma flag de diferença, **respostas
opostas**, e nenhum aviso em nenhum dos dois casos.

## O caso dois: a checagem de nulo que some

O segundo é ainda mais direto, e aparece em código real com frequência —
geralmente depois de uma refatoração que moveu uma linha.

```c
int le_e_checa(int *p) {
    int v = *p;                 // desreferencia
    if (p == NULL) return -1;   // ...e checa depois
    return v;
}
```

A ordem está errada, todo mundo concorda. A pergunta é o que o compilador faz
com isso. E a resposta é:

```asm
le_e_checa:
    movl    (%rdi), %eax
    ret
```

**A checagem de nulo desapareceu.** Não foi movida, não foi otimizada: foi
removida.

A lógica é a mesma da anterior. Desreferenciar ponteiro nulo é comportamento
indefinido. O código desreferenciou `p`. Portanto `p` não é nulo. Portanto a
comparação com `NULL` é sempre falsa, e o `return -1` é inalcançável.

Repare no efeito prático. Alguém escreveu essa proteção justamente porque `p`
pode ser nulo. O compilador leu a mesma função e concluiu o contrário — e quem
tem razão, na hora de gerar código, é ele.

## Por que a linguagem é assim

Vale dizer, porque não é descuido.

O comportamento indefinido existe para dar liberdade ao compilador. Se overflow
com sinal fosse definido, toda soma precisaria gerar código que se comporta de
um jeito específico ao estourar — mesmo nas noventa e nove por cento das vezes em
que não estoura. Deixando indefinido, o compilador pode assumir o caso comum e
gerar o código mais rápido.

Essa troca foi feita em 1972 num contexto em que ela fazia muito sentido: máquinas
lentas, arquiteturas que discordavam sobre o que fazer com overflow, e um
compilador que precisava ser simples.

O que mudou não foi a troca — foi o **poder dos otimizadores**. O compilador de
1990 não conseguia encadear "isto é UB, logo não acontece, logo aquela linha é
morta". O de 2026 consegue, e faz isso o tempo todo. A linguagem ficou parada e a
ferramenta ficou muito mais esperta, então uma premissa que era teórica virou
prática.

## O contraste, que é o motivo desta série

Escreva o mesmo overflow em Rust:

```rust
fn checa_overflow(x: i32) -> bool { x + 100 > x }
```

Em compilação de depuração:

```
thread 'main' panicked at: attempt to add with overflow
```

Em compilação otimizada:

```
  checa_overflow(MAX)     = false
```

Duas respostas diferentes — e **nenhuma delas é mentira**. Em debug, o programa
para e diz exatamente o que houve. Em release, o valor dá a volta de forma
definida, e a comparação devolve `false`, que é a resposta correta.

Essa é a diferença que justifica o Rust existir, e ela não é sobre segurança de
memória. É sobre **o que a linguagem faz quando você sai do previsto**. O C diz
"então tudo é permitido, inclusive apagar o seu código". O Rust diz "então isto
aqui acontece, e está escrito".

## O que fazer, na prática

Três coisas concretas para quem escreve C, e uma para quem não escreve.

**Nunca detecte overflow depois do fato.** `a + b < a` não funciona. Verifique
antes — `if (b > INT_MAX - a)` — ou use os *builtins* de overflow do compilador,
que devolvem um sinalizador.

**Ligue os sanitizadores no desenvolvimento.** `-fsanitize=undefined` instrumenta
o binário e **reclama em tempo de execução** quando o UB acontece. Ele é lento
demais para produção e é exatamente por isso que existe: transforma silêncio em
erro na hora de testar.

**Trate aviso do compilador como erro.** Vários casos de UB têm aviso — nem
todos, mas muitos. `-Wall -Wextra -Werror` converte o que seria ignorado em algo
que interrompe.

E para quem só escreve Python: isto não é curiosidade alheia. O interpretador que
roda o seu código é um programa em C, e as mesmas regras valem para ele. Boa parte
do trabalho de quem mantém o CPython é justamente não pisar nessas minas — e é
por isso que o build sem GIL levou anos, e não meses.

A pergunta seguinte é por que aceitamos tudo isso — por que uma linguagem com
esse comportamento continua embaixo de praticamente todo software em produção. É
a [parte 2](/2026/09/triade-por-que-o-c-sustenta-tudo/).

## Referências

- [C undefined behavior](https://en.cppreference.com/w/c/language/behavior) — a definição normativa das categorias de comportamento
- [Options that control optimization](https://gcc.gnu.org/onlinedocs/gcc/Optimize-Options.html) — a documentação do `-fwrapv` e vizinhos
- [UndefinedBehaviorSanitizer](https://clang.llvm.org/docs/UndefinedBehaviorSanitizer.html)
- [Integer overflow — Rust reference](https://doc.rust-lang.org/reference/expressions/operator-expr.html#overflow) — o comportamento definido em debug e em release
