---
title: "Um navegador por dentro, parte 7: conferir tudo com tcpdump e scapy"
date: 2023-10-14 10:00:00 -0300
tags: [redes, tcpdump, scapy, python, pacotes, engenharia]
description: "As sete partes anteriores afirmaram dezenas de coisas sobre pacotes que você não viu. Esta mostra como abrir os bytes e conferir cada uma — e o que o próprio laboratório distorce."
---

*Série **Um navegador por dentro**, o percurso completo:
**0.** [as camadas](/2023/08/navegador-parte-0-as-camadas/) ·
**1.** [do nome ao endereço](/2023/09/navegador-parte-1-do-nome-ao-endereco/) ·
**2.** [a conexão e a sessão](/2023/09/navegador-parte-2-a-conexao/) ·
**3.** [o HTTP que anda por cima](/2023/09/navegador-parte-3-http/) ·
**4.** [o HTML vira árvore](/2023/09/navegador-parte-4-o-html-vira-arvore/) ·
**5.** [estilo, layout e pintura](/2023/09/navegador-parte-5-estilo-e-layout/) ·
**6.** [o JavaScript e a volta do laço](/2023/10/navegador-parte-6-javascript/) ·
**7.** tcpdump e scapy (esta)*

As sete partes anteriores afirmaram bastante coisa sobre bytes que você não viu:
que o handshake do TCP custa uma ida e volta, que o cabeçalho IPv6 tem 40 bytes,
que o cabeçalho do DNS tem 12, que o cliente pergunta por IPv4 e IPv6 ao mesmo
tempo. Tudo isso é verificável em alguns minutos.

Esta parte é o ferramental. Duas ferramentas, uma para capturar e outra para
dissecar, e o cuidado que faz a diferença entre conferir e se enganar.

<!--more-->

## As duas ferramentas, e a diferença entre elas

**`tcpdump`** captura. Ele pede à placa de rede uma cópia de cada quadro que
passa, aplica um filtro e grava ou imprime. O filtro é compilado para **BPF** —
um pequeno programa que roda dentro do núcleo do sistema, para que pacotes
descartados nem cheguem ao espaço de usuário. É isso que permite capturar em
rede movimentada sem perder pacote.

**`scapy`** disseca e constrói. É uma biblioteca Python em que cada camada é uma
classe e o operador `/` empilha uma sobre a outra: `IP()/UDP()/DNS()` é
literalmente um pacote. Ela lê o arquivo que o `tcpdump` gravou, e também monta
pacotes do zero — o que a torna a ferramenta certa para *validar*, e não só
olhar. (Já apareceu por aqui antes, em
[outro contexto](/2021/05/como-eu-criei-um-script-para-quebra-de-senhas-de-rede-wi-fi-com-scapy/).)

Capturar pacote exige a capacidade `CAP_NET_RAW`, que normalmente quer dizer
root. Dá para evitar isso: um container sem privilégio recebe `NET_RAW` dentro do
próprio namespace, e é onde tudo abaixo rodou.

```
FROM debian:stable-slim
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends \
      tcpdump python3 python3-scapy curl ca-certificates iproute2 dnsutils
```

```
$ podman run --rm --cap-add=NET_RAW lab-pacotes
```

> **Capture só o seu tráfego.** Numa rede compartilhada, os pacotes que passam
> pela sua placa incluem os dos outros. Um filtro restrito não é só desempenho —
> é o que mantém a captura dentro do que é seu. Todos os exemplos aqui filtram
> por porta e foram gerados por um comando meu, na mesma máquina.

## Capturando uma requisição inteira

Um `curl` simples, com captura em volta:

```
$ tcpdump -i eth0 -n -c 40 -w captura.pcap 'port 53 or port 80'
$ curl -s -o /dev/null --http1.1 http://example.com/
```

- `-i` a interface, `-n` não resolver nomes (senão o `tcpdump` gera DNS e polui a
  própria captura), `-c` para depois de N pacotes, `-w` grava em arquivo.
- entre aspas vai o filtro BPF.

Dezoito pacotes. Lidos de volta, com os endereços trocados por exemplos:

```
IP  cliente.54899 > resolvedor.53: 55873+ A? example.com. (29)
IP  cliente.54899 > resolvedor.53: 30281+ AAAA? example.com. (29)
IP  resolvedor.53 > cliente.54899: 55873 2/0/0 A 192.0.2.10, 192.0.2.11 (61)
IP  resolvedor.53 > cliente.54899: 30281 2/0/0 AAAA 2001:db8::servidor (85)
IP6 cliente.35202 > servidor.80: Flags [S],  seq 3372580479, length 0
IP6 servidor.80 > cliente.35202: Flags [S.], seq 1460974547, ack 3372580480
IP6 cliente.35202 > servidor.80: Flags [.],  ack 1, length 0
IP6 cliente.35202 > servidor.80: Flags [P.], seq 1:76,  length 75: HTTP: GET / HTTP/1.1
IP6 servidor.80 > cliente.35202: Flags [.],  ack 76,    length 0
IP6 servidor.80 > cliente.35202: Flags [P.], seq 1:873, length 872: HTTP: HTTP/1.1 200 OK
IP6 cliente.35202 > servidor.80: Flags [F.], seq 76, ack 873
IP6 servidor.80 > cliente.35202: Flags [FP.], seq 873, ack 77
IP6 servidor.80 > cliente.35202: Flags [R],  seq 1460975421
```

A série inteira está nessas treze linhas. Vale decifrar a notação de flags, que é
compacta a ponto de parecer críptica:

| flag | nome | o que é |
|---|---|---|
| `S` | SYN | abre a conexão |
| `S.` | SYN+ACK | o ponto **é** o ACK |
| `.` | ACK puro | só confirma, sem dados |
| `P.` | PSH+ACK | carrega dados e confirma |
| `F.` | FIN+ACK | fecha o seu lado |
| `R` | RST | derruba a conexão na hora |

As três primeiras linhas com IPv6 são exatamente o handshake de três vias da
[parte 2](/2023/09/navegador-parte-2-a-conexao/). As duas perguntas de DNS, uma
`A` e uma `AAAA`, disparadas no mesmo milissegundo, são o Happy Eyeballs da
[parte 1](/2023/09/navegador-parte-1-do-nome-ao-endereco/) — ninguém precisa
acreditar em mim, está ali.

## scapy: conferindo os tamanhos que a parte 0 afirmou

O `tcpdump` mostra. O scapy deixa você fazer perguntas. A primeira: os cabeçalhos
têm mesmo os tamanhos da tabela da
[parte 0](/2023/08/navegador-parte-0-as-camadas/)?

```python
from scapy.all import rdpcap, Ether, IP, IPv6, TCP, UDP

pk = rdpcap("captura.pcap")
for p in pk:
    for camada in (Ether, IP, IPv6, TCP, UDP):
        if camada in p:
            n = len(bytes(p[camada])) - len(bytes(p[camada].payload))
            print(camada.__name__, n)
```

```
  Ether   14 bytes   ✓
  IP      20 bytes   ✓
  UDP      8 bytes   ✓
  IPv6    40 bytes   ✓
  TCP     40 bytes   ✗ (esperado 20)
```

Quatro conferem e um não. E o que não confere é a parte mais instrutiva.

## O TCP de 40 bytes

A parte 0 diz "TCP (sem opções) 20", e a ressalva entre parênteses é onde mora o
assunto. O cabeçalho do TCP tem um campo `dataofs` que diz, em palavras de 4
bytes, onde os dados começam. Separando:

```
flags   dataofs  cabeçalho   fixo  opções  quais
S            10        40B    20B     20B  MSS, SAckOK, Timestamp, NOP, WScale
SA            7        28B    20B      8B  MSS, NOP, WScale
A             5        20B    20B      0B  —
PA            5        20B    20B      0B  —
FA            5        20B    20B      0B  —
```

O primeiro pacote de toda conexão carrega 20 bytes de opções, e é onde as duas
pontas combinam o tamanho máximo de segmento, o escalonamento de janela, os
carimbos de tempo e se sabem confirmar blocos fora de ordem. Depois disso, zero
opções pelo resto da conexão.

Ou seja: o 20 da tabela está certo para o regime permanente, e errado para os
dois primeiros pacotes. Sem o scapy eu não teria notado.

## A aritmética do handshake

A parte 2 afirmou que o `ack` confirma o número de sequência do outro lado mais
um. Dá para testar, em vez de acreditar:

```python
syn     = next(p for p in pk if TCP in p and p[TCP].flags == "S")
syn_ack = next(p for p in pk if TCP in p and p[TCP].flags == "SA")
ack     = next(p for p in pk if TCP in p and p[TCP].flags == "A")

assert syn_ack[TCP].ack == syn[TCP].seq + 1
assert ack[TCP].ack     == syn_ack[TCP].seq + 1
```

```
SYN      seq=1443121496
SYN-ACK  seq=3263762286  ack=1443121497   → ack == seq+1 ?  True
ACK                      ack=3263762287   → ack == seq+1 ?  True
```

Dois números sorteados, sem relação entre si, e cada lado confirmando o do outro.
É a definição de sessão da parte 2, verificada.

E a quádrupla que *é* a conexão:

```
origem  2001:db8::cliente : 43686
destino 2001:db8::servidor : 80
pacotes desta conexão: 12 de 18
```

Doze dos dezoito pacotes casam com aquela combinação de quatro campos. Os outros
seis são o DNS, que é outra conversa, com outra quádrupla.

## Checksums: validar de verdade

Aqui o scapy faz o que nenhuma leitura faz. Apagar o checksum de um pacote e
deixar a biblioteca recalculá-lo diz se os bytes chegaram íntegros:

```python
copia = p.copy()
del copia[IP].chksum              # apagar força o recálculo
recalculado = IP(raw(copia[IP])).chksum
```

```
  conferem: 21   divergem: 0   zerados (descarregados na placa): 3
```

Os três zerados são a pegadinha clássica. Quando o sistema manda um pacote, ele
frequentemente **não** calcula o checksum: entrega com zero e deixa a placa de
rede preencher, porque ela faz isso em hardware. Uma captura local pega o pacote
*antes* disso, e mostra zeros.

Quem não sabe disso vê "checksum inválido" numa captura de saída e sai caçando um
problema de rede que não existe. O `tcpdump` até avisa, com `-v`, mas o aviso
some no meio da saída.

## Montando um pacote e comparando com a especificação

O caminho inverso fecha a validação: em vez de dissecar o que veio, construir o
que deveria vir.

```python
from scapy.all import IP, UDP, DNS, DNSQR, raw

q = IP(dst="192.0.2.1") / UDP(sport=51000, dport=53) / \
    DNS(rd=1, qd=DNSQR(qname="example.com", qtype="A"))
```

```
  total: 57 bytes
    IP    20
    UDP    8
    DNS   29   (12 de cabeçalho + 17 da pergunta)
```

Doze bytes de cabeçalho DNS, como a RFC 1035 manda. Em hexadecimal, campo a
campo:

```
  ID       0000  = 0
  flags    0100  = 256
  QDCOUNT  0001  = 1        ← uma pergunta
  ANCOUNT  0000  = 0        ← nenhuma resposta, claro
  NSCOUNT  0000  = 0
  ARCOUNT  0000  = 0
```

O `flags` valendo `0x0100` é o bit **RD**, *recursion desired* — o cliente pedindo
ao resolvedor que faça a busca inteira por ele. Trocando `rd=1` por `rd=0`, o
campo vira `0x0000`. É um bit, e é a diferença entre resolução recursiva e
iterativa.

E o nome, que no fio não tem pontos:

```
'example.com' vira  07 6578616d706c65 03 636f6d 00
                    ↑  e x a m p l e  ↑  c o m  ↑ fim
                    7 letras          3 letras
```

Cada rótulo é precedido do próprio tamanho, e um zero encerra. Por isso um rótulo
não pode passar de 63 caracteres: o campo de tamanho tem 6 bits úteis.

## O que o laboratório distorce

Uma coisa na captura não bate com o mundo real, e se eu não olhasse teria
publicado número errado:

```
MSS anunciado pelo cliente: 65460
```

Sessenta e cinco mil. A parte 0 mediu 1500 de MTU e deduziu MSS de 1460. O
container explica:

```
dentro do container:  eth0  mtu 65520
no hospedeiro:        eth0  mtu 1500
```

A rede virtual do container não tem enlace físico, então usa uma MTU enorme. O
MSS anunciado na captura é propriedade do laboratório, não do caminho até o
servidor — e o servidor, que está na internet de verdade, respondeu com 4096.

É a classe de erro que mais me pega: **o instrumento alterou o que estava sendo
medido.** Tudo que depende de tamanho de quadro precisa ser verificado no
hospedeiro; o que depende de estrutura — cabeçalhos, flags, sequência, checksum —
vale igual nos dois.

## O que fica

**`tcpdump` captura, scapy pergunta.** Um imprime o que passou; o outro deixa
você escrever `assert` sobre os bytes.

**Filtro BPF é contenção, não otimização.** Numa rede compartilhada, ele é o que
separa o seu tráfego do dos outros.

**O cabeçalho TCP tem 40 bytes no primeiro pacote e 20 no resto.** A tabela da
parte 0 estava certa com a ressalva que quase ninguém lê.

**Checksum zerado não é corrupção, é a placa fazendo o trabalho.**

**E confira o que o laboratório muda.** A MTU de 65520 do container produziria um
MSS inventado se eu tivesse publicado sem olhar.

Com isso a série fecha: da camada de enlace ao laço de eventos, e agora com o
instrumento para não precisar acreditar em nada disso.

## Referências

- [manual do tcpdump](https://www.tcpdump.org/manpages/tcpdump.1.html) — as flags e a sintaxe de saída
- [pcap-filter(7)](https://www.tcpdump.org/manpages/pcap-filter.7.html) — a linguagem de filtro que vira BPF
- [documentação do scapy](https://scapy.readthedocs.io/en/latest/usage.html) — dissecar, montar e enviar
- [RFC 9293 — TCP](https://www.rfc-editor.org/rfc/rfc9293.html) — as flags, o `dataofs` e as opções do handshake
- [RFC 1035 — Domain Names](https://www.rfc-editor.org/rfc/rfc1035.txt) — os 12 bytes de cabeçalho e o formato dos rótulos
- [RFC 1071 — Computing the Internet Checksum](https://www.rfc-editor.org/rfc/rfc1071.txt) — o algoritmo que o scapy recalcula
