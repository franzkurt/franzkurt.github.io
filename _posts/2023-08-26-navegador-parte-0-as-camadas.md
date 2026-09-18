---
title: "Um navegador por dentro, parte 0: as camadas, e o que já estava pronto"
date: 2023-08-26 10:00:00 -0300
tags: [navegador, redes, osi, tcp-ip, dhcp, engenharia]
description: "Antes do navegador pedir qualquer coisa, a máquina já tinha endereço, rota e o MAC do roteador. Esta parte abre as camadas de baixo — e mostra quem entregou cada uma dessas três coisas."
---

*Série **Um navegador por dentro**, o percurso completo:
**0.** as camadas (esta) ·
**1.** [do nome ao endereço](/2023/09/navegador-parte-1-do-nome-ao-endereco/) ·
**2.** [a conexão e a sessão](/2023/09/navegador-parte-2-a-conexao/) ·
**3.** [o HTTP que anda por cima](/2023/09/navegador-parte-3-http/) ·
**4.** [o HTML vira árvore](/2023/09/navegador-parte-4-o-html-vira-arvore/) ·
**5.** [estilo, layout e pintura](/2023/09/navegador-parte-5-estilo-e-layout/) ·
**6.** [o JavaScript e a volta do laço](/2023/10/navegador-parte-6-javascript/) ·
**7.** [tcpdump e scapy](/2023/10/navegador-parte-7-tcpdump-e-scapy/)*

A [parte 1](/2023/09/navegador-parte-1-do-nome-ao-endereco/) começa com o
navegador precisando de um endereço IP. Repare no que ela já toma como dado: que
a sua máquina **tem** um endereço, que **sabe** para onde mandar um pacote
destinado ao mundo, e que existe um caminho físico até lá.

Nenhuma das três veio de fábrica. Todas foram negociadas, quase sempre antes de
você abrir o navegador. Esta é a parte 0.

<!--more-->

## Duas pilhas de camadas, e só uma existe

O modelo OSI tem sete camadas, e é o que se ensina. O modelo TCP/IP, da
[RFC 1122](https://www.rfc-editor.org/rfc/rfc1122.txt), tem quatro, e é o que
está implementado no sistema que você está usando agora.

```
OSI (7)                TCP/IP (4)        o que de fato existe aqui
─────────────────────  ────────────────  ──────────────────────────────
7 aplicação        ┐
6 apresentação     ├─  aplicação         HTTP, DNS, DHCP
5 sessão           ┘
4 transporte          transporte         TCP, UDP
3 rede                internet           IP, ICMP, ARP
2 enlace           ┐
1 física           ┴─  enlace            Ethernet, Wi-Fi
```

Vale dizer sem rodeio: as camadas 5 e 6 do OSI não correspondem a nada num
sistema real. O TLS é frequentemente chamado de "camada 6" e não é — ele roda
sobre TCP e entrega para o HTTP, o que faz dele aplicação em cima de transporte,
sem camada nova. O OSI serve para conversar; o TCP/IP, para explicar o código.

## Encapsulamento: cada camada embrulha a de cima

Descer uma camada é acrescentar um cabeçalho. O seu `GET /` sai assim:

```
┌────────────────────────────────────────────────────────┐
│ Ethernet  │ IPv6  │ TCP  │ TLS  │ HTTP: GET / ...      │
│  14 B     │ 40 B  │ 20 B │      │                      │
└────────────────────────────────────────────────────────┘
   ↑ MAC destino,   ↑ IP origem  ↑ portas,   ↑ o que a parte 3 descreve
     MAC origem       e destino    sequência
```

Esses tamanhos não são decorativos, e dá para confirmá-los sem abrir o
Wireshark. A ferramenta é o `ping`, que fala **ICMP** — o protocolo de controle
da camada de rede, usado para diagnóstico e para avisar erros, e não para
transportar dados de aplicação. O `ping` permite fixar o tamanho da carga e
proibir fragmentação; o ponto exato em que ele para de passar denuncia a conta:

| família | carga | quadro total | passa? |
|---|---:|---:|---|
| IPv4 | 1472 B | 1472 + 8 + 20 = **1500** | sim |
| IPv4 | 1473 B | 1501 | **não** |
| IPv6 | 1452 B | 1452 + 8 + **40** = **1500** | sim |
| IPv6 | 1453 B | 1501 | **não** |

Exatamente 20 bytes de diferença entre as famílias — que é exatamente a diferença
entre o cabeçalho IPv4 de 20 bytes e o IPv6 de 40. O limite de 1500 é a **MTU**
da Ethernet, e é de onde sai o MSS que o TCP anuncia: 1460 em IPv4, 1440 em IPv6.

É por isso que uma VPN, que acrescenta mais um cabeçalho, reduz a MTU — e por
que uma MTU mal configurada quebra as páginas grandes e nunca o `ping`.

> Tentei medir também a proporção entre bytes úteis e bytes no fio, lendo os
> contadores da interface antes e depois de um pedido. Não deu: a mesma página
> produziu de 24 kB a 42 kB de variação, porque o contador soma **todo** o
> tráfego da máquina, e a linha de base numa janela de 1,2 s foi de 18 kB a
> 365 kB. O número seria inventado, então fica só a aritmética acima, que o teste
> de MTU confirma.

## DHCP: quem entrega o endereço, e muito mais que ele

Uma máquina que acaba de entrar na rede não tem endereço IP e não sabe a quem
perguntar. A saída é gritar: o DHCP começa com um pacote enviado ao endereço de
**broadcast**, a partir do endereço `0.0.0.0`. Quatro passos, que se lembram pela
sigla **DORA**:

```
DISCOVER  cliente → broadcast "tem algum servidor DHCP aí?"
OFFER     servidor → cliente  "tenho, e te ofereço este endereço"
REQUEST   cliente → broadcast "aceito o daquele servidor ali"
ACK       servidor → cliente  "fechado, é seu por N segundos"
```

O `REQUEST` vai em broadcast de propósito: o servidor que ofereceu e não foi
escolhido precisa ouvir isso para liberar o endereço que reservou.

E o DHCP não entrega só um endereço. Nesta máquina, o cliente **pediu** 22 opções
diferentes — máscara de sub-rede, roteador, servidores de DNS, domínio de busca,
servidores de NTP, MTU da interface, rotas estáticas, caminho de raiz, WPAD — e o
servidor respondeu cinco:

```
ip_address            = (o endereço)
subnet_mask           = (a máscara)
routers               = (o roteador padrão)
domain_name_servers   = (o resolvedor)
dhcp_lease_time       = 86400
```

Essas cinco linhas são as três coisas que a parte 1 tomava como dadas. O
`routers` vira a rota padrão; o `domain_name_servers` vira o resolvedor que
responde em 0 ms na cascata de caches; e o `ip_address` é a origem de todo pacote
que sair daqui.

Dá até para ver a origem gravada na tabela de rotas:

```
$ ip route
default via 192.168.0.1 dev wlan0 proto dhcp src 192.168.0.42 metric 600
                                  ^^^^^^^^^^
```

O `proto dhcp` é o sistema registrando que aquela rota não foi configurada por
ninguém — foi negociada.

## A concessão não é permanente

`dhcp_lease_time = 86400` são 24 horas, e a renovação não espera o fim:

```
concessão de 86400 s = 24 h
T1 (50%)     12 h depois  ← renova com o servidor que deu
T2 (87,5%)   21 h depois  ← rebind: pergunta a QUALQUER servidor
expira       24 h depois  ← solta o endereço e volta ao DISCOVER
```

Em T1 o cliente fala direto com quem concedeu; se ele não responder — caiu, foi
trocado —, em T2 volta a gritar para a rede inteira. Dois níveis de desistência,
e é por isso que trocar o roteador raramente derruba a rede por muito tempo.

## O IPv6 aqui não usa DHCP

Detalhe que contraria a expectativa de muita gente: nesta máquina o endereço IPv6
**não** veio de DHCP. Veio de **SLAAC** — o roteador anuncia periodicamente o
prefixo da rede, e a máquina monta o próprio endereço a partir dele. O gateway
IPv6 nem sequer é um endereço global:

```
IP6.GATEWAY: fe80::...
```

É um endereço *link-local*, válido só naquele segmento, e toda interface IPv6
tem um — o roteamento funciona antes de existir qualquer endereço global.

E há dois endereços globais, não um:

```
inet6 2001:db8::5c3f:9e01  scope global temporary dynamic      preferred_lft  51525s
inet6 2001:db8::a1b2:c3d4  scope global dynamic mngtmpaddr     preferred_lft 372428s
```

O segundo é estável; o primeiro é **temporário**, trocado a cada poucas horas, e
é o que a máquina usa para sair. O motivo é privacidade: a forma original de
montar o endereço IPv6 derivava os 64 bits finais do MAC da placa, o que tornava
a máquina rastreável por qualquer site, em qualquer rede, para sempre. A
[RFC 8981](https://www.rfc-editor.org/rfc/rfc8981.html) resolveu isso com
endereços aleatórios que expiram.

Confirmei qual dos dois sai para a rede perguntando a um serviço externo qual
endereço ele enxerga: é o temporário.

## ARP: o IP não basta para entregar nada

Aqui está o passo que quase todo diagrama omite. Você tem o IP de destino. A
placa de rede não sabe o que fazer com ele — Ethernet e Wi-Fi endereçam por
**MAC**, não por IP.

Então, antes do primeiro pacote, a máquina precisa do MAC do **próximo salto** —
que não é o servidor, é o roteador. E descobre isso gritando de novo:

```
ARP  "quem tem 192.168.0.1? responda para 192.168.0.42"   → broadcast
ARP  "sou eu, e meu MAC é 00:11:22:33:44:55"              → só para quem perguntou
```

O resultado fica numa tabela com estado próprio:

```
$ ip neigh
192.168.0.1 dev wlan0 lladdr 00:11:22:33:44:55 REACHABLE
fe80::1     dev wlan0 lladdr 00:11:22:33:44:55 router REACHABLE
```

`REACHABLE` é um dos estados de uma máquina que também tem `STALE`, `DELAY` e
`PROBE`: depois de um tempo sem uso a entrada envelhece, e antes de descartá-la o
sistema reconfirma. No IPv6 o mecanismo tem outro nome — **NDP**, descoberta de
vizinhos — e roda sobre ICMPv6 em vez de ser um protocolo separado, o que é uma
arrumação evidente do que o ARP tinha de estranho.

Repare que as duas linhas apontam para o mesmo MAC. É a mesma caixa, atendendo às
duas famílias de endereço.

O ARP não tem autenticação nenhuma. Qualquer máquina da rede pode responder
"o roteador sou eu" e passar a ver o tráfego alheio — é o ataque clássico de rede
local, e a razão prática de o HTTPS da
[parte 2](/2023/09/navegador-parte-2-a-conexao/) não ser opcional num café.

## NAT: o seu endereço não é o seu endereço

O endereço que o DHCP entregou é privado, da faixa reservada pela
[RFC 1918](https://www.rfc-editor.org/rfc/rfc1918.txt). Ele não existe na
internet. Comparando o que a máquina tem com o que um servidor externo enxerga:

| | endereço local | o que o servidor vê | iguais? |
|---|---|---|---|
| IPv4 | privado (RFC 1918) | outro, público | **não** — há NAT |
| IPv6 | o temporário global | o mesmo | **sim** — sem NAT |

No IPv4 o roteador reescreve o endereço de origem de cada pacote que sai e guarda
uma tabela para saber a quem devolver a resposta. Isso resolveu a falta de
endereços e criou de brinde uma assimetria — de dentro para fora funciona, de
fora para dentro não —, que virou a base de como quase toda rede doméstica se
defende, sem nunca ter sido projetada para isso.

No IPv6 não há NAT: o endereço da interface é o endereço na internet. Mais
simples, e permite conexões diretas — ao custo de o firewall ter de virar decisão
explícita, em vez de efeito colateral.

## E o caminho, em saltos

Juntando tudo, dá para ver a viagem:

```
$ traceroute franzkurt.github.io
 1  _gateway            4,5 ms     ← o roteador, achado por ARP
 2  (provedor)          5,2 ms
 3  (provedor)          5,1 ms
 4  (provedor)          5,4 ms
 5  (troca de tráfego) 29,9 ms     ← aqui o pacote sai da região
 6+ * * *                          ← filtrado daqui em diante
```

Quatro saltos dentro de cinco milissegundos, e o quinto custando 30. Esse salto
**é** o tempo de ida e volta de 28,7 ms que a
[parte 2](/2023/09/navegador-parte-2-a-conexao/) mede três vezes seguidas. A
distância física é o custo, e ela aparece num salto só.

## O que fica

**O modelo de sete camadas é vocabulário, não arquitetura.** O que está
implementado tem quatro, e não há camada de sessão nem de apresentação em lugar
nenhum.

**Cada camada custa bytes fixos, e a conta fecha.** 20 no IPv4, 40 no IPv6, 20 no
TCP, 14 na Ethernet — confirmados pelo ponto exato em que o `ping` para de
passar.

**O DHCP entrega a rede inteira, não um endereço.** Rota padrão, resolvedor e
máscara vêm no mesmo pacote, e é daí que vem tudo que a parte 1 assumia pronto.

**O IPv6 nem usa DHCP aqui, e troca de endereço para não ser rastreável.**

**E antes de tudo isso, ARP.** Sem o MAC do roteador, o IP de destino não leva o
pacote a lugar nenhum — e é o elo sem autenticação nenhuma da pilha inteira.

Com endereço, rota e vizinho resolvidos, a máquina finalmente pode perguntar onde
fica um nome. É onde começa a
[parte 1](/2023/09/navegador-parte-1-do-nome-ao-endereco/).

## Referências

- [RFC 1122 — Requirements for Internet Hosts](https://www.rfc-editor.org/rfc/rfc1122.txt) — o modelo de quatro camadas, e o que cada uma deve fazer
- [RFC 2131 — Dynamic Host Configuration Protocol](https://www.rfc-editor.org/rfc/rfc2131.txt) — o DORA, os temporizadores T1 e T2
- [RFC 826 — Address Resolution Protocol](https://www.rfc-editor.org/rfc/rfc826.txt) — o ARP, de 1982, em quatro páginas
- [RFC 4861 — Neighbor Discovery for IPv6](https://www.rfc-editor.org/rfc/rfc4861.txt) — o NDP e os anúncios de roteador
- [RFC 8981 — Temporary Address Extensions for SLAAC](https://www.rfc-editor.org/rfc/rfc8981.html) — por que há dois endereços IPv6
- [RFC 1918 — Address Allocation for Private Internets](https://www.rfc-editor.org/rfc/rfc1918.txt) — as faixas privadas por trás do NAT
