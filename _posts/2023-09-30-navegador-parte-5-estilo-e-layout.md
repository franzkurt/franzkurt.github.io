---
title: "Um navegador por dentro, parte 5: estilo, layout e pintura"
date: 2023-09-30 10:00:00 -0300
tags: [navegador, css, layout, performance]
description: "A árvore existe, mas não tem tamanho nem cor. Esta parte mede as três etapas que faltam — e derruba dois conselhos de desempenho de CSS que todo mundo repete."
---

*Série **Um navegador por dentro**, o percurso completo:
**0.** [as camadas](/2023/08/navegador-parte-0-as-camadas/) ·
**1.** [do nome ao endereço](/2023/09/navegador-parte-1-do-nome-ao-endereco/) ·
**2.** [a conexão e a sessão](/2023/09/navegador-parte-2-a-conexao/) ·
**3.** [o HTTP que anda por cima](/2023/09/navegador-parte-3-http/) ·
**4.** [o HTML vira árvore](/2023/09/navegador-parte-4-o-html-vira-arvore/) ·
**5.** estilo, layout e pintura (esta) ·
**6.** [o JavaScript e a volta do laço](/2023/10/navegador-parte-6-javascript/) ·
**7.** [tcpdump e scapy](/2023/10/navegador-parte-7-tcpdump-e-scapy/)*

O DOM da [parte 4](/2023/09/navegador-parte-4-o-html-vira-arvore/) é uma árvore de
objetos sem nenhuma informação visual. Nenhum nó sabe o próprio tamanho, a
posição ou a cor. Faltam três etapas — estilo, layout e pintura — e cada uma tem
um custo bem diferente do que a sabedoria comum sobre CSS sugere.

Tudo aqui foi contado, não estimado: os números vêm dos contadores internos do
Chromium, pelo protocolo de depuração, que reportam quantos recálculos de estilo
e quantos layouts realmente aconteceram.

<!--more-->

## O CSS é a linguagem bem-comportada da dupla

Ao contrário do HTML, o CSS **é** livre de contexto. Tem uma gramática léxica e
uma sintática, e o parser **pode** ser gerado a partir delas — o WebKit fez isso
por anos, com Flex e Bison. Os motores atuais não fazem mais: o Blink
[trocou o parser gerado por um escrito à mão em 2015](https://groups.google.com/a/chromium.org/d/topic/blink-dev/r9bthijsX3A),
por saúde do código, não porque a gramática tenha deixado de ser tratável.

A recuperação de erro também é o oposto. O HTML reestrutura a árvore para
acomodar o que você escreveu; o CSS simplesmente **descarta**:

- declaração com propriedade desconhecida: joga fora a declaração, mantém o resto
  do bloco;
- seletor inválido numa lista: invalida a **regra inteira**, inclusive os
  seletores válidos ao lado.

Essa segunda regra é a que morde, e dá para ver:

| CSS | `.a` fica |
|---|---|
| `.a{color:red; zzz:1; font-weight:700}` | vermelho e negrito — só a declaração desconhecida caiu |
| `.a{color:red; width:abc}` | vermelho, `width` volta a `auto` — só o valor inválido caiu |
| `.a, .b::naoexiste{color:red}` | **preto** — a regra inteira foi descartada |
| `.a{color:red}` `.b::naoexiste{color:blue}` | vermelho — regras separadas se protegem |

Um seletor que o navegador não reconhece derruba os válidos ao lado dele. É por
isso que cada seletor experimental vai na própria regra: a terceira linha e a
quarta têm exatamente o mesmo conteúdo, e resultados opostos.

O resultado é o CSSOM, e junto com o DOM ele produz a **árvore de layout**: um nó
por caixa a ser desenhada. Nem todo nó do DOM entra — `<head>` não gera caixa, e
`display: none` também não. Já `visibility: hidden` gera: ocupa espaço, e o
espaço precisa ser calculado.

## Primeiro conselho derrubado: a forma do seletor

Todo guia de desempenho de CSS diz para evitar seletores descendentes longos,
porque o navegador casa da direita para a esquerda e o custo cresce. A parte
mecânica é verdade — o casamento é mesmo da direita para a esquerda, e por bom
motivo: começando pela chave mais específica, a maioria dos candidatos é
descartada no primeiro passo.

A parte do custo eu medi. Quinhentos alvos aninhados em quatro níveis, o mesmo
conjunto invalidado 200 vezes, cinco formas diferentes de seletor:

| seletor | por recálculo |
|---|---:|
| `.alvo` | 0,986 ms |
| `.n1 .n2 .n3 .alvo` | 0,955 ms |
| `#raiz > .n1 > .n2 > .n3 > .alvo` | 0,970 ms |
| `* * * .alvo` | 1,016 ms |
| `div:not(.x) div:not(.y) .alvo` | 1,102 ms |

**Do melhor ao pior, 15%.** E o descendente de quatro níveis ficou *abaixo* da
classe simples — diferença dentro do ruído. O motor de estilo tem índices por
classe, por tag e por identificador; ele não testa todos os seletores contra
todos os elementos.

Trocar `.menu ul li a` por `.menu-link` continua sendo bom para quem lê o código.
Como otimização, é ruído.

## O que realmente custa: quantos elementos você invalidou

Mesmo seletor, mesma página, variando só quantos elementos mudam de classe:

| elementos invalidados | por recálculo |
|---:|---:|
| 1 | 7,1 µs |
| 10 | 29,3 µs |
| 100 | 167,9 µs |
| 1.000 | 1.433 µs |
| 2.000 | 2.851 µs |

Linear, e 400 vezes entre as pontas. **O custo do estilo é o número de elementos
tocados, não a forma do seletor.**

É por isso que mexer numa classe do `<body>` costuma ser caro: um seletor como
`body.escuro .item` faz com que trocar uma classe na raiz invalide a subárvore
inteira. Pôr a classe no menor ancestral comum é a otimização que vale — e ela
não aparece em nenhuma tabela de "seletores rápidos".

## O layout, e o pior erro de desempenho que se comete em JavaScript

Calculado o estilo, o layout dá a cada caixa posição e tamanho. É recursivo: o
pai define a própria largura, posiciona os filhos, e a altura do pai sai da soma
das alturas deles.

O caro não é fazer layout uma vez. É fazer duas mil.

O navegador adia o layout: você muda cinquenta estilos e ele marca a árvore como
suja, para recalcular uma vez só, antes de pintar. Mas se o seu código **lê** uma
propriedade geométrica — `offsetHeight`, `getBoundingClientRect`,
`getComputedStyle` — o navegador é obrigado a entregar o valor certo agora. E aí
ele roda o layout na hora, no meio do seu laço.

Dois mil elementos, o mesmo trabalho, duas ordens:

```js
// intercalado: lê, escreve, lê, escreve
for (const e of itens) {
  const h = document.body.offsetHeight;      // força o layout
  e.style.width = (h % 2 ? 50 : 51) + 'px';  // suja a árvore de novo
}

// em lote: lê uma vez, depois escreve tudo
const h = document.body.offsetHeight;
for (const e of itens) e.style.width = (h % 2 ? 50 : 51) + 'px';
```

| versão | layouts | tempo em layout | tempo total |
|---|---:|---:|---:|
| intercalado | **2.000** | 1.701 ms | 1.790 ms |
| em lote | **0** | 0 ms | **1,8 ms** |

Mil vezes. Não é uma diferença de constante — é a diferença entre dois mil
layouts e nenhum. O nome disso é *layout thrashing*, e é quase sempre o que está
por trás de uma lista que trava ao rolar.

A regra sai sozinha: **leia tudo, depois escreva tudo.** Nunca intercale.

## Segundo conselho derrubado: "anime transform e opacity"

O conselho é que `transform` e `opacity` são baratos porque não disparam layout,
só composição. Medi cada propriedade em mil elementos, 50 rodadas:

| propriedade | recálculos de estilo | layouts | tempo em layout |
|---|---:|---:|---:|
| `width` | 50 | 50 | 245,0 ms |
| `margin-left` | 50 | 50 | 237,2 ms |
| `background-color` | 50 | **0** | 0 ms |
| `color` | 50 | **0** | 0 ms |
| `transform` | 50 | **1** | 4,6 ms |
| `opacity` | 50 | **50** | 186,7 ms |

`opacity` disparou cinquenta layouts, o que contraria o conselho inteiro. Valeu
isolar:

| caso | layouts |
|---|---:|
| `opacity` alternando 1 ↔ 0,99 | **50** |
| `opacity` alternando 0,98 ↔ 0,99 | **1** |
| `transform` alternando `translateX(0)` ↔ `translateX(1px)` | **1** |
| `transform` alternando `none` ↔ `translateX(1px)` | **50** |

O conselho está certo, mas incompleto. O que é barato é **variar** a propriedade;
o que é caro é **cruzar o limiar** em que ela passa a existir. `opacity: 1` e
`transform: none` são os valores neutros: sair deles ou voltar a eles muda se o
elemento tem contexto de empilhamento próprio, e essa mudança é estrutural.

Na prática: se você vai animar, deixe o elemento **já** com
`transform: translateZ(0)` e `opacity: 0.999` em repouso, e anime a partir daí.
Animar de `none` para alguma coisa paga o preço na primeira quadro de cada
animação — exatamente o quadro em que o usuário está olhando.

## Pintura e composição

Falta transformar caixas em pixels. A pintura percorre a árvore na ordem de
empilhamento do CSS — fundo, imagem de fundo, borda, filhos, contorno — e produz
uma lista de comandos de desenho.

Essa lista não vira uma imagem só. O conteúdo é dividido em **camadas**, e
camadas são rasterizadas separadamente, muitas vezes no processo de GPU. A
**composição** junta as camadas na tela — e quem faz isso é o **compositor**, que
roda em outra thread, fora daquela onde o seu JavaScript executa. Guarde essa
separação: ela é a razão de a rolagem continuar suave em páginas cujo código
travou.

É daí que vem a vantagem real de `transform` e `opacity`: são as duas coisas que
o compositor consegue aplicar a uma camada já pronta, sem repintar nada. Mudar
`left` obriga a recalcular layout e repintar; mudar `transform` é dizer ao
compositor para desenhar a mesma textura alguns pixels adiante.

Camadas também custam memória, e promover tudo com `will-change` troca um
problema por outro — uma página cheia de camadas pode gastar mais memória de GPU
do que o aparelho tem.

## O que fica

**A forma do seletor não importa — 15% entre a melhor e a pior.** O que importa é
quantos elementos você invalida, e isso é linear até 400×.

**Layout thrashing custa mil vezes.** Duas mil leituras intercaladas com
escritas: 1.790 ms. As mesmas operações em lote: 1,8 ms.

**`transform` e `opacity` são baratos enquanto você não cruza o valor neutro.**
De `none` para `translateX`, cinquenta layouts; de `translateX` para
`translateX`, nenhum.

**E tudo isso ainda é uma única thread.** Estilo, layout, pintura e o seu
JavaScript disputam a mesma — que é o assunto da
[parte 6](/2023/10/navegador-parte-6-javascript/).

## Referências

- [CSS Syntax Level 3](https://www.w3.org/TR/css-syntax-3/) — a gramática e as regras de descarte
- [CSS Cascading and Inheritance Level 5](https://www.w3.org/TR/css-cascade-5/) — origem, especificidade e ordem
- [RenderingNG (Chrome)](https://developer.chrome.com/docs/chromium/renderingng) — a arquitetura atual do pipeline de renderização
- [Inside a super fast CSS engine: Quantum CSS (Lin Clark)](https://hacks.mozilla.org/2017/08/inside-a-super-fast-css-engine-quantum-css-aka-stylo/) — por que o casamento é da direita para a esquerda, e como o Firefox paraleliza
- [Avoid large, complex layouts and layout thrashing (web.dev)](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing) — a lista de propriedades que forçam layout
