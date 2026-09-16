---
title: "Sete erros de medição que não levantaram exceção nenhuma"
date: 2025-09-06 09:00:00 -0300
tags: [engenharia, medição, experimento, ia, notas]
description: "O erro perigoso num experimento não é o que quebra — é o que devolve número plausível. Sete deles, de uma investigação só: cinco produziriam conclusão coerente e falsa, e um confirmaria exatamente a negação da hipótese testada."
---

O bug que quebra é barato. Ele para o programa, aparece no log, alguém conserta.
O caro é o outro: o que devolve um número **plausível**, passa por toda a
pipeline, entra numa tabela e vira conclusão.

Este texto é o registro de sete erros desse tipo, todos cometidos numa
investigação só — medições de desempenho e qualidade de modelos de linguagem
rodando em máquina local. Nenhum dos sete levantou exceção. Todos devolveram
número. **Cinco teriam produzido uma conclusão coerente e errada**, e um deles
teria confirmado precisamente a negação da hipótese que o experimento existia
para testar.

Publico os erros antes dos resultados de propósito. Medição sem relato de erro é
pedir confiança sem oferecer nada em troca.

<!--more-->

## O arranjo, antes dos erros

Vale descrever o experimento, porque quatro dos sete erros são consequência
direta de como ele foi montado — e não fazem sentido no vazio.

Eu estava atrás de duas perguntas. A primeira: **parâmetros de inferência mudam
o acerto num conjunto de avaliações com gabarito?** A segunda: **como um modelo
de difusão se compara a um autorregressivo** para a mesma tarefa, no mesmo
hardware.

Tudo rodou numa máquina só, com **16 GB de RAM**, sem API paga e sem nuvem. Essa
restrição não é detalhe de bastidor: ela é a causa do primeiro erro e o motivo de
metade das decisões de projeto.

**Do lado autorregressivo, o motor foi o [Ollama](https://ollama.com).** A
escolha é pragmática — ele resolve download, quantização e servidor num comando
só, e expõe uma API HTTP local. Os modelos avaliados foram quatro, de 8 a 9
bilhões de parâmetros, um de cada vez: carregar dois ao mesmo tempo não caberia.

Três detalhes do Ollama importam para o resto do texto:

**O `num_predict`**, exposto na linha de comando como `-n`. Ele parece dizer
"gere esta quantidade de tokens". Não é isso que ele faz, e o erro número 2 nasce
daí.

**A resposta da API traz `eval_count` e `eval_duration`** — quantos tokens foram
realmente gerados e quanto tempo a geração levou. Guarde esses dois campos; eles
voltam adiante, e o que eles têm a dizer é a parte mais desconfortável do texto.

**O default de contexto é baixo e o corte é silencioso.** Quando a conversa passa
do limite, o Ollama descarta o começo sem erro e sem aviso — o que, num
experimento com prompt longo, é uma variável escondida.

Já **do lado da difusão** não há Ollama: ele não executa esses modelos. O motor
foi a `llama-diffusion-cli`, um binário separado do llama.cpp, com uma interface
bem diferente — e é dessa diferença que saem os erros 4 e 5.

Por cima disso tudo, duas peças que eu mesmo escrevi: um **guard de RAM**, que
recusa qualquer modelo acima de 55% da memória física, e um **juiz determinístico
de qualidade**, para decidir sem humano e sem LLM se uma saída degradou. As duas
aparecem na lista de erros — o guard porque foi contornado, o juiz porque errou
nos dois sentidos antes de acertar.

## Os sete, em uma tabela

| # | O erro | O que devolveu em vez de exceção |
|---|---|---|
| 1 | Modelo de 14B carregado numa máquina de 16 GB | Matou um processo do usuário; a corrida seguiu |
| 2 | Tratar `-n` como número de tokens gerados | Taxa de tokens/s contaminada por warm-up |
| 3 | Corrida parcial sobrescreveu o relatório completo | 1/25 onde o medido era 21/25 |
| 4 | Usar `-n` como eixo de comprimento na difusão | Quatro medições do mesmo ponto, rotuladas 32/64/128/256 |
| 5 | Ler a geração em `stdout`, que tem 0 bytes | String vazia pontuada como 100/100 de degeneração |
| 6 | Juiz de qualidade com falso negativo, depois falso positivo | Código correto reprovado a 10,5/100 |
| 7 | Atribuir ao modelo o que era do parâmetro | "Esta variante do modelo é ruim" |

## O exemplar: o eixo que não era eixo

O quarto merece detalhe, porque é o mais instrutivo dos sete.

O experimento media a razão **steps por token** num modelo de difusão — quantos
passos de refinamento são necessários por token gerado para a saída não degradar.
A hipótese: essa razão é o invariante, não o número absoluto de steps.

Para variar o comprimento da geração, usei `-n`. É o que se usa em qualquer CLI
autorregressiva. Só que na `llama-diffusion-cli` quem dita o comprimento é
`--diffusion-block-length`; **`-n` é simplesmente ignorado nesse caminho**.

Medido: `-n 32` e `-n 128`, ambos com block length 32, produziram **as mesmas 30
palavras**.

Pare um segundo nessa consequência. Eu teria coletado quatro medições, rotuladas
32, 64, 128 e 256 tokens, que eram **o mesmo ponto medido quatro vezes**. A curva
sairia plana. Uma curva plana, nesse experimento, significa exatamente uma coisa:
que a razão steps/token *não* é invariante — que os steps necessários não
escalam com o comprimento.

Ou seja: o erro não ia produzir ruído. Ia produzir **a negação limpa e
convincente da hipótese que eu estava testando**, com quatro pontos alinhados
para sustentá-la.

O eixo correto é `--diffusion-block-length`, verifiquei, e ele se comportou como
eixo deve: 32 → 32 palavras, 128 → 429 palavras. Fim do erro número quatro.

Só que não. **A correção também estava errada**, e isso eu só descobri semanas
depois.

`--diffusion-block-length` não fixa o tamanho da saída: é a granularidade do
denoising. A CLI encadeia blocos até esgotar o `-n`. Com block length 32 saíram
156, 320 e 336 tokens em probes diferentes — o eixo continuava solto, agora por
outro motivo.

O que me convenceu da correção falsa foi o teste que usei para validá-la: rodei
com 8 steps. Com tão poucos steps a saída satura e o encadeamento de blocos não
aparece — o teste passou porque estava no regime em que o defeito é invisível.
Escolhi um caso de teste rápido e barato, e barato aqui significou *cego para o
que eu queria testar*.

A consequência é que a razão steps/token, a pergunta original do experimento,
**segue sem resposta**: o denominador nunca esteve sob controle. O que saiu dali
foi outra coisa, limpa e menor, que conto em outro texto.

Este é o erro do qual eu menos gosto e o mais instrutivo dos onze: a correção de
um erro de medição é ela própria uma medição, e ninguém a submete ao mesmo rigor
que aplicou ao erro original. A sensação de ter consertado algo é anestésica.

## O sinal que estava à vista

O segundo erro tem uma moral diferente, e mais desconfortável: **a ferramenta me
dizia a verdade o tempo todo, em campos que eu não estava lendo.**

Tratei `-n`/`num_predict` como número de tokens a gerar. É **teto, não alvo** — o
modelo para no stop token antes de chegar lá. Medido pela API: `-n 512` gerou
**443 tokens**, com `done_reason=stop`.

Mas o tell veio antes disso, e era gritante: `-n 32` levou 8,5 s, e `-n 128` levou
6,2 s. **Tempo caindo enquanto o comprimento cresce.** Isso não é medição, é
warm-up — eu estava cronometrando o carregamento do modelo, não a geração.

Um número impossível apareceu na tela e eu segui em frente. A correção foi contar
por `eval_count`/`eval_duration` da própria API e usar prompt que force geração
longa de verdade. A taxa corrigida ficou em 27,5 tok/s, estável. E o ponto de
cruzamento entre difusão e autorregressivo, que dependia dessa taxa, saiu de
7.133 para cerca de 5.900 tokens — 17% de diferença numa conclusão que já estava
escrita.

## Quando o erro vira "reprovado"

O quinto é o mais sorrateiro da lista. A `llama-diffusion-cli` escreve **tudo em
stderr**: os logs e o texto gerado. O `stdout` tem 0 bytes.

Ler o stdout devolve string vazia. E string vazia, para o juiz automático de
qualidade, não é erro — é uma saída que ele pontua como **100/100 de
degeneração**. Reprovada.

O experimento inteiro teria concluído: "nenhum número de steps produz saída
aceitável, em nenhum comprimento". Um resultado negativo forte, publicável, e
inteiramente fabricado por um descritor de arquivo errado.

A categoria é a mesma do décimo erro, que nem entra na lista dos sete porque não
é sobre o experimento e sim sobre o portão: `make check_all | tail` devolve o
exit code do `tail`, não do `make`. Dois commits entraram com o portão vermelho —
um deles, ironicamente, com a mensagem "lição: encadear com `&&`", anulada pelo
próprio pipe que a acompanhava. Erro de instrumentação **no portão de qualidade**
é a categoria mais perigosa que existe: quebra justamente a máquina que detecta
quebras.

## O juiz que precisou ser julgado

Para decidir sem humano e sem LLM se uma saída degradou, escrevi um juiz
determinístico: quatro sinais de repetição, normalizados em defeitos por 100
tokens, com corte em 2,0. Um LLM-juiz estaria introduzindo a mesma classe de erro
que o experimento quer medir.

A primeira versão, com três sinais, deu **0,0** para isto:

> "Dead deadlock é uma situação de onde um ou mais processos ou threads não
> paisão esperando a outros por recursos."

Nenhuma palavra adjacente idêntica, nenhum trigrama em loop, nenhuma sílaba
duplicada — e obviamente quebrado. A degeneração aqui é de *proximidade*: a
mesma raiz reaparece perto demais. Daí o quarto sinal, `near_repeats`.

Que imediatamente reprovou **código correto**, a 10,5/100:

```python
def reverse_string(s):
    """Reverses the input string s."""
    return s[::-1]
```

`reverse_string` aparece no `def`, na docstring e na chamada. Isso não é
degeneração — é a aparência normal de código. Medir prosa e código com a mesma
régua reprova saída boa. A correção foi separar os dois antes de medir.

O detalhe que importa: um juiz com falso positivo **escolheria steps
artificialmente altos**. Ele reportaria saída boa como degradada, a busca binária
continuaria subindo, e o resultado publicado seria "difusão precisa de mais steps
do que precisa". Errado na direção que confirma o preconceito de quem mede.

## O oitavo, ainda aberto

Os sete acima estão corrigidos. Este não está, e é por isso que ele vale mais que
os outros juntos.

O juiz foi calibrado em cinco casos rotulados à mão, 5/5 de acerto, antes de ser
usado. Mas veja onde caem as notas:

| caso | taxa/100 tokens | veredito |
|---|---|---|
| prosa correta em inglês | 0,0 | aceita |
| código correto | 0,0 | aceita |
| degenerado em português | 5,6 | reprova |
| loop de sílabas | 62,5 | reprova |
| repetição de proximidade | 10,3 | reprova |

O corte está em 2,0. As amostras boas deram 0,0 e as ruins deram 5,6 ou mais.
**Não há uma única amostra calibrada na faixa entre 1 e 5** — que é exatamente
onde o corte mora e onde as decisões de verdade acontecem. O juiz está validado
nos extremos e não sabido no meio.

Há um segundo limite, esse conhecido e aceito: o juiz detecta degeneração
**formal**, não erro factual. Uma saída fluente e completamente errada passa. Para
o experimento de steps isso basta, porque o modo de falha da difusão com poucos
steps é a repetição, não a alucinação plausível. Mas é uma suposição, não um
resultado, e está aqui declarada como tal.

## O que muda depois disso

A conclusão prática dos sete não é "revise mais". É mais específica:

**O erro de medição não se detecta lendo o código.** Cada um desses sete estava
em código que eu tinha escrito, lido e considerado correto. Eles se detectam
quando um número impossível aparece — tempo caindo com comprimento crescente,
curva perfeitamente plana, código reprovado por um juiz de prosa — e alguém para
para perguntar *por que este número é possível*.

E o guard tem que morar no **ponto de entrada**, não dentro de um dos caminhos.
O limite de RAM do primeiro erro protegia quem entrava por um script; uma
inferência lançada por fora passou direto e estourou a memória de novo — não pelo
peso do modelo, mas porque sem `-c` explícito o servidor aloca o contexto de
treino inteiro em quatro slots, gigabytes de cache. A regra que sobrou é chata e
funciona: nenhuma inferência fora dos dois pontos de entrada que têm o guard.

Os resultados desta investigação vêm nos próximos textos. Eles só valem alguma
coisa se este aqui existir.
