---
title: "HTTPS no seu computador: nip.io e a cadeia de confiança"
date: 2026-09-04 10:00:00 -0300
tags: [tls, certificados, dns, nginx, traefik]
description: "Certificado é emitido para nome, não para IP — e no seu laptop não há nome. O nip.io resolve isso com DNS puro, e abrir a cadeia com openssl explica por que o navegador confia em uns e não em outros."
---

*Continuação de [Traefik ou nginx](/2026/09/traefik-ou-nginx/), onde comparei os
dois roteando serviços. Aqui está a outra metade: como esses serviços ganham um
nome e um cadeado.*

Você sobe um serviço no laptop e ele atende em `127.0.0.1:8080`. Para testar com
HTTPS aparece um problema que não é de configuração: **certificado é emitido para
nome, não para endereço IP** — e `127.0.0.1` não é nome.

A saída tradicional é editar o `/etc/hosts`. Funciona, e tem dois defeitos: só
vale na máquina onde você editou, e exige privilégio de administrador. Existe uma
saída melhor, e ela é DNS puro.

<!--more-->

## nip.io: o nome que já contém a resposta

O truque é simples a ponto de parecer que não devia funcionar. Peça qualquer nome
terminado em `.nip.io` que contenha um IP, e receba aquele IP de volta. Medido:

| consulta | resposta |
|---|---|
| `127.0.0.1.nip.io` | 127.0.0.1 |
| `192.168.1.50.nip.io` | 192.168.1.50 |
| `10-0-0-1.nip.io` | 10.0.0.1 |
| `app.127.0.0.1.nip.io` | 127.0.0.1 |
| `qualquer.coisa.8.8.8.8.nip.io` | 8.8.8.8 |

Não há cadastro, não há configuração, não há conta. O servidor autoritativo do
`nip.io` **lê o IP do próprio nome** e devolve. Aceita a forma pontuada e a com
hífen — esta última útil porque cabe num rótulo só, o que importa para
certificado curinga.

E qualquer prefixo funciona, o que dá nomes distintos apontando para a mesma
máquina: `alfa.127.0.0.1.nip.io` e `beta.127.0.0.1.nip.io` são nomes diferentes
para o mesmo destino — exatamente o que um proxy precisa para rotear por
`Host`.

O `sslip.io` faz a mesma coisa e serve de reserva; os dois, aliás, compartilham
operação — um dos servidores autoritativos do `nip.io` atende por
`ns-ovh.sslip.io`.

Uma ressalva: isso depende de um serviço de terceiro estar no ar, e o nome do que
você está testando fica visível para quem opera o DNS. Para desenvolvimento,
tudo bem. Para rede interna de empresa, não.

## A cadeia, aberta com openssl

Agora o cadeado. Quando você abre este blog, o servidor não manda **um**
certificado — manda uma cadeia. Dá para ver:

```bash
openssl s_client -connect franzkurt.github.io:443 \
  -servername franzkurt.github.io
```

```
 0 s:CN=*.github.io
   i:C=US, O=Let's Encrypt, CN=YR1
 1 s:C=US, O=Let's Encrypt, CN=YR1
   i:C=US, O=ISRG, CN=Root YR
 2 s:C=US, O=ISRG, CN=Root YR
   i:C=US, O=Internet Security Research Group, CN=ISRG Root X1
```

Leia `s:` como *sujeito* — de quem é — e `i:` como *emissor* — quem assinou.
Cada linha aponta para a seguinte:

```
*.github.io          assinado por →  Let's Encrypt YR1
Let's Encrypt YR1    assinado por →  ISRG Root YR
ISRG Root YR         assinado por →  ISRG Root X1   ← a âncora
```

**A cadeia termina numa raiz que o seu computador já conhece.** Aqui há 150
certificados no `/etc/ssl/certs/ca-certificates.crt`, e o `ISRG Root X1` é um
deles — válido de 2015 a 2035. Ele não veio pela rede: veio com o sistema.

É essa a única coisa que se confia por decreto. Todo o resto se verifica por
assinatura, de elo em elo, até chegar nela.

Repare também nas datas do primeiro certificado: emitido em 2 de agosto, válido
até 31 de outubro. **Noventa dias.** Certificado do Let's Encrypt vence rápido de
propósito — um certificado roubado vale pouco se expira em três meses, e prazo
curto obriga a automatizar a renovação, que é o ponto.

## O que acontece sem uma cadeia

Emiti um certificado para `alfa.127.0.0.1.nip.io` na minha máquina:

```bash
openssl req -x509 -newkey rsa:2048 -keyout local.key -out local.crt \
  -days 30 -nodes -subj "/CN=alfa.127.0.0.1.nip.io" \
  -addext "subjectAltName=DNS:alfa.127.0.0.1.nip.io"
```

```
subject=CN=alfa.127.0.0.1.nip.io
issuer=CN=alfa.127.0.0.1.nip.io
```

Sujeito e emissor são **o mesmo**: é auto-assinado, a cadeia tem um elo só, e ele
não leva a lugar nenhum. O `openssl verify` é direto:

```
error 18 at 0 depth lookup: self-signed certificate
```

Servindo esse certificado por nginx e pedindo com `curl`, os três caminhos
possíveis aparecem:

| comando | resultado |
|---|---|
| `curl https://alfa.127.0.0.1.nip.io:8443/` | falha, sem saída |
| `curl -k …` | funciona, **sem validar nada** |
| `curl --cacert local.crt …` | funciona **e** valida |

A terceira linha é a que ensina. Ao passar o próprio certificado como `--cacert`,
eu o transformei em âncora de confiança para aquela chamada. É literalmente o que
o sistema faz com os 150 do bundle — a diferença é quem decidiu confiar.

O `-k` é a opção que se aprende a usar e se esquece de tirar. Ele não conserta
nada; desliga a verificação inteira, inclusive contra alguém no meio do caminho.

## Como cada proxy consegue certificado de verdade

Num domínio público, ninguém emite à mão. O protocolo é o
**ACME** ([RFC 8555](https://www.rfc-editor.org/rfc/rfc8555.txt)): o servidor
prova que controla o nome e recebe o certificado, sem intervenção humana.

A prova vem em dois sabores. No desafio **HTTP-01**, a autoridade pede um arquivo
em `/.well-known/acme-challenge/` do seu domínio — simples, e não serve para
curinga. No **DNS-01**, ela pede um registro `TXT` na zona — dá mais trabalho
porque exige acesso à API do seu DNS, e é o único que emite curinga.

**No Traefik**, isso são três linhas, e ele cuida do resto — pedido, desafio,
armazenamento e renovação:

```yaml
certificatesResolvers:
  meucert:
    acme:
      email: voce@exemplo.com
      storage: /dados/acme.json
      httpChallenge:
        entryPoint: web
```

Daí em diante cada serviço pede o certificado num rótulo, e aparece com HTTPS
sem mais nada.

**No nginx** o caminho é outro: o certificado vem de fora, normalmente do
`certbot`, que escreve os arquivos e recarrega o nginx. Funciona há anos e é
sólido — mas são duas ferramentas com um contrato entre elas, em vez de uma.

É a mesma diferença da [parte 1](/2026/09/traefik-ou-nginx/), aparecendo de novo:
o Traefik traz mais embutido, o nginx compõe com outras peças.

E vale dizer o óbvio: **nada disso funciona com `nip.io` em produção**. O Let's
Encrypt tem limite por domínio registrado, e o `nip.io` inteiro é um só — é
ferramenta de desenvolvimento, não de publicação.

## O que fica

**Certificado é sobre nome.** Todo o resto — `/etc/hosts`, `nip.io`, DNS
interno — existe para dar um nome a algo que só tinha endereço.

**A confiança tem exatamente uma âncora.** Os 150 certificados que vieram com o
sistema. Tudo mais é verificado por assinatura até chegar a um deles, e é por
isso que acrescentar um certificado ao seu próprio bundle "conserta" o erro do
navegador — você mudou a âncora, não o certificado.

**Noventa dias é um recurso, não um incômodo.** Prazo curto obriga a
automatizar, e automatizado ninguém esquece de renovar às duas da manhã de um
domingo.

**E o `-k` não conserta nada.** Ele desliga a verificação. Se você o está usando
em algo que não é teste local, o problema está em outro lugar.

## Referências

- [nip.io](https://nip.io/) — o serviço de DNS curinga usado aqui
- [sslip.io](https://sslip.io/) — o equivalente, e reserva
- [RFC 8555 — Automatic Certificate Management Environment (ACME)](https://www.rfc-editor.org/rfc/rfc8555.txt) — o protocolo por trás do Let's Encrypt
- [RFC 5280 — Internet X.509 PKI Certificate Profile](https://www.rfc-editor.org/rfc/rfc5280.txt) — o que é um certificado e como a cadeia se valida
- [Let's Encrypt: como funciona](https://letsencrypt.org/how-it-works/) — os desafios HTTP-01 e DNS-01
- [Traefik: Let's Encrypt](https://doc.traefik.io/traefik/https/acme/) — a configuração do resolvedor de certificados
- [Certbot](https://certbot.eff.org/) — o caminho usual com nginx
