---
title: "Traefik ou nginx: medi os dois fazendo a mesma coisa"
date: 2026-09-03 10:00:00 -0300
tags: [nginx, traefik, infraestrutura, containers]
description: "Subi os dois roteando os mesmos serviços, acrescentei um terceiro e cronometrei. A diferença de desempenho que todo mundo cita não apareceu; a que decide a escolha é outra."
---

A comparação que circula é sempre a mesma: *"nginx é mais rápido, Traefik é mais
fácil com containers"*. A segunda metade eu confirmei. A primeira não se
sustentou na medição, e isso mudou como eu penso na escolha.

Subi os dois aqui, roteando **os mesmos dois serviços** pelos mesmos nomes, e
depois acrescentei um terceiro para ver o que cada um exige. Tudo com podman,
nginx `alpine` e Traefik `v3.3`.

Um [segundo texto](/2026/09/https-no-seu-computador/) cobre a outra metade do
assunto — nomes que resolvem para a sua máquina e a cadeia de confiança do
HTTPS.

<!--more-->

## O que cada um é

Essa é a distinção que organiza todo o resto, e ela não é sobre velocidade.

**O nginx é um servidor web** que também sabe fazer proxy. Ele tem raiz de
documentos: dentro do container há um `index.html` que ele entrega sozinho.

**O Traefik é um roteador** e só. Não tem raiz de documentos — olhei dentro do
container e não há o que servir. Ele recebe uma requisição e decide para qual
serviço mandar.

Se o seu problema inclui "entregar arquivo estático", um deles já resolve e o
outro precisa de alguém atrás.

## A mesma tarefa, nos dois

Dois serviços, cada um respondendo por um nome. No nginx, um arquivo:

```nginx
server {
  listen 80;
  server_name alfa.127.0.0.1.nip.io;
  location / { proxy_pass http://app-alfa; }
}
server {
  listen 80;
  server_name beta.127.0.0.1.nip.io;
  location / { proxy_pass http://app-beta; }
}
```

Dez linhas, e funciona. (Aqueles nomes `.nip.io` resolvem para `127.0.0.1` sem
você configurar nada — é o assunto do outro texto.)

No Traefik, **nenhum arquivo de rotas**. A configuração vai em rótulos, no
próprio serviço:

```bash
podman run -d --name app-alfa --network demo \
  --label traefik.enable=true \
  --label 'traefik.http.routers.alfa.rule=Host(`alfa.127.0.0.1.nip.io`)' \
  --label 'traefik.http.services.alfa.loadbalancer.server.port=80' \
  nginx:alpine
```

O Traefik descobre pelo socket do runtime. Os dois entregaram o mesmo resultado.

## O teste que separa os dois

Aqui está a diferença que importa. Acrescentei um terceiro serviço e cronometrei
o que cada caminho exige:

| | Traefik | nginx |
|---|---|---|
| arquivos de configuração editados | **0** | 1 |
| linhas acrescentadas | **0** | 5 |
| recarga do proxy | **nenhuma** | `nginx -t` + `nginx -s reload` |
| até responder | 2 s | 2 s |

O tempo foi o mesmo. O **trabalho** não. No Traefik eu subi o container e fui
embora; no nginx eu editei um arquivo, validei a sintaxe e mandei recarregar.

Multiplique por um ambiente onde serviços sobem e descem o tempo todo, e essa é
a razão pela qual o Traefik existe.

## A velocidade que eu não consegui medir

Agora a parte que me surpreendeu.

Medi primeiro com `curl` num laço: **11,2 ms de mediana nos dois**. Mas esse
número não vale nada — o custo de subir o processo do `curl` domina, e é igual
para os dois.

Refiz com conexão persistente, 3.000 requisições, que é como um cliente real se
comporta:

| proxy | mediana | p95 | p99 | req/s |
|---|---|---|---|---|
| nginx | 0,510 ms | 0,664 ms | 0,788 ms | 1.961 |
| Traefik | 0,476 ms | 0,599 ms | 0,676 ms | 2.102 |

O Traefik saiu **na frente**. Desconfiei do resultado — é exatamente o tipo de
número que engana — e repeti cinco vezes, alternando qual roda primeiro para
não favorecer nenhum:

| rodada | nginx | Traefik |
|---|---|---|
| 1 | 0,466 ms | 0,477 ms |
| 2 | 0,460 ms | 0,461 ms |
| 3 | 0,458 ms | 0,447 ms |
| 4 | 0,575 ms | 0,465 ms |
| 5 | **4,275 ms** | 0,415 ms |

Mediana das cinco: **0,466 ms contra 0,461 ms**. Empate. A quinta rodada do nginx
com 4,275 ms é um ponto fora da curva, não uma tendência.

A conclusão honesta é que **não consegui medir diferença de desempenho** entre os
dois neste cenário. Isso não prova que ela não exista em carga alta, com muitas
conexões simultâneas ou TLS pesado — prova que, para o caso comum de rotear
alguns serviços, ela não é o critério.

## Onde a diferença é real e mensurável

| | nginx | Traefik |
|---|---|---|
| memória em uso | **11,7 MB** | 37,2 MB |
| tamanho da imagem | **64,3 MB** | 225 MB |
| opções de linha de comando | dezenas | **446** |
| serve arquivo estático | sim | não |
| descobre serviços sozinho | não | sim |

Três vezes mais memória e três vezes e meia mais imagem. O Traefik é escrito em
Go, e carrega o runtime da linguagem junto; o nginx é C compilado para o mínimo.

Num servidor, 25 MB a mais não decidem nada. Num Raspberry Pi com vinte
containers, começam a decidir.

E aquelas 446 opções de linha de comando são as duas faces da mesma moeda:
o Traefik faz mais coisas sozinho — certificado automático, métricas,
*middlewares*, painel — e por isso tem mais o que configurar errado.

## Como eu escolheria

**Traefik quando os serviços mudam sem você.** Ambiente com containers subindo e
descendo, várias pessoas publicando, ou você não quer editar arquivo a cada
serviço novo. O ganho é operacional, não de velocidade.

**nginx quando a topologia é estável.** Um punhado de serviços que muda uma vez
por trimestre, ou quando você também precisa **servir arquivo** — site estático,
uploads, cache. Aí o Traefik precisaria de alguém atrás dele, e você teria dois
processos onde um bastava.

**E não escolha por desempenho** sem medir o seu caso. Eu tentei medir e não
achei diferença; se a sua carga for outra, a sua medição é que decide — não a
minha, e muito menos a frase que circula.

## O que fica

**A escolha é de modelo operacional, não de velocidade.** Arquivo de
configuração contra descoberta automática: é essa a pergunta.

**"X é mais rápido que Y" costuma ser folclore repetido.** Medi cinco vezes,
alternando a ordem, e deu empate. A primeira medição que fiz — a do `curl` em
laço — teria dado empate por motivo errado, porque media o `curl`.

**Servidor web e roteador não são a mesma coisa.** O nginx é os dois; o Traefik
é um. Isso decide mais casos do que qualquer benchmark.

## Referências

- [Documentação do Traefik](https://doc.traefik.io/traefik/) — provedores, roteadores e a configuração por rótulo
- [nginx: reverse proxy](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/) — o guia oficial de `proxy_pass`
- [nginx: controlando o processo](https://nginx.org/en/docs/control.html) — o que `-s reload` faz por dentro
- [Traefik: Docker provider](https://doc.traefik.io/traefik/providers/docker/) — os rótulos usados aqui
- [nip.io](https://nip.io/) — os nomes de teste usados nos exemplos
