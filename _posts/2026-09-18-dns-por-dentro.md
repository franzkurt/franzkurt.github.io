---
title: "DNS por dentro: 12 bytes de cabeçalho e uma árvore de delegação"
date: 2026-09-18 10:00:00 -0300
tags: [dns, redes, protocolos, privacidade]
description: "Toda conexão começa com uma pergunta que quase ninguém vê. Este texto abre o pacote, segue a resolução da raiz até a resposta, e mostra como usar isso a seu favor com o AdGuard."
---

Antes de qualquer página abrir, o seu computador faz uma pergunta e espera. A
pergunta é *"qual o endereço de `franzkurt.github.io`?"*, e a resposta chega em
poucos milissegundos num pacote pequeno que quase ninguém olha.

Este texto abre esse pacote. Tudo que está aqui foi medido nesta máquina com o
`dig`, e as afirmações sobre o formato foram conferidas contra a
[RFC 1035](https://www.rfc-editor.org/rfc/rfc1035.txt), de 1987 — que continua
sendo a especificação em vigor.

No fim, o uso prático: o AdGuard, que transforma esse mesmo mecanismo num
bloqueador de rastreio que funciona no aparelho inteiro.

<!--more-->

## O nome é uma árvore, e se lê da direita para a esquerda

`franzkurt.github.io.` — repare no ponto final, que quase ninguém digita. Ele é a
**raiz**, e a leitura correta é de trás para frente:

```
.                    a raiz
└── io               domínio de topo
    └── github       delegado para o GitHub
        └── franzkurt   delegado dentro do github.io
```

Cada nível **delega** o seguinte. A raiz não sabe onde fica o meu blog; ela sabe
quem cuida do `.io`. E é isso que torna o sistema capaz de crescer sem um
cadastro central de todos os nomes do mundo.

## A resolução, passo a passo

Dá para assistir à delegação acontecendo. `dig +trace` faz o que um resolvedor
faria, perguntando a cada nível:

```
$ dig +trace franzkurt.github.io A
```

```
.                  65731  IN  NS  a.root-servers.net.      ← 13 servidores-raiz
io.               172800  IN  NS  a0.nic.io.               ← 4 servidores do .io
github.io.          3600  IN  NS  dns1.p05.nsone.net.      ← 5 do github.io
franzkurt.github.io. 3600 IN  A   185.199.108.153          ← a resposta
```

Três perguntas antes da resposta, cada uma dizendo "não sei, pergunte àquele
ali". Isso se chama resolução **iterativa**, e é o que o seu resolvedor faz por
baixo.

O que o seu computador faz é diferente: ele manda **uma** pergunta e recebe a
resposta pronta. Isso é resolução **recursiva**, e a diferença está num único bit
do cabeçalho, o `RD` — *recursion desired*.

## O pacote: 12 bytes de cabeçalho, quatro seções

O cabeçalho da RFC 1035 tem seis campos de 16 bits — **12 bytes**, e nenhum
sobrou em quarenta anos:

```
+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
|                      ID                       |
+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
|QR|   Opcode  |AA|TC|RD|RA|   Z    |   RCODE   |
+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
|                    QDCOUNT                    |
|                    ANCOUNT                    |
|                    NSCOUNT                    |
|                    ARCOUNT                    |
+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
```

O `ID` de 16 bits é o que casa pergunta e resposta — e, como o transporte padrão
é UDP, **é praticamente só ele** que impede alguém de responder no lugar do
servidor. Guarde isso para o fim do texto.

Os quatro contadores dizem quantos registros vêm em cada seção: pergunta,
resposta, autoridade e adicional. E os bits do meio são os flags que o `dig`
mostra:

```
;; flags: qr rd ra;  QUERY: 1, ANSWER: 4, AUTHORITY: 0, ADDITIONAL: 1
```

| flag | quer dizer |
|---|---|
| `qr` | isto é uma resposta, não uma pergunta |
| `rd` | o cliente pediu recursão |
| `ra` | o servidor aceita fazer recursão |
| `aa` | a resposta vem de quem manda naquele nome |
| `tc` | a resposta **não coube** e foi truncada |

## Tipos de registro

Um nome carrega vários tipos ao mesmo tempo. No `github.com`, medido:

| tipo | quantos | para quê |
|---|---|---|
| `A` | 1 | endereço IPv4 |
| `AAAA` | 0 | endereço IPv6 — o GitHub não tem no domínio principal |
| `MX` | 1 | para onde vai o e-mail |
| `NS` | 8 | quem é autoritativo pelo nome |
| `TXT` | 24 | texto livre: verificações de domínio, SPF, DKIM |
| `SOA` | 1 | os parâmetros da zona |

Os 24 registros `TXT` não são exagero: virou o lugar onde todo serviço pede para
você provar que o domínio é seu.

## O TTL, e por que a internet aguenta

Toda resposta vem com um prazo de validade. Perguntando quatro vezes ao
resolvedor local, de cinco em cinco segundos:

| momento | TTL | tempo de resposta |
|---|---|---|
| t=0 s | 44 | 0 ms |
| t=5 s | 39 | 0 ms |
| t=10 s | 34 | 0 ms |
| t=15 s | 29 | 0 ms |

O TTL cai exatamente na razão do relógio, e a resposta sai em **0 ms** — nada
saiu da máquina. É esse cache, repetido em cada camada, que impede os treze
servidores-raiz de receberem todas as perguntas do planeta.

Um detalhe que atrapalha quem tenta medir: no `1.1.1.1` o TTL sobe e desce entre
consultas. Não é defeito — é **anycast**. O mesmo endereço IP existe em dezenas
de lugares do mundo, e cada instância tem o cache dela.

## Três maneiras de não ter resposta

Aqui mora uma confusão comum, e a diferença é visível:

**`NXDOMAIN` — o nome não existe.** A seção de resposta vem vazia, e a de
autoridade traz o `SOA` de quem podia ter dito o contrário.

```
naoexiste-xyz-987.python.org  →  NXDOMAIN, respostas=0, autoridade=1
```

**`NOERROR` com zero respostas — o nome existe, o tipo não.** É o chamado
*NODATA*. `franzkurt.github.io` não tem servidor de e-mail:

```
franzkurt.github.io MX  →  NOERROR, ANSWER: 0, AUTHORITY: 1
```

**E o curinga, que engana os dois.** O `github.io` responde a *qualquer* nome:

```
qualquer-coisa.github.io     →  185.199.108.153
naoexiste-xyz-987.github.io  →  185.199.111.153
```

Isso me pegou enquanto escrevia: fui usar um subdomínio inventado como exemplo de
`NXDOMAIN` e recebi quatro respostas válidas.

## Os 512 bytes de 1987

A RFC 1035 lista os limites do protocolo, na seção 2.3.4:

```
labels          63 octets or less
names           255 octets or less
TTL             positive values of a signed 32 bit number.
UDP messages    512 octets or less
```

Quinhentos e doze bytes. Em 1987 era generoso; hoje não é. Medindo:

| consulta | tamanho |
|---|---|
| `root-servers.net NS` | 253 bytes |
| `google.com TXT` | 1.187 bytes |
| `microsoft.com TXT` | 4.575 bytes |

O que acontece quando não cabe? O servidor devolve a resposta **vazia** com o
flag `tc` ligado:

```
;; flags: qr tc rd ra;  ANSWER: 0
;; MSG SIZE  rcvd: 31
```

Trinta e um bytes dizendo "não coube". O cliente então repete a pergunta por
**TCP**, onde não há esse limite:

```
;; Truncated, retrying in TCP mode.
;; SERVER: 1.1.1.1#53(1.1.1.1) (TCP)
;; MSG SIZE  rcvd: 4564
```

A saída moderna é o **EDNS** ([RFC 6891](https://www.rfc-editor.org/rfc/rfc6891.txt)),
em que o cliente anuncia quanto aguenta receber. Mas o servidor decide, e aqui a
medição desmentiu a minha expectativa: pedi 4.096 bytes e a Cloudflare respondeu
`udp: 1232`, caindo para TCP mesmo assim. Esse 1232 é deliberado — acima disso o
pacote costuma ser fragmentado no caminho, e fragmento de UDP se perde.

## O problema que nada disso resolve

Releia o cabeçalho. Não há assinatura, não há cifra, e o que casa pergunta com
resposta é um número de 16 bits sobre UDP.

Na prática isso significa duas coisas. **Quem está no caminho vê tudo** — o
provedor, a rede do café, quem controla o roteador. E **a sua lista de sites
visitados vaza pelo DNS mesmo com HTTPS em tudo**: o conteúdo vai cifrado, o
*nome* que você pediu, não.

Daí vieram o DNS sobre HTTPS (DoH) e sobre TLS (DoT): a mesma pergunta, dentro de
um túnel cifrado.

## Usando o DNS a seu favor: AdGuard

E daí vem também o truque que eu recomendo. Se toda conexão começa perguntando um
nome, dá para **não responder** os nomes de rastreio. É o que o
[AdGuard DNS](https://adguard-dns.io/) faz. Comparando o mesmo domínio em dois
resolvedores:

| domínio | Cloudflare | AdGuard |
|---|---|---|
| `doubleclick.net` | 142.250.219.206 | **0.0.0.0** |
| `googleadservices.com` | 172.217.162.2 | **0.0.0.0** |
| `google-analytics.com` | 172.217.30.4 | **0.0.0.0** |
| `python.org` | 151.101.0.223 | 151.101.128.223 |

`0.0.0.0` não é um lugar. O navegador tenta conectar, não vai a lugar nenhum, e o
rastreador não carrega — sem extensão, sem plugin, e valendo para **todo
aplicativo do aparelho**, não só o navegador.

São três servidores, e a escolha importa:

| perfil | IPv4 | o que faz |
|---|---|---|
| **Padrão** | `94.140.14.14` e `94.140.15.15` | bloqueia anúncio e rastreio |
| **Família** | `94.140.14.15` e `94.140.15.16` | o acima, mais conteúdo adulto |
| **Sem filtro** | `94.140.14.140` e `94.140.14.141` | não bloqueia nada |

Testei os três no mesmo domínio adulto: o padrão devolveu o IP real, o família
devolveu `94.140.14.35` — uma página de bloqueio, não um endereço morto — e o
sem filtro devolveu o IP real. A diferença entre `0.0.0.0` e uma página existe
para o usuário entender que foi bloqueado, em vez de achar que a internet caiu.

### Como configurar

**No roteador** é onde rende mais: vale para todos os aparelhos da casa de uma
vez, inclusive TV e celular de visita. Procure por *DNS* nas configurações de
WAN ou DHCP e ponha os dois endereços do perfil escolhido.

**No Windows:** Configurações → Rede e Internet → escolha a conexão → Atribuição
de servidor DNS → Editar → Manual → ligue IPv4 → preencha preferencial e
alternativo.

**No macOS:** Ajustes do Sistema → Rede → sua conexão → Detalhes → DNS → `+`
para acrescentar cada endereço, e remova os que estavam lá.

**No Linux com systemd-resolved,** que é o caso da maioria das distribuições
atuais:

```bash
sudo mkdir -p /etc/systemd/resolved.conf.d
sudo tee /etc/systemd/resolved.conf.d/adguard.conf <<'EOF'
[Resolve]
DNS=94.140.14.14 94.140.15.15
DNSOverTLS=yes
EOF
sudo systemctl restart systemd-resolved
```

**No Android** (9 ou mais novo): Configurações → Rede → DNS privado →
`dns.adguard-dns.com`. Isso usa DoT e vale inclusive no 4G, fora do Wi-Fi.

**No iOS** é preciso instalar um perfil, disponível no site do AdGuard.

Para conferir se pegou, peça um domínio de rastreio e veja o que volta:

```bash
dig doubleclick.net A +short
# 0.0.0.0  → está valendo
```

Uma ressalva honesta: você troca confiar no seu provedor por confiar no AdGuard.
Não é privacidade absoluta — é escolher em quem confiar, e o AdGuard tem política
de não registrar consultas, o que o provedor normalmente não tem.

## O que fica

**A delegação é o que faz o sistema escalar.** Ninguém tem a lista de todos os
nomes; cada nível sabe apenas quem pergunta em seguida.

**O cache é o que faz ele aguentar.** TTL de poucos minutos, repetido em cada
camada, transforma bilhões de perguntas em um punhado que chega à raiz.

**Os limites de 1987 continuam moldando o protocolo.** Os 512 bytes explicam o
flag `tc`, a queda para TCP, o EDNS, e o 1232 que a Cloudflare anuncia.

**E o DNS é o único ponto por onde passa tudo.** É o que o torna o lugar certo
para bloquear rastreio — e também o lugar por onde a sua navegação vaza.

## Referências

- [RFC 1035 — Domain Names: Implementation and Specification](https://www.rfc-editor.org/rfc/rfc1035.txt) — o formato do pacote, os limites, o cabeçalho
- [RFC 1034 — Domain Names: Concepts and Facilities](https://www.rfc-editor.org/rfc/rfc1034.txt) — a árvore e a delegação
- [RFC 6891 — Extension Mechanisms for DNS (EDNS(0))](https://www.rfc-editor.org/rfc/rfc6891.txt) — como sair dos 512 bytes
- [RFC 8484 — DNS Queries over HTTPS](https://www.rfc-editor.org/rfc/rfc8484.txt) — o DoH
- [AdGuard DNS](https://adguard-dns.io/en/public-dns.html) — os endereços dos três perfis
- [Root Servers](https://root-servers.org/) — quem opera os treze da raiz
