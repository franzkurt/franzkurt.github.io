---
title: "Parâmetros: o que os benchmarks estão medindo sem saber"
date: 2025-09-13 09:00:00 -0300
tags: [ia, medição, experimento, benchmark, engenharia]
description: "Trocar um parâmetro de inferência mudou o acerto em 4× no mesmo modelo. O ótimo se inverte entre modelos, e o default do Ollama fica em 8º de 10. A consequência é metodológica: todo benchmark com parâmetros fixos mede parcialmente o parâmetro, não o modelo."
---

Comparação de modelos de linguagem quase sempre segue o mesmo formato: um prompt,
uma lista de modelos, os parâmetros no default de quem está rodando, e uma tabela
de acerto no fim. O resultado vira "o modelo A é melhor que o B".

Medi o tamanho do que esse formato ignora. A resposta é grande demais para
ignorar: **o mesmo modelo, na mesma tarefa, varia até 4× em acerto só trocando
parâmetro de inferência**. E o parâmetro ótimo não é o mesmo entre modelos — o
que é melhor para um é dos piores para outro.

Se isso é verdade, então um benchmark com parâmetros fixos não está medindo os
modelos. Está medindo os modelos *sob uma configuração que favorece alguns deles*,
e reportando a soma das duas coisas como se fosse uma.

<!--more-->

## O desenho

Dez configurações de parâmetros, cada uma com hipótese declarada antes de rodar.
Quatro modelos, um por vez — a máquina tem 16 GB e há um guard que recusa
qualquer modelo acima de 55% da RAM física. Dez tarefas de avaliação **com
gabarito**, de extração mecânica a julgamento semântico, verificadas por
comparação com a resposta esperada e não pelo julgamento de outro modelo, com
seeds fixas.

São 350 células de `(modelo × tarefa × configuração)` e 115 execuções por
configuração. A cobertura não é uniforme, e vale dizer antes das tabelas: três
dos modelos rodaram as dez tarefas com três amostras por célula; o `gemma4` rodou
**cinco das dez**, com cinco amostras. Ele entra no agregado com 25 execuções por
configuração contra 30 de cada um dos outros, e num subconjunto de tarefas
diferente. Onde a comparação entre modelos depender disso, eu aviso.

O gabarito é a parte que dá trabalho e a que não dá para pular. Sem resposta
esperada não há como escolher configuração — só há como constatar que as saídas
mudaram.

## O agregado: o default fica em oitavo

| configuração | acerto | |
|---|---|---|
| `rep1.0` | 73/115 | 63,5% |
| `temp0.2` | 73/115 | 63,5% |
| `bigctx` | 67/115 | 58,3% |
| `greedy` | 67/115 | 58,3% |
| `greedy+seedfix` | 67/115 | 58,3% |
| `greedy+topk1` | 67/115 | 58,3% |
| `min_p0.1` | 61/115 | 53,0% |
| **`default`** | **60/115** | **52,2%** |
| `temp1.0` | 52/115 | 45,2% |
| `rep1.2` | 49/115 | 42,6% |

O default do Ollama é o **oitavo de dez**. Trocar `default` por `temp0.2`, sem
trocar de modelo, sem trocar de prompt, sem comprar hardware, sobe o acerto de
52,2% para 63,5%.

Isso sozinho já é um problema para qualquer comparação publicada: se você
benchmarkou no default, mediu os modelos no oitavo de dez cenários.

## Mas o agregado esconde o achado de verdade

A tabela acima sugere que basta adotar `temp0.2` e seguir a vida. Não basta. O
agregado é a média de quatro comportamentos que se contradizem.

| modelo | melhor configuração | pior configuração | amplitude |
|---|---|---|---|
| `ornith-1.5:9b` | `bigctx` 27/30 (90%) | `temp1.0` 13/30 (43%) | **2,1×** |
| `qwen3.5:9b` | `rep1.0` 24/30 (80%) | `rep1.2` 6/30 (20%) | **4,0×** |
| `granite4.2:8b` | `temp0.2` 17/30 (57%) | `rep1.2` 12/30 (40%) | 1,4× |
| `gemma4:e4b`¹ | `temp1.0` 15/25 (60%) | `temp0.2` 10/25 (40%) | 1,5× |

¹ Medido em cinco das dez tarefas — a amplitude dele é comparável dentro da
própria linha, não com as outras.

Leia as duas primeiras colunas em cruz e o problema salta:

- `temp1.0` é **a melhor** do `gemma4` e **a pior** do `ornith`.
- `temp0.2` é **a melhor** do `granite` e **a pior** do `gemma4`.
- `rep1.0` é a melhor do `qwen3.5`; `rep1.2` — a mesma penalidade de repetição,
  0,2 acima — é a pior dele, e a pior do `granite` também.

Aquela amplitude de **4,0×** no `qwen3.5` vem inteira de dois décimos de
repeat penalty. De `1.0` para `1.2`, o acerto cai de **24/30 para 6/30**. Não é
degradação suave: é o modelo saindo de bom para inútil por causa de um número que
a maioria das comparações nem reporta.

Não existe configuração universalmente boa. Quem publica "use temperatura 0 para
tarefas determinísticas" está reportando o ótimo de um modelo específico e
chamando de regra geral.

## Quanto vale escolher

Dá para colocar preço nisso. Três cenários sobre exatamente os mesmos dados:

| estratégia | acerto |
|---|---|
| default do Ollama | 52,2% |
| melhor configuração única, aplicada a todos | 63,5% |
| melhor configuração **por modelo** | **72,2%** |

Escolher por modelo vale **+20 pontos** sobre o default e **+9 pontos** sobre a
melhor configuração global. Isso é ganho da ordem de grandeza de trocar de
modelo — e custa uma tarde de sweep em vez de RAM, download e migração.

A contrapartida é honesta: esses +20 pontos **só existem se houver eval com
gabarito**. Sem ele, não há como saber qual das dez configurações é a sua, e o
default — oitavo de dez — é onde você fica por omissão.

## O resultado negativo: estabilidade não é acerto

Este é o achado que mais me mudou a prática, e é negativo.

A cada célula eu registrava se as três amostras **divergiram** entre si. A
intuição comum é que consistência é bom sinal: se o modelo responde a mesma coisa
três vezes, ele "sabe". É o princípio por trás de self-consistency como heurística
de confiança.

Das 350 células, **283 foram estáveis** — 81%. E dentro delas:

> **107 células são estáveis e estão 100% erradas.**

Não parcialmente erradas. Três respostas idênticas, zero acertos. O `greedy` no
`gemma4` é o caso limpo: cinco execuções devolvendo exatamente a mesma saída
vazia, e nenhuma delas certa. Estável por construção — `greedy` não tem
aleatoriedade para divergir — e estavelmente errado.

O que isso significa na prática: **um harness que valida por auto-consistência
aprova essas 107 células**. Ele mede reprodutibilidade, que é uma propriedade do
processo de amostragem, e a reporta como se fosse qualidade, que é uma
propriedade da resposta. As duas não têm relação nesses dados — a configuração
mais estável de todas é justamente uma das que mais erram.

## A consequência metodológica

Junte as três peças:

1. O parâmetro muda o acerto em até 4×.
2. O parâmetro ótimo **inverte** entre modelos.
3. O default é o oitavo de dez.

Delas sai uma conclusão que vale para qualquer comparação de modelos, inclusive
as minhas: **todo benchmark com parâmetros fixos está medindo, em parte, o
parâmetro — e não o modelo**. Ele reporta "modelo A > modelo B" quando o medido
foi "modelo A sob a configuração C > modelo B sob a configuração C", e a
configuração C foi escolhida por acidente, por ser o default de quem rodou.

Isso não invalida os benchmarks existentes. Invalida a leitura deles como
ranking de modelos. A leitura honesta é mais estreita e mais útil: eles rankeiam
pares (modelo, configuração), e a configuração raramente é reportada com precisão
suficiente para reproduzir.

O que eu passei a fazer, e recomendaria: reportar a configuração inteira junto do
número, rodar pelo menos um sweep pequeno por modelo antes de comparar, e tratar
"qual parâmetro" como parte da escolha do modelo, não como detalhe de
implementação.

---

*Os números deste texto vêm dos relatórios brutos do experimento, recontados a
partir dos JSON de resultado e não das tabelas intermediárias — que, aliás,
tinham contagens dobradas em relação ao medido. O método de erro que produziu
isso está descrito em [Sete erros de medição que não levantaram exceção
nenhuma](/2025/09/sete-erros-de-medicao/).*
