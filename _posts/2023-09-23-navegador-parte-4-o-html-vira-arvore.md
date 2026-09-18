---
title: "Um navegador por dentro, parte 4: o HTML vira árvore"
date: 2023-09-23 10:00:00 -0300
tags: [navegador, html, dom, parsing, engenharia]
description: "O parser de HTML não rejeita nada. Esta parte mostra, com dez entradas quebradas e o DOM que sai de cada uma, por que ele é assim — e o que isso custa em tempo de carregamento."
---

*Série **Um navegador por dentro**, o percurso completo:
**0.** [as camadas](/2023/08/navegador-parte-0-as-camadas/) ·
**1.** [do nome ao endereço](/2023/09/navegador-parte-1-do-nome-ao-endereco/) ·
**2.** [a conexão e a sessão](/2023/09/navegador-parte-2-a-conexao/) ·
**3.** [o HTTP que anda por cima](/2023/09/navegador-parte-3-http/) ·
**4.** o HTML vira árvore (esta) ·
**5.** [estilo, layout e pintura](/2023/09/navegador-parte-5-estilo-e-layout/) ·
**6.** [o JavaScript e a volta do laço](/2023/10/navegador-parte-6-javascript/)*

Os bytes começaram a chegar. A partir daqui o navegador está sozinho: a rede fez
a parte dela, e o que acontece agora é processamento local, dentro do processo
que desenha a aba.

O primeiro passo é transformar uma sequência de bytes numa árvore de objetos — o
DOM. E a característica que define esse passo é a que mais surpreende quem vem
de outras linguagens: **o parser de HTML não tem como falhar**.

<!--more-->

## Antes dos caracteres, a codificação

Bytes não são texto. Antes de tokenizar qualquer coisa, o navegador precisa
decidir em que codificação aqueles bytes estão, e a decisão tem uma ordem de
precedência que vale conhecer. Servindo a mesma página de quatro jeitos:

```
sem meta, sem charset no HTTP     characterSet=windows-1252  texto='coraÃ§Ã£o'
meta logo no começo               characterSet=UTF-8         texto='coração'
meta depois de 1100 bytes         characterSet=UTF-8         texto='coração'
HTTP diz latin-1, meta diz utf-8  characterSet=windows-1252  texto='coraÃ§Ã£o'
```

Três lições em quatro linhas:

**Sem declaração nenhuma, o padrão não é UTF-8** — é `windows-1252`, herança dos
anos noventa, e o resultado é o acento quebrado. Não declarar não é neutro.

**A posição do `<meta charset>` não importa tanto quanto se diz.** Existe uma
pré-varredura que olha o começo do documento, mas quando o `<meta>` aparece
depois dela o parser simplesmente **recomeça** o trabalho com a codificação
nova. Custa tempo, não corretude. Eu esperava que o acento quebrasse aqui; ele
não quebrou.

**O cabeçalho HTTP vence o `<meta>`, inclusive quando está errado.** Na última
linha o documento declara UTF-8 e sai errado do mesmo jeito, porque o servidor
disse latin-1 e o servidor tem a palavra final. É a causa daquele bug em que a
página funciona no seu disco e quebra ao subir.

## O parser em duas máquinas de estado

Com caracteres em mãos, o trabalho é dividido em dois, como a
[especificação do HTML](https://html.spec.whatwg.org/multipage/parsing.html)
define:

**O tokenizador** é uma máquina de estados que consome caracteres e emite
tokens: abertura de tag, fechamento, atributo, texto, comentário. Ele vive em
estados com nomes como *data state*, *tag open state*, *attribute name state*.

**O construtor da árvore** recebe esses tokens e é outra máquina de estados,
cujos estados se chamam **modos de inserção** — *in head*, *in body*, *in table*.
Ele mantém uma pilha de elementos abertos e uma lista de elementos de formatação
ativos, e é aqui que mora toda a estranheza.

Por que não usar um parser comum, gerado a partir de uma gramática? Porque
HTML não é uma linguagem livre de contexto. O que ele faz com entrada quebrada
não é "falhar de um jeito definido": é um conjunto de regras de recuperação que
foram escritas depois, copiando o que os navegadores da época já faziam. E
porque o processo é **reentrante** — um `document.write` no meio pode injetar
texto na entrada que está sendo lida.

## Dez entradas quebradas e a árvore que sai

Nada explica isso tão bem quanto ver. Cada caso abaixo foi passado a um Chromium
de verdade, e a árvore mostrada é o DOM resultante dentro do `<body>`:

```
entrada:  <p>um<p>dois
DOM:      <p> "um"
          <p> "dois"
```

O primeiro `<p>` foi fechado sozinho. `<p>` não pode conter `<p>`, então abrir um
novo fecha o anterior. Mesma coisa com `<li>` e `<tr>`.

```
entrada:  <b>a<p>b</b>c</p>
DOM:      <b> "a"
          <p>
            <b> "b"
            "c"
```

Este é o mais interessante. O negrito atravessava a fronteira do parágrafo, o que
não pode existir numa árvore. O parser **duplicou** o `<b>`: um fora,
outro dentro do `<p>`, cobrindo só o que era para estar em negrito. Esse
comportamento tem nome na especificação — *adoption agency algorithm* — e a
descrição dele ocupa páginas.

```
entrada:  <table><div>fora</div><tr><td>dentro</td></tr></table>
DOM:      <div> "fora"
          <table>
            <tbody>
              <tr>
                <td> "dentro"
```

Duas coisas de uma vez. A `<div>` não pode estar dentro de uma tabela, então foi
**movida para fora**, antes da tabela — e o texto dela aparece acima, o que já
confundiu muita gente. E o `<tbody>`, que ninguém escreveu, foi inventado, porque
a estrutura da tabela o exige.

```
entrada:  a</br>b            DOM:  "a" <br> "b"
entrada:  <form><form><input></form>   DOM:  <form> <input>
entrada:  <p>antes<!-- nunca fecha <p>depois
DOM:      <p> "antes" <!--comentário-->
```

`</br>` é fechamento de uma tag que nunca abriu; a regra manda tratá-lo como
`<br>`. O `<form>` aninhado é simplesmente ignorado — formulários não aninham. E
o comentário não fechado engoliu o resto do documento: o segundo `<p>` nunca
existiu.

```
entrada:  <p>a<script>var s='</p>';</script>b
DOM:      <p> "a" <script> "var s='</p>';" "b"
```

Dentro de `<script>` o tokenizador entra num estado diferente, em que tags não
são tags. O `</p>` continuou sendo texto. Se fosse `</script>` dentro da
string, aí sim o script seria cortado no meio — é a origem de uma classe inteira
de falhas de injeção.

Nenhum desses casos produziu erro. Todos produziram *alguma* árvore. É por isso
que "funciona no navegador" não quer dizer que o HTML esteja certo, e é por isso
que validar é uma decisão sua, não do navegador.

## O parser para quando vê um script

Montar a árvore é rápido. O que faz a etapa demorar é ela ser interrompida. Um
`<script src>` comum **para o parser**: nada mais da página é processado
enquanto o arquivo não chegar e não rodar. Tem que ser assim, porque o script
pode chamar `document.write`.

Medindo com um servidor local que segura cada recurso por 300 ms:

| o que está no topo | fim da análise | DOMContentLoaded | load |
|---|---:|---:|---:|
| `<script src>` comum | **320 ms** | 320 ms | 336 ms |
| `<script defer src>` | **13 ms** | 313 ms | 313 ms |
| `<script async src>` | **12 ms** | 12 ms | 314 ms |

O script comum custou os 300 ms inteiros à construção do DOM. Com `defer` a
árvore ficou pronta em 13 ms — o download aconteceu em paralelo, e o script só
rodou no fim, antes do `DOMContentLoaded`. Com `async`, o script roda assim que
chega, sem ordem garantida, e nem segura o `DOMContentLoaded`.

A regra prática sai direto da tabela: **`defer` para o que precisa do DOM e de
ordem; `async` para o que é independente** — medição, telemetria; e script comum
no topo, praticamente nunca.

## O parser especulativo

Repare numa coisa na primeira linha. A página de teste tinha uma imagem **depois**
do script bloqueante, e mesmo assim:

```
pedidos: /p.html@15ms  /lento.js@27ms  /foto.png@27ms
```

A imagem foi pedida no mesmo instante que o script, não 300 ms depois. Enquanto
a construção da árvore está travada, um segundo parser corre à frente pelo
resto do documento procurando só por URLs, e vai disparando os downloads. Ele não
constrói nada — não pode, já que o script ainda vai rodar e pode mudar tudo —,
mas tira a rede da fila crítica.

É por isso que `<link rel=preload>` funciona, e por isso que recursos declarados
por JavaScript em vez de por tag perdem essa vantagem: o parser especulativo
lê HTML, não lê o seu código.

## A folha de estilo no lugar errado

Este eu achei que sabia, e estava enganado. A crença comum é que folhas de estilo
não bloqueiam a análise. Medindo:

| onde está o `<link rel=stylesheet>` lento | fim da análise |
|---|---:|
| dentro do `<head>` | 29 ms |
| dentro do `<body>` | **312 ms** |

No `<head>`, não bloqueia — como se ensina. No `<body>`, bloqueia os 300 ms
inteiros. E há um segundo caso, independente da posição: um `<script>` embutido
logo **depois** de uma folha pendente também espera por ela, porque o script pode
ler `getComputedStyle` e a resposta dependeria da folha:

```
folha + script embutido depois    fim da análise = 310 ms
script embutido antes da folha    fim da análise =  11 ms
```

Mesmos dois elementos, ordem trocada, 28 vezes de diferença.

## Os dois eventos do fim

**`DOMContentLoaded`** dispara quando a árvore está completa e os scripts com
`defer` rodaram. Não espera imagens, nem folhas de estilo, nem `async`.

**`load`** espera tudo — imagens, iframes, folhas, tudo que a página declarou.

Quase todo código que espera `load` queria, na verdade, `DOMContentLoaded`. A
diferença na tabela acima é pequena porque a página de teste é pequena; num site
com imagens de verdade, são segundos.

## O que fica

**O parser não rejeita nada.** Toda entrada vira uma árvore, e as regras de
recuperação estão na especificação, com nome e número. Elas movem elementos,
inventam outros e duplicam formatação.

**A codificação é decidida antes, e o HTTP tem a palavra final.** Sem declaração
o padrão é `windows-1252`, não UTF-8.

**Script comum trava a construção da árvore.** 320 ms contra 13 com `defer`, na
mesma página.

**E a posição da folha de estilo importa mais do que se diz.** No `<body>`, ela
bloqueia. Antes de um script embutido, também.

A árvore está pronta. Ela ainda não tem cor, tamanho nem posição — é disso que
trata a [parte 5](/2023/09/navegador-parte-5-estilo-e-layout/).

## Referências

- [HTML Standard, seção 13.2 — Parsing HTML documents](https://html.spec.whatwg.org/multipage/parsing.html) — o tokenizador, os modos de inserção e o *adoption agency*
- [Encoding Standard](https://encoding.spec.whatwg.org/) — a ordem de precedência e por que o padrão é `windows-1252`
- [How browsers work (Tali Garsiel e Paul Irish)](https://web.dev/articles/howbrowserswork) — a explicação clássica do WebKit e do Gecko
- [Inside look at modern web browser (Mariko Kosaka, Chrome)](https://developer.chrome.com/blog/inside-browser-part1) — a arquitetura de processos por trás disso tudo
- [Preload scanner (web.dev)](https://web.dev/articles/preload-scanner) — o parser que corre à frente
