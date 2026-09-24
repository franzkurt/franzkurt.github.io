---
title: "Um navegador por dentro, parte 1: do nome ao endereço"
date: 2023-09-02 10:00:00 -0300
tags: [navegador, redes, dns, http]
description: "Entre apertar enter e o primeiro byte sair da placa de rede, o navegador já tomou meia dúzia de decisões. Esta parte abre a primeira delas: transformar um nome em um endereço IP."
---

*Série **Um navegador por dentro**, o percurso completo:
**0.** [as camadas](/2023/08/navegador-parte-0-as-camadas/) ·
**1.** do nome ao endereço (esta) ·
**2.** [a conexão e a sessão](/2023/09/navegador-parte-2-a-conexao/) ·
**3.** [o HTTP que anda por cima](/2023/09/navegador-parte-3-http/) ·
**4.** [o HTML vira árvore](/2023/09/navegador-parte-4-o-html-vira-arvore/) ·
**5.** [estilo, layout e pintura](/2023/09/navegador-parte-5-estilo-e-layout/) ·
**6.** [o JavaScript e a volta do laço](/2023/10/navegador-parte-6-javascript/) ·
**7.** [tcpdump e scapy](/2023/10/navegador-parte-7-tcpdump-e-scapy/)*

Você digita um endereço e aperta enter. Cem milissegundos depois a página está
lá. Entre uma coisa e outra acontece uma sequência que tem umas seis etapas bem
distintas, cada uma com seus próprios modos de falhar, e a maior parte dos
programadores que escrevem para a web nunca precisou olhar nenhuma delas.

Esta série abre as seis, na ordem em que acontecem. Tudo que está aqui foi
medido nesta máquina — um Debian com Chromium, falando com este blog, que fica
hospedado no GitHub Pages. Os números são reais e os comandos estão no texto,
para você rodar contra o seu próprio alvo.

<!--more-->

## Antes da rede: o texto ainda não é um endereço

O que você digitou foi para a barra de endereços, que é também a barra de busca.
A primeira decisão do navegador não tem nada de rede: é decidir se aquilo é um
endereço ou um termo de busca. `franzkurt.github.io` tem um ponto e um sufixo
conhecido, então vira endereço. `como funciona um navegador` vira busca. É uma
heurística, e é por isso que digitar `localhost:8000` às vezes cai numa busca —
não tem ponto.

Decidido que é endereço, o texto passa pelo parser de URL, que segue o
[padrão da WHATWG](https://url.spec.whatwg.org/). Esse passo faz mais do que
separar em pedaços:

- completa o esquema que faltou (`franzkurt.github.io` → `http://...`);
- passa o nome do host para minúsculas;
- converte acentos e caracteres não-ASCII para **punycode** — `brasão.br` vira
  `xn--braso-6ma.br` antes de qualquer consulta, porque o DNS só fala ASCII;
- normaliza o caminho, resolvendo `.` e `..`.

Só depois disso existe uma URL para trabalhar.

## O redirecionamento que custa uma conexão inteira

Se você digitou sem o `https://`, o navegador tem duas saídas. A boa é a lista
**HSTS de pré-carregamento**: uma lista embutida no binário do navegador com os
domínios que declararam "nunca me acesse por HTTP". Se o domínio está nela, o
`http://` vira `https://` na memória, sem tocar na rede.

Se não está, o navegador tenta HTTP mesmo, e o servidor responde com um
redirecionamento. Dá para medir o preço disso:

```
$ curl -sL -o /dev/null -w 'total=%{time_total}s saltos=%{num_connects}\n' http://franzkurt.github.io/
total=0.156157s saltos=2
$ curl -s  -o /dev/null -w 'total=%{time_total}s saltos=%{num_connects}\n' https://franzkurt.github.io/
total=0.096415s saltos=1
```

**156 ms contra 96 ms.** O redirecionamento não custa "um cabeçalho a mais": ele
custa uma conexão inteira jogada fora — resolução, handshake TCP, aperto de
mão TLS — só para receber a instrução de fazer tudo de novo no outro esquema.
Sessenta milissegundos, sempre, na primeira visita de todo mundo que digita sem
o `https`.

## A cascata de caches

Agora o navegador precisa de um endereço IP. Ele não sai perguntando na rede de
cara; ele consulta uma pilha de caches, do mais barato para o mais caro:

```
cache interno do navegador      (na memória do processo, segundos a minutos)
      ↓ não achou
/etc/hosts                      (arquivo local, sempre vence)
      ↓ não achou
cache do sistema                (systemd-resolved, nscd, o que houver)
      ↓ não achou
resolvedor configurado          (o do provedor, ou 1.1.1.1, ou o seu)
      ↓ não achou
resolução recursiva             (raiz → .io → github.io → resposta)
```

O primeiro nível costuma surpreender: o navegador tem o **seu próprio** cache de
DNS, separado do sistema. É por isso que limpar o cache do sistema operacional
às vezes não resolve nada, e por que o Chromium tem uma página só para isso, em
`chrome://net-internals/#dns`.

A diferença entre acertar e errar o cache é fácil de ver:

```
$ dig +noall +stats franzkurt.github.io | grep 'Query time'
;; Query time: 0 msec          ← resolvedor local, já sabia

$ dig @1.1.1.1 +noall +stats franzkurt.github.io | grep 'Query time'
;; Query time: 28 msec         ← um resolvedor na rede, uma ida e volta
```

Zero contra 28 milissegundos. Não é que o 1.1.1.1 seja lento — 28 ms é
exatamente o tempo de ida e volta até ele. É que o local não precisou sair de
casa.

## O nome não devolve *um* endereço

Aqui está uma coisa que quase todo diagrama de "como funciona o DNS" simplifica
demais. O nome não resolve para um endereço:

```
$ dig +short franzkurt.github.io A
185.199.110.153
185.199.109.153
185.199.111.153
185.199.108.153

$ dig +short franzkurt.github.io AAAA
2606:50c0:8001::153
2606:50c0:8002::153
2606:50c0:8003::153
2606:50c0:8000::153
```

Oito endereços, quatro de cada família. E se você chamar de novo, a ordem muda —
o resolvedor rotaciona a lista a cada resposta. Isso é balanceamento de carga
feito no lugar mais barato possível: distribuir clientes sem nenhum equipamento
no meio.

Além disso, cada um desses quatro endereços é **anycast**: o mesmo IP está
anunciado de dezenas de lugares do mundo ao mesmo tempo, e o roteamento entrega
o seu pacote ao mais próximo. Os 185.199.108–111 não são quatro máquinas; são
quatro entradas para uma frota.

## Happy Eyeballs: o navegador corre as duas famílias

Com endereços IPv4 e IPv6 na mão, qual usar? A resposta ingênua — "IPv6, é o
futuro" — quebra feio em redes onde o IPv6 está configurado mas não funciona: o
navegador fica trinta segundos esperando um tempo limite antes de tentar o IPv4.

A resposta real está na [RFC 8305](https://www.rfc-editor.org/rfc/rfc8305.txt),
que tem o nome ótimo de **Happy Eyeballs**: dispare a conexão IPv6, e se ela não
tiver respondido em uns 250 ms, dispare a IPv4 em paralelo. Quem chegar primeiro
ganha; a outra é abandonada. A preferência pelo IPv6 fica, mas o custo de errar
cai de trinta segundos para um quarto de segundo.

Nesta máquina o IPv6 funciona, e é sempre ele que vence:

```
$ curl -s -o /dev/null -w '%{remote_ip}\n' https://franzkurt.github.io/
2606:50c0:8003::153
```

Forçando cada família, o tempo de conexão é o mesmo — 29,7 ms pelo IPv4 contra
30,1 ms pelo IPv6. A escolha não é de desempenho; é de ordem de tentativa.

## O elo que ninguém autentica

Vale registrar onde este primeiro passo é frágil. A resposta do DNS chegou em
UDP, em texto claro, sem assinatura. Qualquer um no caminho — o café, o
provedor, o roteador comprometido — pode responder antes do servidor de verdade
e mandar o seu navegador para o endereço que quiser.

O que segura isso hoje não é o DNS: é o TLS, na etapa seguinte. Se o atacante
desviar o seu `franzkurt.github.io` para uma máquina dele, essa máquina não vai
conseguir apresentar um certificado válido para esse nome. A conexão morre com
erro em vez de abrir uma página falsa.

As defesas no próprio DNS existem — DNSSEC assina as respostas, DoH e DoT
cifram o transporte — mas a adoção é irregular, e o que efetivamente protege a
sua navegação é a etapa que vem agora.

## O que fica

**Metade do trabalho acontece antes de qualquer pacote sair.** Decidir se é
busca ou endereço, normalizar, converter para punycode, consultar HSTS: tudo
isso é local, e tudo isso pode dar errado de formas que não parecem rede.

**Digitar sem `https://` custa uma conexão inteira.** Sessenta milissegundos
nesta medição, e o remédio é entrar na lista de pré-carregamento.

**Um nome vira oito endereços, e a escolha é uma corrida.** Round-robin no DNS,
anycast no roteamento, Happy Eyeballs no cliente — três camadas de
balanceamento, nenhuma delas visível na barra de endereços.

Na [parte 2](/2023/09/navegador-parte-2-a-conexao/), o endereço vira uma conexão:
o handshake do TCP, o que "sessão" quer dizer de verdade, e o TLS por cima —
com o custo de cada ida e volta medido separadamente.

## Referências

- [URL Living Standard (WHATWG)](https://url.spec.whatwg.org/) — o parser de URL que todo navegador implementa
- [RFC 8305 — Happy Eyeballs versão 2](https://www.rfc-editor.org/rfc/rfc8305.txt) — a corrida entre IPv6 e IPv4
- [RFC 6797 — HTTP Strict Transport Security](https://www.rfc-editor.org/rfc/rfc6797.txt) — o HSTS e a lista de pré-carregamento
- [hstspreload.org](https://hstspreload.org/) — a lista embutida nos navegadores
- [RFC 1035 — Domain Names](https://www.rfc-editor.org/rfc/rfc1035.txt) — o formato do pacote de DNS
- [How browsers work (Tali Garsiel e Paul Irish)](https://web.dev/articles/howbrowserswork) — a referência clássica sobre o resto do caminho
