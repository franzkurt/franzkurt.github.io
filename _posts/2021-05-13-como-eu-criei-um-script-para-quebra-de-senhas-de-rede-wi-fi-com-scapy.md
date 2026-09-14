---
title: "Como eu criei um script para quebra de senhas de rede Wi-Fi com Scapy"
date: 2021-05-13 15:32:38 -0300
tags: [hacker, python, cracking, wifi, scrapy]
description: "O protocolo 802.11x ou sinal Wi-fi está presente em quase todas as residências e empresas que frequentamos diariamente. Fornecem toda a estrutura física e a lógica de redes…"
canonical_url: https://franzkurt.medium.com/como-eu-criei-um-script-para-quebra-de-senhas-de-rede-wi-fi-com-scapy-8a3dae8b8b2c
medium_url: https://franzkurt.medium.com/como-eu-criei-um-script-para-quebra-de-senhas-de-rede-wi-fi-com-scapy-8a3dae8b8b2c
audio: /assets/audio/como-eu-criei-um-script-para-quebra-de-senhas-de-rede-wi-fi-com-scapy.mp3
audio_duracao: "13:10"
---
## Entendendo o 4 Way Handshake de redes Wireless em Python

O protocolo 802.11x ou sinal Wi-fi está presente em quase todas as residências e empresas que frequentamos diariamente. Fornecem toda a estrutura física e a lógica de redes para que possamos navegar tranquilamente na Internet. Assim como a eletricidade que nos rodeia e que só percebemos quando ela faz falta, o sinal de Wi-Fi utiliza técnicas avançadas de criptografia para manter a comunicação, segura e integra.

> Tudo isso da maneira mais transparente e segura possível.

## Diferente do 3-Way Handshake

onde o protocolo TCP realiza um simples acordo para a troca de pacotes, o protocolo de autenticação do 802.11 envolve uma Chave de Encriptação trocada previamente a conexão, também conhecida como “Senha do WIFI”, e uma sequência matemática complexa que permite comprovar que ambos conhecem a senha na fase de autenticação, mesmo que ninguém informe a mesma.

Como a transferência da Senha pelo ar seria um violação do protocolo de segurança RSA, foi criado o 4-Way Handshake. Este protocolo permite as partes confirmarem seu conhecimento de uma chave simétrica específica sem a divulgar explicitamente. Para entender o processo de conexão entre um dispositivo qualquer e um acess point ou roteador vamos dividir o processo nas 4 fases abaixo:

## As 4 Fases: Descoberta, Associação, Autenticação e Comunicação

***1. Descoberta de rede:*** Aqui os dispositivos emitem pacotes com a intenção de conhecer os demais. (Pacotes Beacon, Probe req e Probe Resp)

***2. Associação:*** Nesta fase o dispositivo interessado na associação emite um pacote avisando que deseja se conectar a determinada rede. (Pacotes Association Request e Association Response)

***3. Autorização:*** Realizada após o dispositivo a ser adicionado provar que conhece a chave criptográfica da rede, através do 4-Way Handshake. (Pacotes EAPOL-Key)

***4. Comunicação através da rede***. (Pacotes QoA, Data e Ack)

Os participantes da rede são descritos como ***AP*** (o Roteador) ou ***STATION*** (os Dispositivos) e os pacotes trocados entre eles são referidos como Frames ou Data Frames pois carregam pacotes de dados além de informações de controle.

***Na Fase 1*** o AP emite um Beacon o qual tem a função de sinalizar um BSSID — o nome-da-rede dizendo que tem uma rede disponível para a conexão. Assim dize-se que um STATION recebeu o pacote de forma passiva.

Entretanto um STATION pode realizar a pesquisa por redes de modo mais ativo, podendo emitir um Probe Request via Broadcast perguntando para todos os dispositivos da região se existe alguma rede SSID disponível na área. Caso algum AP receba o pacote, ele enviará de volta um Probe Response com a descrição da rede e as informações necessárias para que ocorra a conexão.

***Na Fase 2*** o STATION já possui as informações sobre a rede, como protocolos de autenticação e a frequência, por exemplo, e pode concordar com a conexão. Se o dispositivo desejar a conexão ele envia um novo Probe Request aceitando os termos do “contrato”, confirmando o ciframento que deve ser utilizado por ambas as partes para se autenticar.

O CCMP ou TKIP são usados geralmente, assim como o HMAC SHA1.

Inicia-se assim a fase de autenticação através do protocolo 802.x. A figura abaixo simboliza sucintamente a troca de informações.

<figure>
  <img src="/assets/img/medium/como-eu-criei-um-script-para-quebra-de-senhas-de-rede-wi-fi-com-scapy/01.png" alt="">
</figure>

Na Fase 3 ocorre a troca de informação necessária para confirmar que ambos os dispositivos conhecem a mesma PassPhrase ou “Senha do WiFI”. Em protocolos de controle de acesso existem alguns atores: O ***Suplicant***, o ***Authenticator*** e o ***Authorizer***.

Digamos que um estranho bate a porta e uma criança abre a porta com a corrente de proteção, o estranho se apresenta e o pai da criança, que está no sofá, autoriza ou não sua entrada. Neste contexto o estranho seria o Suplicant, a criança o Authenticator e o pai o Authtorizer. Normalmente o roteador faz os dois papéis, ele mesmo autentica o estranho à sua porta e permite ou não a sua entrada.

Com este padrão conhecido, teremos a sequência de quatro passos abaixo, a fim de autorizar a comunicação com um novo dispositivo.

## O 4-Way Handshake

**a.** O AP inicia o processo gerando um numero aleatório chamado de ANonce e envia este valor num pacote para o STATION. O MIC neste pacote está zerado pois nenhuma iteração aconteceu até o momento entre os dispositivos.

**b.** O STATION de posse do ANonce e gerando seu próprio SNonce pode iniciar a validação. Para isso ele deverá criar algumas chaves: PSK, PMK E PTK.

A chave Pre Shared Key é gerada com o PassPhrase e o BSSID

```
PSK = PBKDF2(str.encode(PassPhrase), str.encode(BSSID), 4096, 32)
```

**pbkdf2* — *Password-Based Key Derivation Function 2*

**EAP* *ou Extensible Authentication Protocol é uma extensão do protocolo de autenticação “802.1x”* — e caso não esteja presente PMK = PSK.

Porém atualmente o protocolo é utilizado por padrão e precisamos calcular PMK. Para uma melhor vizualização, veja a sequência de derivação abaixo.

<figure>
  <img src="/assets/img/medium/como-eu-criei-um-script-para-quebra-de-senhas-de-rede-wi-fi-com-scapy/02.png" alt="">
</figure>

De posse da PSK e do salt BSSID é possível gerar a PairWise Master Key.

```
PMK = PBKDF2(HMAC−SHA1, PSK, BSSID, 4096, 256)
```

Após as 4096 iterações a chave gerada deve possuir 256 bits. A próxima chave é a PairWise Transient Key gerada com a função PRF512 que terá uma saída de 512-bits. Destes os primeiros 384-bit serão usados como 3 chaves distintas (KEK + KCK + TK) e os 128-bit finais como configurações do protocolo TKIP (Rx e Tx).

Utilizando ambos os valores gerados SNonce e Anonce e o endereço físico dos dispositivos envolvidos MAC é possível obter um hash final chamado PTK.

```
PTK = PRF512 (PMK + Anonce + SNonce + Mac (AP)+ Mac (ST))
```

<figure>
  <img src="/assets/img/medium/como-eu-criei-um-script-para-quebra-de-senhas-de-rede-wi-fi-com-scapy/03.png" alt="">
</figure>

Com os valores gerados o STATION responde ao AP com um pacote que contém seu SNonce, ainda desconhecido pelo AP, e o MICtx além de setar a flag de MIC.

**c.** O AP que possui os mesmos dados, executa as funções de HASH e determina se o MIC é correspondente.

Se o MICtx recebido no pacote for igual ao MIC gerado, tudo certo e vamos para a última etapa. *Caso o MIC não corresponda o processo é encerrado e o AP não responderá mais, necessitando recomeçar o processo.

**d.** Caso os Mic’s correspondam, temos a confirmação que ambos conhecem a PassPhrase e portanto podem se comunicar diretamente (via unicast) através de encriptação simétrica usando TK como chave.

Já para a comunicação (broadcast), digo ARP e DNS, será necessário criar uma chave a ser compartilhada por todo o grupo de dispositivos ligados na mesma rede. Entra em ação a Group Transient Key

```
GTK = PRF-256(GMK, “Group key expansion”, MAC_AP||GNonce)
```

Utilizando o GMK, uma chave privada gravada no AP, e um GNonce gerado aleatoriamente pelo AP, uma chave chamada GTK é criada e anexada no pacote numero 4. Que encerra o 4 Way Handshake. Crack da senha WPA2

> Agora que conhecemos o processo temos que descobrir a senha inicial, alguma idéia? Regerando o MIC com os valores capturados no handshake para diversos valores de senha e comparando com o enviado no pacote numero 2 temos uma boa chance de encontrar a sequência correta.

**Desde que a lista de senhas contenha a chave certa.*

Parte Prática: *Em breve disponibilizo no Github o código fonte Vamos instalar as bibliotecas e o nosso manipulador de pacotes de rede Scapy. Primeiro vamos aprender a filtrar pacotes da rede com o scapy. A função sniff() realiza uma escuta na placa de rede e armazena os pacotes na memória assim como o wireshark.

Antes de utilizar a placa é necessário garantir que ela está em modo monitor e no canal correto ou você não irá capturar pacotes. Pode rodar um airmong-ng caso tenha duvidas sobre os parametros da rede. Com o script rodando ligue e desligue o modo avião o celular.

Se tudo ocorrer corretamente a resposta deverá conter 4 pacotes.

<figure>
  <img src="/assets/img/medium/como-eu-criei-um-script-para-quebra-de-senhas-de-rede-wi-fi-com-scapy/04.png" alt="">
</figure>

Para exibir a resposta da captura pode-se armazenar a resposta e cada posição do array retornará um dos pacotes capturados.

Por exemplo: res[0]. *Não foi realizado o ordenamento dos pacotes, apenas sabemos que o MIC do primeiro é zero e com isso podemos ordená-los. Exibindo os dois primeiros pacotes percebemos que o scapy nos permite interpretar os dados como desejarmos. vamos salvar um pcap e comparar no wireshark.

O comando para salvar um pcap no scapy é `wrpcap(‘filtered.pcap’, res, append=True)`.

O primeiro pacote possui o MIC vazio e o Nonce, como esperado. Este é o ANonce, uma vez que o primeiro pacote deve sempre ser enviado pelo AP.

<figure>
  <img src="/assets/img/medium/como-eu-criei-um-script-para-quebra-de-senhas-de-rede-wi-fi-com-scapy/05.png" alt="">
</figure>

A Flag de MIC está 0 pois o pacote não carrega este valor.

A Flag de Key descriptor nos indica o Hash a ser utilizado, no caso HMAC-SHA1 A Flag de Pairwaise Key indica que está ocorrendo um handshake.

A Flag de Secure está 0 pois o sinal ainda não está encriptado. As demais fica pra estudos posteriores.

```
ANonce = 4a45276ddb0a599d43e9dc3730d023710e23d26956c3fcbf452d4f6b756b758f
```

Comparando os valores conseguimos encontrar no scapy o valor aNonce = a2b_hex(res[0][34:98])

Precisamos agora dos dados do pacote numero 2:

<figure>
  <img src="/assets/img/medium/como-eu-criei-um-script-para-quebra-de-senhas-de-rede-wi-fi-com-scapy/06.png" alt="">
</figure>

Temos agora o Nonce do pacote 2, ou seja,

```
SNonce = c65c7788d000da1da0fd9a206129b99df987b43e19d36705a5845c63c90f761e
```

Como o MIC também está presente, vamos armazena-lo:

```
MIC1 = dd4b4d11334a3fe31986c956905b4973
```

Possuímos até o momento quase todos os dados necessários para o crack da senha, precisamos apenas do nome da rede.

Para isso pode-se capturar em um sniff o frame Beacon ou Probe Response que possuem este valor no pacote. Ainda não foi implementado e portanto apenas informe via raw_input ou Hard-coded.

```
ESSID = “ALHN-42CC”
```

Além do nome da rede precisamos do MAC do AP e do ST.

```python
MAC_AP = a2b_hex(“743c1870af99”)
MAC_ST = a2b_hex(“7c8bb518374f”)
```

<figure>
  <img src="/assets/img/medium/como-eu-criei-um-script-para-quebra-de-senhas-de-rede-wi-fi-com-scapy/07.png" alt="">
</figure>

Com estes valores, os mesmo que serão extraídos pela ferramenta aircrack-ng de um arquivo pcap, seremos capazes de fazer a quebra da PassPhrase.

Para gerar o MIC iremos gerar o MIC na ordem:

PMK -> PTK -> MIC A = b”Pairwise key expansion”

```python
B = min(MAC_AP, MAC_ST) + max(MAC_AP, MAC_ST) + min(aNonce, sNonce) + max(aNonce, sNonce)
pmk = pbkdf2_hmac(‘sha1’, pwd.encode(‘ascii’), ssid.encode(‘ascii’), 4096, 32)
ptk = PRF(pmk, A, B) mics = [hmac.new(ptk[0:16], i, sha1).digest() for i in data]
```

Agora que geramos o MIC em mics[0], basta comparar ***mics[0]*** == MIC

Um documento mais didático está neste [***link***](https://gateway.pinata.cloud/ipfs/QmZwXohZ8yai8gwSjx2NLbfBCLKbbUGXTLehGrzSezdJqv).

Código: [github.com/franzkurt/wpacrack](https://github.com/franzkurt/wpacrack)
