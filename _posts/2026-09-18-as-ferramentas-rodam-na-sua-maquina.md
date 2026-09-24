---
title: "As ferramentas do blog, e por que elas não sobem nada"
date: 2026-09-18 21:00:00 -0300
tags: [ferramentas, javascript, privacidade, pdf, ocr]
description: "Cinquenta e três utilitários que rodam inteiros no navegador. Este texto explica as mais úteis — o que cada uma usa por baixo, o que ela consegue e onde ela para."
---

Tem uma aba neste blog chamada [Ferramentas](/ferramentas/). São **53**
utilitários pequenos: juntar PDF, ler QR, validar CPF, tirar texto de imagem
escaneada, converter planilha.

Nada disso é novo — existe site de sobra que faz cada uma dessas coisas. A
diferença é onde o seu arquivo fica, e este texto é sobre isso e sobre o que há
por baixo de cada ferramenta.

<!--more-->

## O problema que isso resolve

Para juntar dois PDFs, o caminho comum é subir os dois para o site de alguém.
Costuma funcionar. Mas você acabou de mandar um documento — que pode ser um
contrato, um holerite, um exame — para uma máquina que não é sua, operada por
gente que você não conhece, sob uma política de retenção que você não leu.

A alternativa é fazer a conta no seu próprio computador. O navegador moderno já
tem tudo que é preciso: lê arquivos do disco, faz criptografia, decodifica
imagem, roda WebAssembly. Falta só alguém escrever a página.

## A afirmação, medida

"Roda no seu computador" é fácil de dizer. Testei do jeito mais direto que achei:
carreguei a página, **cortei a rede** — todo pedido a partir dali passa a ser
abortado e registrado — e mandei oito ferramentas trabalharem.

```
rede cortada — qualquer pedido a partir daqui é abortado E registrado

  ✓ Mesclar PDFs         10 páginas
  ✓ Dividir PDF          2 páginas
  ✓ Rotacionar           ok
  ✓ Hash SHA-256         03ad6b333d445099c7dfe0ff745ec5cc…
  ✓ Validador de CPF     [true, false]
  ✓ Base64               "acentuação"
  ✓ UUID v4              ok
  ✓ Checksum CRC32       CBF43926

pedidos de rede tentados durante as 8 operações: 0
```

Oito de oito, e **zero** tentativas de rede. Não é que os pedidos tenham sido
bloqueados: nenhum foi feito.

E o contraponto honesto, porque a frase "nada sai da sua máquina" precisa de
ressalva. Carregar a página baixa 26 recursos, sendo sete bibliotecas vindas de
dois **CDNs** — redes de distribuição de conteúdo, que servem arquivos populares
de um ponto perto de você e economizam o download quando o seu navegador já tem
aquela versão em cache:

```
  17  o próprio blog
   4  cdnjs.cloudflare.com     pdf-lib, pdf.js, xlsx, qrcode-generator
   3  cdn.jsdelivr.net         jsQR, JsBarcode, tesseract.js
   2  fonts.googleapis.com     as fontes do tema
```

Ou seja: **o código desce uma vez; os seus arquivos nunca sobem.** São duas
coisas diferentes, e só a segunda é sobre o seu documento.

## PDF: 26 das 53, e duas bibliotecas diferentes

Metade das ferramentas mexe em PDF, e vale saber que elas não usam uma
biblioteca só — usam duas, que fazem coisas opostas.

**`pdf-lib` escreve.** Ela carrega o grafo de objetos do PDF e deixa você
mexer: mover página, girar, escrever texto por cima, mudar metadado, juntar
documentos. O resultado continua sendo um PDF de verdade, com texto
selecionável.

**`pdf.js` — a mesma da Mozilla que desenha PDF no Firefox — renderiza.** Ela
transforma página em pixel. É o que permite "PDF → Imagens", a pré-visualização
onde você clica para posicionar um carimbo, e o OCR de página escaneada.

A distinção explica um comportamento que parece defeito. "Destravar PDF" pede a
senha, e devolve um PDF **de imagens**, sem camada de texto:

```js
const doc = await pdfjsLib.getDocument({ data: buffer, password: senha }).promise;
// … renderiza cada página e remonta
```

Isso porque o `pdf-lib` não sabe decifrar PDF protegido; o `pdf.js` sabe, mas só
para desenhar. O caminho existente passa pelo pixel, e é honesto dizer que passa.

Sobre desempenho, a conta roda no seu processador, então o número depende da sua
máquina. Nesta aqui, mesclando dois PDFs:

| páginas no resultado | tempo |
|---:|---:|
| 20 | 2 ms |
| 200 | 11 ms |
| 1.000 | 146 ms |

O limite não é tempo, é memória: o arquivo inteiro fica na RAM da aba. PDF de
centenas de megabytes vai doer.

**O que não tem:** proteger PDF com senha. O `pdf-lib` não implementa cifragem,
e trocar de biblioteca mexeria nas 26 ferramentas que funcionam. Preferi não ter
a ferramenta a ter uma que finge.

## OCR: o modelo desce, a sua imagem não sobe

Reconhecer texto em imagem dentro do navegador soa improvável, e é a ferramenta
que mais surpreende. Usa **Tesseract.js**, que é o Tesseract de sempre — o motor
de OCR da Google, de 2006 — compilado para **WebAssembly**, um formato binário
que o navegador executa perto da velocidade de código nativo.

Numa imagem de teste com `NOTA FISCAL 12345`:

```
resultado: 'NOTA FISCAL 12345'   confiança 95%   em 0,7 s
```

Aqui vale a ressalva mais importante do texto. O OCR **baixa** coisas na primeira
vez:

```
    32,0 kB   worker.min.js
 1.342,0 kB   tesseract-core-simd-lstm.wasm      ← o motor
 1.359,6 kB   por.traineddata                    ← o modelo de português
 ─────────
 2.733,6 kB
```

Quase 2,7 MB, uma vez, e depois fica em cache. Mas repare na direção: o que vem
é o **modelo**; a sua imagem continua parada. É o oposto de um serviço de OCR,
onde a imagem viaja e o modelo fica.

## Validadores: o dígito verificador, não uma lista

"Validar CPF" não consulta nada — não há base de dados envolvida, e nenhum site
sério teria acesso a uma. O que se valida é **aritmética**: os dois últimos
dígitos são calculados a partir dos nove primeiros, por módulo 11.

```
111.444.777-35   válido
111.444.777-36   inválido      ← um dígito trocado
529.982.247-25   válido
000.000.000-00   inválido      ← rejeitado por regra, apesar da conta fechar
```

Aquele último caso é o detalhe que separa implementação boa de ruim: `000...00`
passa no módulo 11, e é rejeitado por uma regra à parte. Um validador que só faz
a conta aceita onze sequências iguais como válidas.

A ferramenta faz CPF, CNPJ, PIS, RENAVAM, OAB, número de processo CNJ, CEP e
inscrição estadual — e também **gera** números válidos, que é o que você precisa
para testar sistema sem usar o CPF de ninguém.

## Hash, Base64 e JWT: o que o navegador já sabe fazer

SHA-256 e HMAC não são implementados aqui: são chamados da **Web Crypto API**,
que é criptografia nativa do navegador, em código compilado e auditado. MD5 é a
exceção, e o motivo está no comentário do código:

```js
/* MD5 pure JS — Web Crypto does not support MD5 (deprecated) */
```

A Web Crypto se recusa a oferecer MD5 por ele estar quebrado para uso
criptográfico. Como MD5 ainda aparece o tempo todo em conferência de arquivo
legado, ele está escrito à mão ali do lado.

O inspetor de **JWT** merece uma frase de contexto, porque o mal-entendido é
comum. Um JWT tem três partes separadas por ponto; as duas primeiras são apenas
**Base64**, e Base64 não é cifra — é uma forma de escrever bytes com as letras do
alfabeto. Qualquer um lê o conteúdo de um JWT.

O que o token garante não é sigilo, é **integridade**: a terceira parte é uma
assinatura, e alterar o conteúdo invalida a assinatura. Daí a regra prática:
nunca ponha dado sensível dentro de um JWT. Abrir um não é quebrar nada.

## QR e código de barras, nos dois sentidos

Gerar usa o `qrcode-generator`; ler imagem usa o `jsQR`; e há uma versão que
abre a câmera e decodifica ao vivo, quadro a quadro, pela API de mídia do
navegador — a imagem da câmera nunca chega a virar arquivo.

Uma nota de cicatriz: a biblioteca de geração foi trocada porque a anterior
quebrava com **acento**. Ela escolhia o tamanho do QR contando caracteres, e
depois codificava em UTF-8 — onde "ã" ocupa dois bytes. Com acento, o conteúdo
não cabia no tamanho escolhido.

## E o resto, em uma linha

Planilhas (XLSX ↔ JSON ↔ CSV) pela biblioteca `xlsx`; leitores de **NFe**,
**CT-e** e **SPED Fiscal**, que são formatos que só importam aqui e por isso
raramente têm ferramenta boa de graça; e os utilitários de sempre — UUID,
timestamp, fuso horário, slug, cálculo de prazo.

## O que fica

**Cinquenta e três ferramentas, zero pedidos de rede ao usar.** Medido cortando
a rede e vendo se ainda funcionavam. Funcionaram.

**O código desce; o seu arquivo não sobe.** As sete bibliotecas de CDN e os
2,7 MB do modelo de OCR viajam uma vez, na sua direção.

**Sem servidor não há fila, limite diário nem cadastro** — e também não há
máquina grande para o seu PDF de 500 MB. A troca é essa.

**E o que não dá para fazer direito não está lá.** Proteger PDF com senha ficou
de fora porque a biblioteca não faz, e uma ferramenta que finge é pior que
ferramenta nenhuma.

Se você quiser saber o que acontece entre apertar enter e a página aparecer,
tem [uma série de oito partes](/2023/08/navegador-parte-0-as-camadas/) sobre
isso.
