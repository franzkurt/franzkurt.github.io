---
title: "Difusão num laptop: o custo é constante, e isso não basta"
date: 2026-10-01 09:00:00 -0300
tags: [ia, difusão, medição, experimento, llama-cpp]
description: "Modelo de difusão custa o mesmo para 32 ou para 512 tokens — medido, não teorizado. A vantagem existe e é inalcançável: o cruzamento fica 11× acima do teto do modelo, e manter a qualidade faz os steps escalarem junto."
---

Modelo de linguagem por difusão tem uma propriedade que soa como vantagem óbvia:
ele não gera token a token. Refina um bloco inteiro mascarado, N vezes. Se o custo
é por passo de refinamento e não por token, então **gerar mais texto deveria ser
de graça** — e existiria um comprimento a partir do qual a difusão ganha do
autorregressivo.

Medi isso numa máquina de 16 GB, com os pesos que existem hoje em GGUF. A primeira
metade se confirma de forma bonita. A segunda não sobrevive ao contato.

<!--more-->

## O que rodou

O llama.cpp suporta três arquiteturas de difusão — `llada`, `llada-moe` e `dream`
—, e há GGUF abaixo de 9 GB para as três:

| modelo | Q4_K_M | arquitetura |
|---|---|---|
| `LLaDA-8B-Instruct` | 4,6 GB | `llada` |
| `Dream-v0-Instruct-7B` | 4,4 GB | `dream` |
| `LLaDA-MoE-7B-A1B-Base` | 4,2 GB | `llada-moe` |

Medi os dois primeiros, com `--temp 0.0 --seed 42` — determinístico, o mesmo
comando devolve a mesma saída byte a byte. O comparativo autorregressivo é um 9B
servido pelo Ollama.

## O custo é constante no comprimento — confirmado

Este é o resultado limpo do trabalho:

| geração pedida | difusão (128 steps) | autorregressivo |
|---|---|---|
| 32 tokens | **248 s** | 8,5 s |
| 128 tokens | **246 s** | 6,2 s |
| 512 tokens | **247 s** | 19,4 s |

Três pedidos de comprimento muito diferente, **o mesmo tempo**: 248, 246, 247
segundos. O custo da difusão é `steps × forward do bloco`. Quantos tokens saem
daquele bloco não entra na conta.

Medido por step: **~1,9 s/step** no LLaDA. E aqui aparece a diferença entre
arquiteturas: o `Dream-v0-Instruct-7B` custa **1,58 s/step** — 20% mais rápido,
apesar de as duas gerações serem comparáveis e de ele ser 7B contra 8B.

## O sinal que eu li errado

Repare na coluna do autorregressivo acima: 8,5 s para 32 tokens, **6,2 s** para
128. Tempo caindo enquanto o comprimento cresce.

Isso é impossível, e eu passei direto. A causa: `-n`/`num_predict` é **teto, não
alvo** — o modelo para no stop token antes de chegar lá. Medido pela API,
`-n 512` gerou 443 tokens com `done_reason=stop`. Aqueles 8,5 s não eram geração,
eram warm-up do carregamento.

Refeito com contagem real por `eval_count`/`eval_duration` e prompt que força
saída longa, a taxa do autorregressivo é **27,5 tok/s, estável**. A coluna da
difusão não muda — ela não tem stop token, roda os N steps sempre.

Deixo a tabela contaminada no texto de propósito. O número impossível estava à
vista desde o início e eu segui em frente; é assim que erro de medição sobrevive.

## O cruzamento: existe, e não dá para chegar nele

Com a taxa corrigida, o cruzamento sai onde a aritmética manda: **~5.900 tokens**.
Abaixo disso o autorregressivo ganha; acima, a difusão.

O `max_length` do LLaDA é **512**. O cruzamento está **11× acima do que o modelo
consegue gerar**. O teto é do modelo, não da ferramenta — não há flag que
resolva.

E há um segundo motivo, mais interessante que o primeiro, porque não se conserta
trocando de pesos: **manter a qualidade faz os steps escalarem junto com o
comprimento**. Em 512 tokens com 128 steps a saída já quebra — código com aspas
inválidas e um teste que afirma que o reverso de `"world"` é `"world"`. Subir para
512 steps arrumaria? Talvez, mas 512 steps não terminaram em 15 minutos de
execução.

Ou seja: a região em que a difusão ganharia tempo é exatamente a região em que
ela precisa de mais steps para não degradar — e o custo é linear em steps. A
vantagem de custo constante **só vale enquanto os steps ficam constantes**, e eles
não ficam.

Para conversa normal o veredito é direto: 245 s para uma resposta correta contra
7,8 s do autorregressivo, **~31× mais lento** na configuração que produz algo
utilizável. Com 32 steps cai para 64 s e a saída fica ilegível.

## O que eu não consegui medir

A pergunta que motivou tudo era outra: **a razão steps/token é o invariante?** Ou
seja, 128 steps para 128 tokens degradaria igual a 32 steps para 32 tokens?

Não respondi. Vale dizer por quê, porque o motivo é instrutivo.

Eu precisava de um eixo de comprimento controlável. `-n` é ignorado nesse caminho
da CLI. Troquei por `--diffusion-block-length` e validei a troca — mas
`block_length` é a **granularidade do denoising**, e a CLI encadeia blocos até
esgotar o `-n`. Com block length 32 saíram 156, 320 e 336 tokens em probes
diferentes. O denominador nunca esteve sob controle, então a razão nunca pôde ser
calculada.

O experimento parou em 5 de 8 probes, por custo: 512 steps custam 859 s, e os
comprimentos restantes somariam mais uma hora de inferência para responder uma
pergunta cujo eixo eu já sabia mal definido. Gastar essa hora seria comprar
número, não resposta.

## O que sobrou, e é sólido

Os 5 probes medidos responderam outra pergunta, essa com resposta limpa. Com
**orçamento de steps idêntico**, dobrar o bloco reduz muito a degeneração:

| steps | bloco 32 | bloco 64 | redução |
|---|---|---|---|
| 128 | 56,4 | 30,5 | 1,8× |
| 256 | 46,9 | **6,6** | **7,1×** |

*(defeitos por 100 tokens; menor é melhor)*

Sete vezes menos defeito no orçamento de 256 steps, a um custo de tempo
praticamente igual — 434 s contra 456 s, 5% a mais.

A leitura: com bloco pequeno o modelo faz o denoising de uma janela estreita por
vez e perde coerência **entre** blocos; é dali que vêm as repetições. A atenção
bidirecional sobre uma janela maior resolve mais contexto por step. Se você for
rodar difusão neste hardware, esse é o parâmetro que paga.

Uma ressalva que não posso omitir: **nenhuma das 5 saídas passou** no corte de
qualidade, que é 2,0 defeitos por 100 tokens. A melhor ficou em 6,6. Nesta
configuração, o LLaDA-8B-Instruct não produziu saída limpa em nenhum orçamento
que testei.

## O que mudaria o veredito

Nada disto é uma afirmação sobre difusão como arquitetura. É uma medição de dois
conjuntos de pesos, num hardware, num mês. O que mudaria:

- **Modelo com `max_length` maior.** O teto de 512 é o que impede chegar ao
  cruzamento — e é do modelo.
- **Hardware com mais paralelismo.** 1,9 s/step é o forward de um 8B em GPU
  integrada. Onde o step custar uma fração disso, a conta inteira se move, porque
  a difusão escala com steps e não com tokens.
- **Geração estruturada genuinamente paralela.** Escrever N arquivos
  independentes num denoise só é o caso em que a difusão teria vantagem
  *arquitetural*, não apenas aritmética. Exigiria um modelo treinado para isso;
  LLaDA e Dream são de propósito geral.

E há uma assimetria que não muda com hardware nenhum: **a difusão paga o custo
antes de saber se a resposta presta**. O autorregressivo para no stop token
quando terminou. A difusão roda os N steps sempre, inclusive quando a resposta
ficou pronta no step 40 e inclusive quando ela nunca vai ficar.
