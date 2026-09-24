---
title: "Um navegador por dentro, parte 2: a conexão e a sessão"
date: 2023-09-09 10:00:00 -0300
tags: [navegador, redes, tcp, tls]
description: "Um endereço IP não é uma conexão. Entre um e outro há três idas e voltas, um estado compartilhado que ninguém transmite, e o handshake que finalmente prova que o servidor é quem diz ser."
---

*Série **Um navegador por dentro**, o percurso completo:
**0.** [as camadas](/2023/08/navegador-parte-0-as-camadas/) ·
**1.** [do nome ao endereço](/2023/09/navegador-parte-1-do-nome-ao-endereco/) ·
**2.** a conexão e a sessão (esta) ·
**3.** [o HTTP que anda por cima](/2023/09/navegador-parte-3-http/) ·
**4.** [o HTML vira árvore](/2023/09/navegador-parte-4-o-html-vira-arvore/) ·
**5.** [estilo, layout e pintura](/2023/09/navegador-parte-5-estilo-e-layout/) ·
**6.** [o JavaScript e a volta do laço](/2023/10/navegador-parte-6-javascript/) ·
**7.** [tcpdump e scapy](/2023/10/navegador-parte-7-tcpdump-e-scapy/)*

Na [parte 1](/2023/09/navegador-parte-1-do-nome-ao-endereco/) o nome virou
endereço. Ter o endereço, porém, não é ter para onde mandar um pedido — é saber
para onde mandar o **primeiro pacote**. Entre esse pacote e o primeiro byte de
HTML há três idas e voltas completas, e vale muito a pena saber qual é o preço
de cada uma.

<!--more-->

## A conta, medida

Vinte e cinco conexões novas contra o servidor deste blog, uma de cada vez, com
o `curl` reportando quando cada etapa terminou. Medianas:

| etapa | acumulado | só ela | mín | máx |
|---|---:|---:|---:|---:|
| DNS (cache local) | 2,2 ms | 2,2 ms | 1,6 | 2,6 |
| handshake TCP | 30,6 ms | **28,4 ms** | 29,8 | 36,8 |
| handshake TLS | 64,8 ms | **34,2 ms** | 63,1 | 99,7 |
| pedido + 1º byte | 94,4 ms | **29,6 ms** | 92,3 | 129,1 |
| resto do corpo | 98,1 ms | 3,8 ms | 95,3 | 134,1 |

O tempo de ida e volta até esse servidor, medido com `ping`, é de **28,7 ms** no
melhor caso. Compare com a coluna do meio: 28,4 — 34,2 — 29,6. Três etapas, cada
uma custando praticamente exatamente uma ida e volta.

É esse o formato do problema. Noventa e oito milissegundos para buscar uma página
de quatro kilobytes, e **quase nada disso é transferência**: o corpo inteiro
levou 3,8 ms. Os outros 94 foram o preço de estabelecer o direito de pedir.

## O handshake de três vias

TCP começa com três pacotes:

```
cliente                                servidor
   │  SYN, seq=x                          │      ← "quero abrir, meu número começa em x"
   │ ───────────────────────────────────► │
   │                                      │
   │  SYN-ACK, seq=y, ack=x+1             │      ← "ok, o meu começa em y, recebi até x"
   │ ◄─────────────────────────────────── │
   │                                      │
   │  ACK, ack=y+1   [+ dados já juntos]  │      ← "recebi até y" — e já manda o pedido
   │ ───────────────────────────────────► │
```

Três pacotes, mas **uma** ida e volta de espera: o cliente já pode mandar dados
junto com o terceiro. Por isso a medição deu 28,4 ms e não 43.

Os números de sequência `x` e `y` não são zero. São sorteados, e isso é uma
defesa: se fossem previsíveis, alguém fora do caminho conseguiria injetar
pacotes numa conexão alheia só adivinhando em que ponto ela está.

## O que "sessão" quer dizer

Aqui vale desfazer uma confusão comum. Não existe, em lugar nenhum da rede, um
objeto chamado sessão. O que existe é um par de máquinas de estado, uma em cada
ponta, que concordam sobre quatro números:

```
(IP de origem, porta de origem, IP de destino, porta de destino)
```

Essa quádrupla **é** a conexão. Nenhum pacote carrega um identificador de sessão;
cada pacote carrega os quatro campos, e cada ponta procura na sua tabela qual
estado corresponde a eles. É por isso que trocar de rede — sair do Wi-Fi para o
4G — derruba todos os downloads: o seu IP de origem mudou, a quádrupla não
existe mais, e a conexão morreu sem que nada tenha acontecido com ela.

Sobre essa quádrupla o TCP mantém o que o IP não dá:

- **ordem** — os pacotes podem chegar trocados; os números de sequência os
  recolocam na fila;
- **confiabilidade** — o que não for confirmado é retransmitido;
- **controle de fluxo** — a janela anunciada impede que o emissor afogue o
  receptor;
- **controle de congestionamento** — e este é o que aparece na medição.

## Por que o corpo levou só 3,8 ms

Uma conexão nova não começa mandando tudo que pode. Ela começa em **partida lenta** (*slow start*): manda um punhado de segmentos, espera as confirmações, e só então
dobra. A [RFC 6928](https://www.rfc-editor.org/rfc/rfc6928.txt) fixou esse
punhado inicial em **10 segmentos**, que dá algo em torno de 14 kB.

A página inicial deste blog tem 13.147 bytes crus e **4.028 comprimidos**. Cabe
inteira na primeira janela. O servidor mandou tudo de uma vez, sem esperar
confirmação nenhuma, e por isso o corpo custou 3,8 ms em vez de mais uma ida e
volta.

Esse é o número que vale guardar: **abaixo de uns 14 kB comprimidos, a primeira
resposta é essencialmente de graça**. Acima, cada dobra da janela custa uma ida
e volta. É a razão técnica por trás do conselho de manter o HTML inicial pequeno
— não é sobre largura de banda, é sobre quantas vezes você vai esperar.

## O TLS por cima, e o que ele resolve

Terminado o TCP, o navegador tem um cano confiável para uma máquina que ele
ainda não sabe quem é. O TLS resolve isso, e no TLS 1.3 resolve em **uma** ida e
volta:

```
ClientHello    → versões, cifras, ALPN, e já a metade dele de uma troca de chaves
               ← ServerHello, certificado, assinatura, "terminei"
"terminei"     → e o pedido HTTP já vai junto
```

Medimos 34,2 ms para essa etapa contra 28,7 ms de ida e volta pura: a diferença
são os milissegundos de criptografia — verificar a assinatura, derivar as
chaves. No TLS 1.2 isso custava **duas** idas e voltas; cortar uma foi
provavelmente a maior melhoria de desempenho da web na década.

Duas coisas viajam de carona nesse mesmo handshake, e ambas economizam
viagens:

**SNI** — o nome do host vai no `ClientHello`, em claro, antes de qualquer
cifra. É o que permite mil sites no mesmo IP. É também o que ainda vaza para
quem observa o caminho qual site você está abrindo, mesmo com tudo cifrado.

**ALPN** — o cliente lista os protocolos que fala e o servidor escolhe, tudo
dentro do handshake. Sem isso, descobrir que o servidor fala HTTP/2 custaria
uma viagem a mais. Neste blog:

```
$ echo | openssl s_client -connect franzkurt.github.io:443 \
    -servername franzkurt.github.io -alpn h2,http/1.1 2>/dev/null | grep -E 'Protocol|Cipher|ALPN'
    Protocol  : TLSv1.3
    Cipher    : TLS_AES_128_GCM_SHA256
    ALPN protocol: h2
```

## O certificado fecha o buraco da parte 1

Lá atrás ficou registrado que a resposta do DNS chega sem assinatura, e que
qualquer um no caminho pode mentir. É aqui que a mentira não cola:

```
subject=CN=*.github.io
issuer=C=US, O=Let's Encrypt, CN=YR1
X509v3 Subject Alternative Name:
    DNS:*.github.com, DNS:*.github.io, DNS:*.githubusercontent.com, ...
```

O servidor apresentou um certificado emitido pela Let's Encrypt dizendo
"eu sou `*.github.io`", e assinou, com a chave privada correspondente, dados
daquele handshake específico. Quem desviou o seu DNS não tem essa chave. Não
consegue produzir a assinatura. A conexão morre com um erro em vez de abrir uma
página falsa.

O DNS continua sem autenticação — a diferença é que ele deixou de importar para
essa ameaça.

## Retomada: o que ela economiza, e o que não

Sessões de TLS podem ser retomadas. Guardando o estado de uma conexão anterior e
apresentando-o na seguinte, o servidor confirma:

```
Reused, TLSv1.3, Cipher is TLS_AES_128_GCM_SHA256
```

O que vale medir é o que isso poupa. Não é uma ida e volta: o handshake completo do
TLS 1.3 **já** custa uma só, e a retomada custa uma também. O que ela poupa é
tráfego — o certificado inteiro não é reenviado — e processamento: não há
assinatura para verificar.

A economia de ida e volta existiria com **0-RTT**, em que o cliente manda o
pedido junto com o primeiro pacote. Mas este servidor não oferece:

```
Max Early Data: 0
```

E faz sentido: dados de 0-RTT podem ser capturados e reenviados por um atacante,
o que é aceitável para um `GET` e péssimo para qualquer outra coisa. Vários
operadores preferem não abrir essa porta.

## Reusar é melhor que retomar

Melhor que retomar uma sessão é nunca fechá-la. Três pedidos na mesma conexão:

```
dns=0.002560 tcp=0.030815 tls=0.066325   ← o primeiro paga tudo
dns=0.000000 tcp=0.000000 tls=0.000000   ← o segundo não paga nada
dns=0.000000 tcp=0.000000 tls=0.000000   ← o terceiro tampouco
```

Zero. Não há DNS, não há handshake TCP, não há TLS. E a conexão já saiu da
partida lenta, então a janela está larga. Os 94 ms de preparo são pagos **uma
vez por conexão**, não uma vez por recurso — e é exatamente por isso que o
HTTP/2, que enfia tudo numa conexão só, é o assunto da
[parte 3](/2023/09/navegador-parte-3-http/).

## O que fica

**Três idas e voltas antes do primeiro byte.** TCP, TLS, pedido. Nesta medição,
94 ms de preparo para 3,8 ms de transferência.

**A sessão não existe no fio.** É a quádrupla de endereços e portas, mais estado
nas duas pontas. Trocar de rede não "interrompe" a conexão: apaga a identidade
dela.

**Os primeiros 14 kB são de graça.** Depois disso você começa a pagar em idas e
voltas, uma por dobra da janela.

**O TLS não está ali só para cifrar.** Ele é o que torna o DNS não-autenticado
aceitável, e é onde o HTTP/2 é escolhido sem custo nenhum.

## Referências

- [RFC 9293 — Transmission Control Protocol](https://www.rfc-editor.org/rfc/rfc9293.html) — a especificação consolidada do TCP
- [RFC 6928 — Increasing TCP's Initial Window](https://www.rfc-editor.org/rfc/rfc6928.txt) — de onde vêm os 10 segmentos
- [RFC 8446 — TLS 1.3](https://www.rfc-editor.org/rfc/rfc8446.txt) — o handshake de uma ida e volta, e o 0-RTT
- [RFC 7301 — ALPN](https://www.rfc-editor.org/rfc/rfc7301.txt) — como o HTTP/2 é negociado sem viagem extra
- [High Performance Browser Networking (Ilya Grigorik)](https://hpbn.co/) — livro inteiro, de graça, sobre esta parte do caminho
