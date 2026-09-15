---
title: "Por que o Ollama não roda LLaDA, se os dois são GGUF"
date: 2026-10-08 09:00:00 -0300
tags: [ia, ollama, llama-cpp, difusão, gguf]
description: "O ollama create aceita o arquivo e o ollama run morre num GGML_ASSERT. A mensagem não explica nada, mas a causa é estrutural e vale para qualquer modelo de difusão: GGUF é container, não motor."
---

Se você tentou rodar um modelo de difusão — LLaDA, Dream, LLaDA-MoE — pelo
Ollama, provavelmente viu esta sequência: o `ollama create` aceita o arquivo sem
reclamar, e o `ollama run` morre em algo assim:

```
GGML_ASSERT(n_outputs_max <= cparams.n_outputs_max) failed
```

A mensagem não ajuda. Este texto existe porque a explicação é curta, é
estrutural, e eu não achei em lugar nenhum quando precisei dela.

<!--more-->

## GGUF é container, não motor

A confusão começa numa suposição razoável: "é um arquivo `.gguf`, o Ollama roda
`.gguf`, logo deve rodar".

Mas GGUF é um **formato de empacotamento** — pesos, tokenizador e metadados num
arquivo. Ele não carrega o grafo de execução. Quem decide se aquele modelo pode
ser executado é o runtime, olhando o campo `general.architecture` nos metadados e
procurando uma implementação correspondente.

Por isso os dois comandos se comportam diferente:

- `ollama create` **só lê metadados**. Ele empacota, registra, não executa nada.
  Por isso aceita.
- `ollama run` monta o grafo e aloca buffers. É aí que não existe implementação de
  difusão, e o assert estoura.

É a mesma relação entre um `.zip` e o programa que abre o que está dentro. O
formato ser compatível não diz nada sobre o conteúdo ser executável.

## O que o assert está dizendo

Vale ler o nome da variável, porque ele entrega a causa inteira:
`n_outputs_max` — o número máximo de saídas por forward pass.

Um modelo autorregressivo produz **um token por forward**. O runtime dimensiona o
buffer de saída para esse caso, porque é o único que ele conhece.

Um modelo de difusão não faz isso. Ele mascara um bloco inteiro e o refina N
vezes; cada forward devolve **o bloco todo** — 32 posições, ou 64, conforme a
configuração. O grafo tenta escrever 32 saídas num buffer dimensionado para 1, e o
assert dispara.

Não é bug, não é modelo corrompido, não é quantização errada. É o runtime dizendo
corretamente que não sabe executar aquela classe de modelo. O que falta é a
mensagem dizer isso em vez de mostrar uma comparação de inteiros.

## O que roda

O próprio llama.cpp tem suporte, num binário separado — `llama-diffusion-cli`,
que já vem na instalação padrão. Ele existe justamente porque difusão **não cabe
no caminho autorregressivo**: exige atenção bidirecional e amostragem própria.

São três arquiteturas de difusão suportadas hoje: `llada`, `llada-moe` e `dream`.

O comando mínimo:

```bash
llama-diffusion-cli -m llada-q4.gguf -p "..." \
  --diffusion-steps 32 --diffusion-block-length 32 -n 32 --temp 0
```

E aqui vai a armadilha seguinte, para poupar sua tarde. Sem
`--diffusion-block-length` **nem** `--diffusion-eps`, ele aborta com:

```
GGML_ASSERT((params.diffusion.eps == 0) ^ (params.diffusion.block_length == 0)) failed
```

É um XOR: exatamente um dos dois precisa ser diferente de zero. `eps` é o caminho
do Dream, `block_length` é o do LLaDA. Os dois zerados — o default — é erro, e a
mensagem não diz isso. Ela mostra a expressão que falhou e deixa você deduzir.

Outra coisa que vale saber ao chegar aqui: a geração sai em **stderr**, não em
stdout. O stdout tem 0 bytes. Se você for encanar isso num script, é o stderr que
você quer, cortando depois da linha `total time:`.

## Se você precisa da API do Ollama mesmo assim

Foi o meu caso: tinha código falando `/api/generate` e `/api/chat`, e não queria
reescrevê-lo para experimentar.

A saída foi um wrapper HTTP que expõe os mesmos dois endpoints e, a cada
requisição, chama a CLI. Funciona, e o custo é alto o suficiente para eu avisar:
**cada requisição recarrega os 4,6 GB do modelo**, porque a CLI não tem modo
persistente. Serve para experimentar sem tocar no cliente; não serve como
servidor de verdade.

## A generalização

O caso do LLaDA é particular, a lição não é: **compatibilidade de GGUF é
propriedade do runtime, não do arquivo**.

Antes de supor que um modelo novo roda na sua ferramenta, o teste barato é ler o
`general.architecture` do GGUF e procurar essa string no código do runtime. Se
ela não estiver lá, nenhum flag vai resolver — e o `create` aceitar não é
evidência de nada, porque ele nunca executou o grafo.
