---
title: "Diátaxis na era dos agentes: quatro documentos, não um"
date: 2026-08-18 18:00:00 -0300
tags: [documentação, escrita, agentes, ia, engenharia]
description: "Um README costuma ter quatro intenções misturadas, e por isso nenhuma das quatro funciona. Para um humano isso é irritante. Para um agente, é a diferença entre código certo e código confiantemente errado."
---

Pegue um README qualquer e leia com atenção. Quase sempre há quatro textos
diferentes espremidos ali dentro: um passo a passo para quem chega, uma receita
para quem tem uma tarefa, uma lista de comandos e flags, e alguns parágrafos
explicando por que o projeto existe.

O problema não é que sejam quatro. É que estão no mesmo texto, e por isso
**nenhum dos quatro funciona direito**. O iniciante tropeça na lista de flags; o
veterano com pressa tem que atravessar o passo a passo; e a explicação, que é a
única coisa que o código não contém, some no meio.

O [Diátaxis](https://diataxis.fr/) resolve isso separando os quatro. Escrito por
Daniele Procida em 2020, virou a base da documentação da Django e da Canonical.
Este texto é o resumo curto — e o que muda agora que boa parte dos seus leitores
não é humana.

<!--more-->

## Diátaxis em trinta segundos

Duas perguntas classificam qualquer trecho de documentação:

**O conteúdo informa ação ou cognição?** Passos práticos, ou conhecimento
teórico. Fazer, ou pensar.

**Ele serve à aquisição ou à aplicação?** A pessoa está estudando para adquirir
uma habilidade, ou trabalhando e aplicando a que já tem.

Cruzando as duas, saem quatro tipos — e só quatro:

| Tipo | Informa | Serve à | Em uma frase |
|---|---|---|---|
| **Tutorial** | ação | aquisição | "venha comigo, vamos fazer juntos" |
| **Guia prático** | ação | aplicação | "como resolver este problema" |
| **Referência** | cognição | aplicação | "o que é, exatamente" |
| **Explicação** | cognição | aquisição | "por que é assim" |

A regra que sai disso é chata e é o ponto inteiro: **um documento, um tipo**. Se
o seu tutorial precisa listar todas as flags, ele quer ser referência. Se a sua
referência precisa explicar a decisão de projeto, ela quer ser explicação. Separe.

## O leitor que não sabe passar os olhos

Agora o que mudou.

Um humano lendo um README misturado faz uma coisa que nem percebe: ele **filtra**.
Passa os olhos, reconhece "isso aqui é tutorial, não é o que eu quero", pula
adiante, encontra a flag, segue a vida. A mistura custa atenção, mas o filtro é
quase automático.

Um agente não faz isso. Ele **recupera um trecho** e usa o que veio. Se o trecho
recuperado tem três intenções misturadas, ele não descarta duas — trata as três
como igualmente verdadeiras para a tarefa atual.

A consequência é que os quatro tipos do Diátaxis deixam de ser uma questão de
cortesia com o leitor e viram **arquitetura de contexto**. Documento de um tipo só
é um trecho que se recupera inteiro e se usa inteiro. Documento misturado é ruído
com aparência de sinal.

## O que o agente faz com cada um dos quatro

**Referência é o que ele mais usa, e o que mais o quebra quando envelhece.** Um
humano que lê "a flag é `--parallel`" e encontra `--jobs` no `--help` percebe que
a documentação ficou para trás. O agente não percebe: ele escreve `--parallel`,
com confiança, e você recebe um erro que parece bug do seu código. Referência
desatualizada, para uma máquina, é indistinguível de referência correta.

**Guia prático é o que ele mais aproveita**, porque é o formato do trabalho dele:
uma tarefa concreta, um caminho. Guia prático bem escrito é quase um programa.

**Explicação é o que impede o agente de redecidir.** Esta é a parte que eu mais
subestimei. Se o código tem uma escolha deliberada e o motivo não está escrito em
lugar nenhum, o agente vai encontrar a escolha, achar que é descuido, e
"consertar". Um parágrafo dizendo *"usamos fila em vez de chamada direta porque o
provedor derruba conexões acima de 30 s"* não está lá para ensinar ninguém: está
lá para que a decisão não seja desfeita por alguém — humano ou não — que só vê o
resultado e não vê a alternativa descartada.

**Tutorial é o menos útil e o mais perigoso.** Menos útil porque o agente não
precisa adquirir habilidade ao longo do tempo; ele chega pronto e vai embora.
Perigoso por um motivo específico, e é o erro que mais vi acontecer.

## A armadilha do tutorial

Tutorial simplifica de propósito. É a natureza dele. Ele diz coisas como:

> Para simplificar, vamos pular a autenticação neste exemplo.

> Aqui usamos SQLite; em produção você vai querer outra coisa.

> Não se preocupe com tratamento de erro por enquanto.

Um humano lê isso e registra o aviso. Um agente recupera o bloco de código, e o
aviso — que estava em prosa, uma linha acima — não vem junto ou não pesa o
bastante. O atalho pedagógico vira **código de produção**, com a autenticação
pulada.

O jeito de se defender não é escrever menos tutorial. É não deixar que o tutorial
seja a única fonte de um fato. Se a única ocorrência de "como conectar ao banco"
no seu repositório está num tutorial que usa SQLite para simplificar, é isso que
vai ser copiado. A referência precisa existir, separada, dizendo o que é de
verdade.

## Onde isso encosta no seu repositório hoje

Se você mantém um `CLAUDE.md`, um `AGENTS.md` ou equivalente, ele provavelmente
tem a doença do README: os quatro tipos misturados, agora com o agravante de ser
carregado em **todo** contexto, ocupando espaço mesmo quando nada ali é relevante.

Três ajustes que valem mais que reescrever tudo:

**Separe a referência e deixe-a exata.** Comandos, caminhos, nomes de variáveis,
versões. Sem prosa em volta. É o que mais se consulta e o que mais envelhece.

**Escreva datas absolutas.** "Vamos revisar no mês que vem" é inútil dois meses
depois, e um agente não tem como saber quando "o mês que vem" era. "Revisar em
outubro de 2026" continua legível para sempre. O mesmo vale para "recentemente",
"a versão nova" e "por enquanto".

**Prefira o exemplo executável à descrição em prosa.** Explicar o formato de um
payload em texto exige que o leitor reconstrua a estrutura na cabeça; mostrar o
payload não exige nada:

```json
{
  "evento": "pedido.pago",
  "id": "ped_01H8Z",
  "valor_centavos": 24990,
  "ocorrido_em": "2026-08-18T18:00:00-03:00"
}
```

Valor em centavos, data com fuso, id com prefixo do tipo — três decisões de
projeto que o exemplo comunica sem uma linha de explicação, e que um agente
consegue usar diretamente.

## O que não mudou

Vale terminar pelo que continua igual, porque é fácil tratar agente como leitor
exótico e reescrever tudo em função dele.

Não é exótico. É um leitor que **não estava na sala** quando a decisão foi tomada,
que não conhece o contexto óbvio e que não pode perguntar. Isto é, exatamente o
mesmo leitor que você daqui a seis meses. A documentação que funciona para um
funciona para o outro, e sempre foi assim — a diferença é que agora o leitor sem
contexto chegou em volume, e as consequências de escrever mal aparecem mais
rápido.

O Diátaxis não é sobre agentes. É que agentes tornaram caro continuar ignorando.
