---
title: "Rodando uma IA no seu próprio computador"
date: 2026-09-14 14:00:00 -0300
tags: [ia, ollama, tutorial]
description: "Um guia passo a passo do Ollama para quem não programa: o que dá para esperar de um modelo rodando no seu notebook, quanto ocupa de disco e o que fazer quando ele ficar lento."
---

Dá para instalar um modelo de linguagem no seu computador e conversar com ele sem
conta, sem mensalidade e sem conexão com a internet. O processo leva uns quinze
minutos e não exige saber programar.

Este texto é a parte prática: como instalar, o que baixar, o que esperar do
resultado. Não entra no mérito de a inteligência artificial ser boa ou ruim para
o mundo — é um assunto legítimo, mas é outro assunto. Aqui o objetivo é só que
você consiga rodar uma no seu notebook e decidir por conta própria se serve para
alguma coisa que você faz.

<!--more-->

## O que "rodar local" quer dizer

Quando você usa o ChatGPT, o Gemini ou o Claude, o texto que você escreve viaja
pela internet até um servidor da empresa, o modelo processa lá e a resposta volta
para a sua tela. O computador que faz o trabalho pesado não é o seu.

Rodar local inverte isso. O modelo — um arquivo grande, de alguns gigabytes —
fica no seu disco. Quando você pergunta alguma coisa, é o seu processador que
calcula a resposta. Três consequências práticas:

- **Não sai nada da sua máquina.** O que você escreve não passa por servidor
  nenhum. Para rascunho de documento sensível, isso importa.
- **Funciona sem internet.** Depois do download, o modo avião não muda nada.
- **Não tem contador.** Nenhum limite de mensagens, nenhuma cobrança por uso.

E uma contrapartida que é honesto dizer logo: o modelo que cabe no seu notebook é
bem menor do que o que roda no servidor dessas empresas. Volto nisso mais
adiante.

## A ferramenta: Ollama

O [Ollama](https://ollama.com) é um programa gratuito e de código aberto — licença
MIT, criado em 2023 — que cuida de baixar, guardar e executar esses modelos.
Existe para macOS, Windows e Linux, e hoje tem um aplicativo com janela de
conversa, então o caminho básico não passa por terminal nenhum.

A empresa por trás dele também vende um serviço pago na nuvem. Rodar modelos
localmente, que é o que este texto cobre, continua gratuito.

## Antes de instalar: seu computador aguenta?

A conta que importa é a memória RAM. Um modelo precisa ser carregado inteiro na
memória para responder, então a regra prática é: **o arquivo do modelo precisa
caber na sua RAM, com uns 3 ou 4 GB de folga para o resto do sistema.**

| RAM do computador | Até onde vai bem |
|---|---|
| 8 GB | modelos de 1B a 4B (arquivos de 1 a 3 GB) |
| 16 GB | modelos até 8B (arquivos de até ~5 GB) |
| 32 GB ou mais | modelos de 12B a 27B (8 a 17 GB) |

Para descobrir quanta memória você tem: no Windows, `Configurações → Sistema →
Sobre`; no macOS, menu Apple → `Sobre Este Mac`.

Dois detalhes que mudam o resultado:

- **Mac com chip M1 ou mais novo** vai bem mesmo com 8 GB, porque a memória é
  compartilhada com o vídeo.
- **PC com placa de vídeo dedicada** (NVIDIA ou AMD recente) fica bem mais rápido,
  mas não é requisito — sem ela o modelo roda no processador, mais devagar.

Se o modelo não couber na memória, ele não quebra: fica lento, às vezes ao ponto
de escrever uma palavra por segundo. É desconfortável, não é perigoso.

## Passo 1 — Instalar

**macOS:** baixe o arquivo em [ollama.com/download](https://ollama.com/download),
abra e arraste o Ollama para a pasta Aplicativos. Requer macOS 14 (Sonoma) ou mais
novo.

**Windows:** na mesma página, baixe o instalador `.exe` e execute. Instala como
qualquer outro programa, sem pergunta complicada no meio.

**Linux:** aqui o terminal é o caminho mais curto. Cole a linha abaixo e dê Enter:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Em todos os casos, o Ollama passa a rodar em segundo plano — no Mac aparece um
ícone na barra do topo, no Windows perto do relógio.

## Passo 2 — Baixar um modelo

O Ollama sozinho não faz nada: ele é o motor, e o modelo é o combustível. Abra o
aplicativo e escolha um na lista. Se preferir, o mesmo se faz no terminal com
`ollama run` seguido do nome.

Estes são bons pontos de partida, do menor para o maior:

| Modelo | Tamanho do download | Para quem |
|---|---|---|
| `gemma3:1b` | 815 MB | computador modesto, respostas rápidas e simples |
| `llama3.2:3b` | 2,0 GB | equilíbrio bom em 8 GB de RAM |
| `gemma3:4b` | 3,3 GB | entende imagens também; pede 8–16 GB |
| `gemma3:12b` | 8,1 GB | notavelmente melhor, precisa de 16 GB ou mais |

Comece pelo `llama3.2:3b` se estiver em dúvida. É o que dá a melhor primeira
impressão na maioria dos notebooks comuns.

O download acontece uma vez só. Depois disso o arquivo é seu e funciona offline.

> Os números depois do nome — 1b, 3b, 12b — são bilhões de parâmetros, uma medida
> aproximada do tamanho do modelo. Mais parâmetros costuma significar respostas
> melhores, mais memória consumida e mais lentidão. É o principal equilíbrio que
> você vai ajustar.

## Passo 3 — Conversar

Terminado o download, o aplicativo abre uma janela de conversa igual à de
qualquer serviço online: você digita, ele responde. Quem preferir o terminal usa

```bash
ollama run llama3.2
```

e sai da conversa digitando `/bye`.

A primeira resposta demora alguns segundos a mais que as seguintes — é o modelo
sendo carregado na memória. Depois disso o ritmo fica constante.

## O que esperar, e o que não esperar

Vale calibrar a expectativa antes de tirar conclusão, porque o modelo que roda no
seu notebook e o que roda no servidor de uma empresa grande não estão na mesma
categoria de tamanho.

**Costuma funcionar bem:**

- resumir um texto que você cola na conversa;
- reescrever um e-mail em tom mais formal ou mais direto;
- explicar um conceito em linguagem simples;
- traduzir;
- dar ideias, títulos, listas, primeiros rascunhos.

**Costuma decepcionar:**

- perguntas sobre fatos e datas — modelos pequenos erram com confiança, e nada
  neles avisa quando estão errando;
- qualquer coisa recente: o modelo só sabe o que estava no treino dele;
- contas e raciocínio longo;
- documentos muito grandes de uma vez.

A regra que me poupa frustração: **use para transformar um texto que você já tem,
não para descobrir um fato que você não tem.** Reescrever, resumir e traduzir são
tarefas em que o modelo trabalha sobre material que você forneceu e você mesmo
consegue conferir o resultado. Perguntar quem inventou tal coisa em que ano é
pedir justamente o que ele faz pior.

## Gerenciar o espaço em disco

Modelos ocupam espaço e é fácil acumular. Para ver o que está guardado e apagar o
que não usa:

```bash
ollama list          # mostra os modelos baixados e o tamanho
ollama rm gemma3:1b  # apaga o que você não quer mais
```

Apagar não tem consequência nenhuma além de liberar disco — se precisar de novo,
é só baixar outra vez.

## Perguntas que sempre aparecem

**É realmente grátis?** Sim, para o uso local. Você paga em disco, memória e
eletricidade.

**Preciso de internet?** Só para baixar o programa e os modelos. Depois, não.

**Meus dados vão para algum lugar?** No uso local, não. Nada do que você digita
sai da máquina.

**É a mesma coisa que o ChatGPT?** Não. É a mesma ideia em escala muito menor.
Comparar o `llama3.2:3b` com os modelos grandes de serviço pago não é uma
comparação justa em nenhuma direção — é como comparar um carro popular com um
caminhão: tamanhos diferentes para propósitos diferentes.

**Vai estragar meu computador?** Não. Um modelo grande demais deixa a máquina
lenta e esquenta o ventilador enquanto responde. Fechar o programa devolve tudo
ao normal.

---

Vale a pena instalar mesmo sem ter certeza de que vai usar. Meia hora com a coisa
rodando na sua frente esclarece mais sobre o que essa tecnologia faz e não faz do
que qualquer texto sobre ela — inclusive este.
