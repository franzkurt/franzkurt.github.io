---
title: "Um navegador por dentro, parte 3: o HTTP que anda por cima"
date: 2023-09-16 10:00:00 -0300
tags: [navegador, http, redes, cache, engenharia]
description: "Com o cano aberto, falta combinar o que pedir. Esta parte mede o que o HTTP/2 realmente ganha do HTTP/1.1 — e a resposta é bem menor do que se costuma dizer."
---

*Série **Um navegador por dentro**, o percurso completo:
**1.** [do nome ao endereço](/2023/09/navegador-parte-1-do-nome-ao-endereco/) ·
**2.** [a conexão e a sessão](/2023/09/navegador-parte-2-a-conexao/) ·
**3.** o HTTP que anda por cima (esta) ·
**4.** [o HTML vira árvore](/2023/09/navegador-parte-4-o-html-vira-arvore/) ·
**5.** [estilo, layout e pintura](/2023/09/navegador-parte-5-estilo-e-layout/) ·
**6.** [o JavaScript e a volta do laço](/2023/10/navegador-parte-6-javascript/)*

A [parte 2](/2023/09/navegador-parte-2-a-conexao/) deixou um cano cifrado e
confiável entre o navegador e o servidor. O cano não sabe nada sobre páginas: ele
transporta bytes em ordem. O HTTP é a combinação sobre o que esses bytes querem
dizer.

<!--more-->

## Um pedido é uma frase curta

Sobre o TCP, o primeiro pedido cabe em poucas linhas:

```
GET / HTTP/1.1
Host: franzkurt.github.io
User-Agent: curl/8.14.1
Accept: */*
Accept-Encoding: gzip
```

O `curl` gastou **81 bytes** nisso. Um navegador gasta bem mais — manda
`Accept-Language`, `Referer`, o conjunto de `Sec-Fetch-*`, as dicas de cliente
`Sec-CH-UA`, e os cookies do domínio. É comum passar de 500 bytes, e em sites com
sessão gorda, de 1 kB. Guarde esse número: ele volta quando falarmos de HTTP/2.

A resposta tem a mesma forma, com uma linha de estado na frente:

```
HTTP/2 200
server: GitHub.com
content-type: text/html; charset=utf-8
content-encoding: gzip
content-length: 4028
cache-control: max-age=600
etag: W/"6aadabd7-335b"
via: 1.1 varnish
age: 0
```

Seiscentos e cinquenta e seis bytes de cabeçalho para 4.028 de corpo. E duas
linhas contam coisas que não são sobre esta requisição: `via: 1.1 varnish` diz
que há um CDN na frente do servidor de verdade, e `age: 0` diz que este CDN
acabou de buscar a página — se dissesse `age: 240`, a cópia estaria no cache
dele há quatro minutos.

## Compressão: o ganho que ainda é o maior de todos

```
$ curl -s -o /dev/null -w '%{size_download}\n' -H 'Accept-Encoding: identity' https://franzkurt.github.io/
13147
$ curl -s -o /dev/null -w '%{size_download}\n' -H 'Accept-Encoding: gzip' https://franzkurt.github.io/
4028
```

**13.147 → 4.028 bytes, 30,6% do original.** HTML é texto repetitivo, e texto
repetitivo comprime absurdamente bem. Nenhuma outra otimização de transporte
chega perto disso.

Vale notar o que *não* aconteceu:

```
$ curl -s -o /dev/null -w '%{size_download}\n' -H 'Accept-Encoding: br' https://franzkurt.github.io/
13147
```

Pedindo brotli, veio cru. O GitHub Pages não serve brotli — o cliente pede,
o servidor não tem, e manda sem compressão nenhuma. Brotli costuma render mais
15 a 20% sobre o gzip em HTML, e aqui esse ganho simplesmente não existe. É o
tipo de coisa que você só descobre medindo, porque o navegador não reclama.

## O cache, e o que ele custa quando acerta

`cache-control: max-age=600` autoriza o navegador a reusar a cópia local por dez
minutos **sem perguntar nada**. Essa é a única forma de cache que é realmente
grátis: zero pacotes.

Passados os dez minutos, a cópia não é jogada fora — ela vira suspeita. O
navegador pergunta se ainda vale, usando o `ETag` que veio junto:

```
$ curl -s -o /dev/null -w 'HTTP %{http_code}, %{size_download} bytes em %{time_total}s\n' \
    -H 'If-None-Match: W/"6aadabd7-335b"' https://franzkurt.github.io/
HTTP 304, 0 bytes em 0.184698s
```

Zero bytes de corpo — e 185 milissegundos. Esse é o ponto que quase todo mundo
erra ao pensar em cache: **um 304 economiza banda, não tempo**. Você ainda paga
a conexão inteira e a ida e volta do pedido. Num recurso pequeno, revalidar
custa quase o mesmo que baixar de novo.

Por isso a prática moderna é outra: dar ao arquivo um nome que contém o hash do
conteúdo, e servi-lo com `max-age` de um ano. O arquivo nunca é revalidado; se
mudar, muda o nome, e o nome novo é uma URL nova.

## O problema que o HTTP/1.1 tinha

Numa conexão HTTP/1.1, os pedidos são atendidos em fila. Um pedido de cada vez,
e o segundo só começa quando o primeiro terminou. Se o primeiro for uma imagem
grande e lenta, tudo atrás dela espera — **bloqueio de cabeça de fila** (*head-of-line blocking*).

A saída dos navegadores foi bruta: abrir **seis** conexões por origem e mandar
os pedidos em paralelo nelas. Funciona, mas cada conexão paga os 94 ms de preparo
da [parte 2](/2023/09/navegador-parte-2-a-conexao/), tem a própria partida lenta,
e consome memória nas duas pontas. E como seis não bastavam, nasceu a gambiarra
de espalhar os arquivos por `static1.exemplo.com`, `static2.exemplo.com` — seis
conexões por nome, três nomes, dezoito conexões.

## O que o HTTP/2 realmente ganha

O HTTP/2 troca o texto por um formato binário de quadros, e numa única conexão
mantém vários **fluxos** independentes, intercalados. Um pedido lento não segura
os outros. Além disso comprime os cabeçalhos com HPACK, que mantém uma tabela
dos cabeçalhos já enviados: o `User-Agent` de 200 bytes viaja inteiro uma vez, e
depois vira um índice de um byte.

Doze arquivos reais deste blog, mesma origem, conexão nova a cada rodada:

| modo | tempo (5 rodadas) |
|---|---|
| HTTP/1.1, um pedido de cada vez | 0,713 · 0,819 · 0,478 · 0,448 · 0,503 s |
| HTTP/2, um pedido de cada vez | 0,457 · 0,502 · 0,498 · 0,447 · 0,449 s |
| HTTP/2 multiplexado, uma conexão | **0,152 · 0,161 · 0,168 · 0,162 · 0,150 s** |

Três vezes mais rápido. É esse o número que costuma aparecer nas apresentações
sobre HTTP/2 — e ele compara o HTTP/2 bem usado com o HTTP/1.1 usado do pior
jeito possível.

A comparação honesta é contra o que os navegadores de fato faziam, com seis
conexões:

| modo | tempo (5 rodadas) |
|---|---|
| HTTP/1.1, seis conexões | 0,182 · 0,179 · 0,187 · 0,187 · 0,190 s |
| HTTP/2, uma conexão multiplexada | 0,152 · 0,148 · 0,158 · 0,149 · 0,153 s |

**0,185 contra 0,152 — cerca de 18%.** Real, mas uma ordem de grandeza menor do
que os 3× da tabela anterior.

O ganho de verdade do HTTP/2 é menos sobre velocidade bruta e mais sobre o que
ele deixa de exigir: uma conexão em vez de seis significa um handshake em vez
de seis, uma partida lenta em vez de seis, e o fim do espalhamento por
subdomínios — que, com HTTP/2, passa de otimização a **prejuízo**, porque força
conexões extras onde uma bastava.

## O que o HTTP/2 não resolveu

O multiplexação do HTTP/2 vive dentro de uma conexão TCP, e o TCP entrega em
ordem estrita. Se um pacote se perder, o núcleo do sistema segura **todos** os
fluxos até a retransmissão chegar — inclusive os que não tinham nada naquele
pacote. O bloqueio de cabeça de fila saiu do HTTP e desceu para o TCP.

Resolver isso exigia trocar o transporte, e é o que o HTTP/3 faz: roda sobre
QUIC, em UDP, com os fluxos de fato independentes. A perda de um pacote atrapalha
só o fluxo dele. Em rede boa a diferença é pequena; em rede ruim — celular, Wi-Fi
lotado — é onde ela aparece.

## E então o corpo começa a chegar

O último ponto desta parte é o mais importante para a próxima. O navegador não
espera a resposta terminar. Os bytes do corpo vão sendo entregues ao parser
de HTML **enquanto chegam**, e o parser já vai montando a árvore com o que
tem.

É por isso que uma página bem construída começa a aparecer antes de ter baixado
inteira, e é por isso que a ordem das coisas dentro do HTML muda tanto o que o
usuário vê — assunto da
[parte 4](/2023/09/navegador-parte-4-o-html-vira-arvore/).

## O que fica

**Comprimir ainda é o maior ganho isolado.** 30,6% do tamanho, e um servidor sem
brotli deixa mais 15% na mesa sem avisar ninguém.

**Um 304 economiza banda, não tempo.** Revalidação custa a ida e volta inteira;
nome com hash e cache de um ano custa zero.

**O HTTP/2 rende 18%, não 3×.** Os 3× medem contra um HTTP/1.1 que nenhum
navegador usava. O valor real está em precisar de uma conexão só.

**E o bloqueio de cabeça de fila não morreu.** Ele desceu do HTTP para o TCP, e
só sai de cena com o QUIC.

## Referências

- [RFC 9110 — HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html) — métodos, estados, cabeçalhos, sem depender de versão
- [RFC 9111 — HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111.html) — `Cache-Control`, `ETag`, revalidação
- [RFC 9113 — HTTP/2](https://www.rfc-editor.org/rfc/rfc9113.html) — quadros, fluxos e HPACK
- [RFC 9114 — HTTP/3](https://www.rfc-editor.org/rfc/rfc9114.html) — o HTTP sobre QUIC
- [HTTP/2 é o futuro? (Daniel Stenberg, http2 explained)](https://http2-explained.haxx.se/) — do autor do curl, e honesto sobre os limites
