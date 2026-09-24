---
title: "A tríade, parte 2: o C não venceu como linguagem, venceu como interface"
date: 2026-09-08 10:00:00 -0300
tags: [c, python, rust, arquitetura]
description: "Rode ldd no seu Python e veja contra o que ele liga. A razão de o C ainda sustentar tudo não é a quantidade de código escrito nele — é que ele é o único vocabulário que todas as linguagens concordam em falar."
---

*Parte 2 da série sobre a camada de baixo. A
[parte 1](/2026/09/triade-undefined-behavior/) mostrou o que essa camada cobra.*

Rode isto na sua máquina:

```
$ ldd $(readlink -f $(which python3))
    libm.so.6      => /lib/x86_64-linux-gnu/libm.so.6
    libz.so.1      => /lib/x86_64-linux-gnu/libz.so.1
    libexpat.so.1  => /lib/x86_64-linux-gnu/libexpat.so.1
    libc.so.6      => /lib/x86_64-linux-gnu/libc.so.6
```

O interpretador que executa o seu Python é um programa em C, ligado a bibliotecas
em C. Quando você chama `math.sqrt`, a conta acontece na `libm` ali de cima. Toda
a série [Python in-depth](/2025/05/python-por-dentro-parte-0-o-mapa/) descreveu,
em sete partes, o funcionamento de um programa em C.

A explicação comum para isso é inércia: "é legado, ninguém reescreve". Ela não
explica por que projetos **novos** continuam escolhendo C, nem por que o Rust —
desenhado explicitamente para substituí-lo — gastou esforço para **falar C**.

A razão é outra, e é mais interessante.

<!--more-->

## O que está escrito em C

A lista é previsível e vale enunciar: o kernel do Linux, o CPython, o SQLite, o
Redis, o nginx, o git, o PostgreSQL, o OpenSSL, o FFmpeg, a própria libc. Quase
toda a infraestrutura que executa software hoje.

Mas o volume de código é o argumento fraco, porque volume se substitui — com
esforço, com anos, mas se substitui. O argumento forte é outro.

## O C é o vocabulário que todos falam

Quando o Python chama uma função em C, ele não precisa saber nada sobre C como
**linguagem**. Ele precisa saber como passar argumentos em registradores, onde o
retorno aparece, e quem limpa a pilha. Isso é a **ABI** — a interface binária de
aplicação — e a do C virou o padrão de fato de cada plataforma.

A consequência é que a ABI do C não é *uma* forma de linguagens conversarem. É
**a** forma.

Repare no que isso significa nas linguagens que você conhece:

- A [parte 3](/2026/09/triade-custo-da-fronteira/) desta série mede quatro
  caminhos do Python para código nativo. **Os quatro atravessam a ABI do C.**
- Quando o Rust quer expor uma função para o mundo, ele escreve `extern "C"`.
  Não porque a função seja em C, mas porque é o único formato que o mundo lê.
- Go, Java, C#, Ruby, Node — todos têm um mecanismo de FFI, e em todos ele fala
  C.

O kernel reforça isso do outro lado. A fronteira entre o seu programa e o sistema
operacional é descrita em cabeçalhos C — são 155 arquivos `.h` só na raiz do
`/usr/include` numa instalação Debian comum. Para pedir um arquivo ao Linux,
qualquer linguagem monta uma chamada no formato do C.

**O C ocupa a posição de língua franca.** E língua franca não se substitui por ser
melhor — se substitui quando todo mundo muda de idioma ao mesmo tempo, o que não
costuma acontecer.

## As escolhas de 1972 que produziram isso

Vale entender por que ele serviu para esse papel, porque não foi acaso.

**A linguagem é pequena.** O C89 tinha **32 palavras-chave** — menos que o Python,
que tem 35. Trinta e quatro anos depois, o C23 chegou a 53, e boa parte do
acréscimo é nome de tipo. Para comparar, o C++23 tem 92.

Especificação pequena é compilador pequeno, e compilador pequeno é o que se
escreve primeiro quando aparece uma arquitetura nova. É por isso que "existe um C
para isso" é verdade para praticamente qualquer processador já fabricado, e não é
verdade para quase nenhuma outra linguagem.

**O modelo de memória é o da máquina.** Não há coletor de lixo, não há tempo de
execução escondido, não há alocação que você não pediu. Isso permite escrever
código que roda **antes de existir um sistema operacional** — que é exatamente o
requisito de um kernel, de um bootloader, de um firmware.

**O programador é o responsável.** É a contrapartida direta da anterior, e é o
assunto da [parte 1](/2026/09/triade-undefined-behavior/): a linguagem presume
que você não errou, e otimiza com base nisso.

Essas três decisões, juntas, produzem uma linguagem que **cabe em qualquer lugar**
e não impõe nada. É a propriedade certa para uma camada de base — e é a errada
para quase tudo o que se constrói em cima dela.

## O que isso cobrou

Não vale contar a vitória sem a conta, e ela está medida.

O Google publicou os números do Android depois de migrar parte do sistema para
Rust: vulnerabilidades de segurança de memória caíram de **mais de 75% do total
para menos de 20%**, com densidade cerca de mil vezes menor no código Rust que no
equivalente em C e C++. Isso não é opinião sobre linguagem — é contagem de falha
em produção, e já apareceu [aqui antes](/2026/09/python-e-rust-duas-apostas/).

Ou seja: a mesma propriedade que fez o C caber em todo lugar — não impor nada, não
verificar nada — é a que produz a classe de defeito mais cara que existe.

## Por que o Rust não tentou substituí-lo de frente

E aqui está o desfecho que eu acho mais instrutivo desta parte.

O Rust foi desenhado para ocupar o espaço do C, e a estratégia dele **não** foi
criar um ecossistema separado. Foi o contrário: `extern "C"`, `#[repr(C)]`,
compilação para bibliotecas que o carregador do sistema entende. Ele adotou a ABI
do C inteira.

O resultado é que um projeto pode substituir **um arquivo** de C por Rust sem que
o resto perceba. Foi assim no kernel do Linux, foi assim no Android, e é assim nas
extensões de Python.

Substituir a língua franca de uma vez era impossível. Falar a língua franca com
outro sotaque, não.

## O que fica

Três coisas que eu levo desta parte.

**O C não é mais a melhor escolha para quase nada em particular** — nem para
aplicação, nem para servidor, nem para ferramenta de linha de comando. Existem
opções melhores para cada uma dessas.

**E continua sendo a única em que todos concordam.** É a diferença entre ser o
melhor idioma e ser o idioma em que a reunião acontece.

**Por isso ele não vai embora por substituição, e sim por erosão** — arquivo a
arquivo, biblioteca a biblioteca, em projetos que continuam expondo a mesma
interface. Que é, aliás, exatamente o que está acontecendo.

## Referências

- [Rust FFI: `extern "C"`](https://doc.rust-lang.org/nomicon/ffi.html) — como o Rust fala a ABI do C
- [System V AMD64 ABI](https://gitlab.com/x86-psABIs/x86-64-ABI) — a convenção de chamada que todo mundo implementa no Linux
- [Rust in Android: move fast and fix things](https://blog.google/security/rust-in-android-move-fast-fix-things/) — os números de segurança de memória
- [Linux kernel: Rust](https://docs.kernel.org/rust/) — a documentação da integração
