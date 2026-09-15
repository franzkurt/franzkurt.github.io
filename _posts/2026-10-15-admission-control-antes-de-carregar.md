---
title: "A pergunta que nenhuma ferramenta faz antes de carregar o modelo"
date: 2026-10-15 09:00:00 -0300
tags: [ia, engenharia, memória, ollama, llama-cpp, infraestrutura]
description: "Ollama, llama-server e RamaLama sabem ajustar o modelo ao máximo do dispositivo. Nenhum deles aceita um orçamento. Em memória unificada, o dispositivo é a máquina inteira — e ajustar ao máximo significa tomá-la."
---

Existe uma pergunta que toda ferramenta de inferência local deveria fazer e
nenhuma faz: **isto cabe no que eu tenho para gastar?**

Repare na formulação, porque a diferença é tudo. As ferramentas do caminho
dominante — Ollama, llama-server, RamaLama — sabem ajustar o modelo ao máximo do
dispositivo. Existe mecanismo. O que não existe é **orçamento**: nenhuma delas
aceita "você tem 8,8 GB, decida com isso". E em memória unificada, onde CPU e GPU
dividem a mesma RAM, "o máximo do dispositivo" é a máquina inteira. Ajustar ao
máximo significa tomar tudo o que tem.

O custo disso não é hipotético. Num laptop de 16 GB, um modelo de 14B carregado
sem pergunta nenhuma matou um processo meu — o sistema escolheu a vítima, e não
fui consultado.

<!--more-->

## O caso que não é o óbvio

O exemplo acima é o fácil de entender: modelo grande demais, RAM de menos. Mas o
caso que me convenceu de que isto é um problema de *design* e não de atenção foi
outro, e o peso do modelo não tinha nada a ver.

Subi um `llama-server` com um modelo pequeno — 2,5 GB. Estourou os 16 GB mesmo
assim.

A causa: sem `-c` explícito, o llama-server aloca **o contexto de treino inteiro**,
e multiplica isso pelo número de slots. No log: `n_slots=4, n_ctx_slot=66816`.
Quatro slots de 66 mil tokens de cache KV. Gigabytes de memória que não são o
modelo, que nenhuma listagem de "tamanho do modelo" mostra, e que aparecem depois
que você já apertou enter.

O Ollama serve o mesmo arquivo sem drama porque corta o contexto em 4k por
default. Mesmo blob, mesma máquina, dois resultados opostos — e a diferença está
num default que nenhum dos dois te pede para confirmar.

## O que um preflight faz

Escrevi um. A ideia é modesta: **ler só o cabeçalho do GGUF** — cerca de 19 MB de
RSS medido, contra os 4,6 GB do arquivo — estimar pesos, cache KV (com a
aritmética de GQA correta para cada arquitetura) e overhead, e devolver um
veredito antes de qualquer alocação.

Quatro vereditos, e o quarto é o que importa:

- `admit` — cabe.
- `admit_degraded` — cabe com `--ctx-size` reduzido, e ele diz qual.
- `refuse` — não cabe.
- `unknown` — **não sei**.

O `unknown` é a parte que custa disciplina. Quando o GGUF não declara
`context_length`, a tentação é assumir 4096 e seguir. Uma implementação
concorrente do mesmo script fazia exatamente isso, e o resultado era um `admit`
de 0,33 GB — um número inventado, com cara de medição, para um modelo cujo
consumo real ninguém sabia.

Um admissor que chuta é pior que nenhum, porque transfere a responsabilidade sem
transferir a informação.

## Validação contra o que aconteceu de verdade

Estimativa só vale contra medição. As quatro que fiz:

| caso | previsto | medido |
|---|---|---|
| LLaDA, contexto 512 | 5,08 GB | RSS de 4,7–4,9 GB — erra 4–8% **para cima** |
| modelo pequeno, contexto de treino | 21,51 GB | estourou os 16 GB, como previsto |
| o mesmo, contexto 4096 | 3,06 GB, `admit` | serve leve |
| modelo de 8,93 GB de pesos | `refuse` (teto 8,8) | o guard recusou |

Errar para cima é a direção certa: uma estimativa conservadora recusa modelo que
caberia — irritante — enquanto uma otimista aprova o que não cabe, e aí alguém
perde o que estava fazendo.

O que **não** medi, e que seria o próximo passo honesto: a **taxa de recusa
falsa** nos 15 modelos que tenho em disco. Sei que a estimativa erra para o lado
seguro; não sei quantas vezes ela recusa por segurança algo que rodaria bem. Isso
é uma medição que falta, não um resultado que tenho.

## O furo que quase passou

A robustez foi auditada contra 15 modelos reais, 12 arquiteturas — incluindo
vision e híbridas. Os 15 estimados, zero exceções. Aí testei contra 6 arquivos
sintéticos degenerados de propósito, e apareceram quatro furos. Três eram
tracebacks feios que viraram mensagens decentes: GGUF truncado, versão 1, arquivo
big-endian.

O quarto era de outra natureza:

> Um GGUF **dividido em shards** era estimado pelo peso de **um só shard**.

Silenciosamente. Sem erro, sem aviso — só um número três vezes menor que o real, e
um `admit` confiante.

Pense no modo de falha: um checador de admissão que **subestima** aprova
exatamente o modelo que vai estourar a máquina. Ele não falha aleatoriamente;
falha na direção precisa que anula a razão de ele existir.

A correção soma os irmãos `-00001-of-00003.gguf`; e se algum estiver faltando,
devolve `unknown` em vez de somar o que achou. Provado com shards sintéticos de
200 + 100 + 50 MB: soma certa com os três, `unknown` com um escondido.

O mesmo princípio apareceu em outro check. O de exposição de rede enumera
listeners com `lsof` ou `ss`; quando nenhum dos dois existe, ele agora declara que
**não verificou**. Antes devolvia lista vazia, e a lista vazia virava a afirmação
"toda inferência escuta só em loopback" — segurança concluída a partir de ausência
de dado.

## A segunda camada: o teto que sabe o que matar

Admissão é conselho, e conselho se contorna — o meu foi, por um servidor lançado
fora do caminho que tinha o guard. Então há uma segunda camada, e o desenho dela
saiu de uma medição, não de uma preferência.

Rodando dois processos sob um teto de cgroup, o comportamento se separa em dois:

| o que aloca | num GGUF é | sob `MemoryMax` |
|---|---|---|
| memória **anônima** | cache KV, ativações | **processo morto dentro do escopo** |
| arquivo por **mmap** | os pesos | **sobrevive** — o kernel reclama e refaulta |

Essa assimetria é exatamente a certa, e é sorte de ninguém: o teto contém
precisamente o termo que a **estimativa pode errar** — o KV, que é calculado — e é
elástico no termo que é **exato**, os pesos, que são lidos do índice do arquivo.

Duas decisões saem daí:

- **`MemorySwapMax=0`.** Sem isso o excesso anônimo vai para swap, e o modo de
  falha deixa de ser um kill contido e vira a máquina inteira à velocidade do
  disco.
- **`MemoryHigh` deliberadamente ausente.** Ele forçaria reclaim antes do teto — e
  o que seria reclamado são os pesos mapeados. Trocaria um problema de memória por
  um problema de disco, com tok/s despencando e nada explodindo. Thrashing
  disfarçado de funcionamento é a pior classe de falha que existe aqui.

Medido: um processo pedindo 300 MB sob teto de 128 MiB termina com
`Result=oom-kill` dentro do escopo, e o `MemAvailable` da máquina se move **−18
MB**. O resto do sistema não percebe.

Ressalva de plataforma: isso é Linux. No macOS não há cgroup, e o que dá para
fazer é um watchdog que amostra RSS e mata ao ultrapassar — degradação honesta,
documentada como tal, sem fingir paridade.

## O que o teto não faz

Vale ser explícito, porque é fácil confundir as duas camadas:

**O teto não melhora a estimativa. Ele torna o erro barato.**

A admissão continua sendo quem *evita* o erro. O teto é quem *paga a conta* quando
a admissão erra. Trocar um pelo outro dá um sistema que funciona por sorte: ou
você recusa sem saber, ou você mata sem avisar.

## Uma tentativa que não funcionou

Fechando com um beco sem saída, que economiza o tempo de quem tiver a mesma ideia.

Para saber se um runtime executa uma arquitetura, parece natural procurar a string
no binário do engine. É elegante e não precisa de tabela mantida à mão.

Falha nos dois casos que importam. Primeiro: `which ollama` devolve um shim de 50
bytes — `strings` vazio, o analisador se abstém, e o modelo de difusão passa e
quebra. Segundo, e pior: a biblioteca compartilhada do llama.cpp **contém** a
string `llada`, porque a CLI de difusão linka a mesma lib. A heurística concluiria
que o llama-server serve difusão. Ele não serve.

A lição cabe numa linha: **string presente no binário ≠ runtime executa**. O que
ficou no lugar é um mapeamento fixo de arquitetura por runtime, calibrado contra
o crash medido — mais chato de manter e certo pelos motivos certos.
