---
title: "Diátaxis na era dos agentes: quatro documentos, não um"
date: 2026-08-18 18:00:00 -0300
tags: [documentação, escrita, agentes, ia]
description: "Um README costuma ter quatro intenções misturadas, e por isso nenhuma das quatro funciona. Cada tipo tem uma regra do que ele não pode fazer — e ignorá-las custa mais agora que boa parte dos leitores é máquina."
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
Este texto percorre os quatro com o que cada um **não pode** fazer — que é a
parte útil e a que quase todo mundo pula — e depois o que muda agora que boa
parte dos seus leitores não é humana.

<!--more-->

## Os dois eixos

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

## Tutorial: você é o professor, e a culpa é sua

> *A tutorial is an experience that takes place under the guidance of a tutor.*

A definição parece inofensiva e não é. Ela transfere a responsabilidade inteira
para quem escreve. No Diátaxis, o professor responde por tudo — o que o aluno vai
adquirir, quais atividades vai executar, e se vai dar certo. **A única
responsabilidade do aluno é prestar atenção.**

Isso tem três consequências duras:

**O tutorial tem que funcionar. Sempre, para todos.** Se falha em uma máquina com
uma versão diferente, o contrato se quebra — e o aluno conclui que o problema é
ele, não o texto. Tutorial é a única parte da documentação que precisa ser
testada como se fosse código.

**O tutorial não é lugar de explicação.** Essa é a regra que mais dói, porque a
vontade de explicar é enorme. Se no meio do passo a passo você escreve *"note que
usamos um ambiente virtual porque o Python instala pacotes globalmente por
padrão, o que causa..."* — pare. O aluno não tem contexto para absorver isso
agora, e o parágrafo o tira do fluxo de fazer.

**Ignore opções e alternativas.** Nada de *"você pode usar `venv` ou `uv` ou
`poetry`"*. Escolha uma, use, siga. Alternativa é decisão, decisão exige critério,
e o aluno ainda não tem critério nenhum — dar escolha a ele é transferir de volta
a responsabilidade que era sua.

E o tutorial precisa de **resultado visível cedo e com frequência**, para o aluno
ligar o que fez ao que aconteceu. Vinte minutos de configuração antes do primeiro
sinal de vida é um tutorial mal construído, ainda que tecnicamente correto.

## Guia prático: ação e só ação

O guia prático serve alguém **competente, com um problema concreto**. Ele já sabe
o que quer; precisa do caminho.

> *Assume the user knows what they want to achieve.*

A imagem que o Diátaxis usa é a receita de cozinha, e ela explica tudo. Uma receita
diz "refogue a cebola até dourar". Ela não ensina o que é refogar, não discute a
química da reação de Maillard e não oferece três cebolas alternativas. Quem está
com a panela na mão não quer aula.

O exemplo de contra-senso que eles dão é ótimo: um guia de "como consertar
vazamento na torneira" que começa explicando **"gire a torneira no sentido
horário para fechar a água"**. Quem chegou até esse guia sabe fechar torneira.

Há uma orientação de título que é pequena e resolve metade dos problemas de
navegação:

| Título | Veredito |
|---|---|
| "Como integrar monitoramento de performance" | bom — diz o que resolve |
| "Integrando monitoramento de performance" | ambíguo — é guia ou explicação? |
| "Monitoramento de performance" | ruim — não se sabe o que o texto faz |

Comece com **"Como..."**. Não é estilo: é o que permite a alguém varrer um índice
e achar o seu problema.

Uma última regra, e é a que separa guia bom de guia inútil: **o guia trata de
problemas do mundo real, não de máquina**. "Como fazer deploy em produção com
rollback" é um problema. "Como usar o comando `deploy`" é documentação de
máquina disfarçada de guia — isso é referência.

## Referência: um mapa, não um roteiro

> *A map tells you what you need to know about the territory, without having to
> go out and check the territory for yourself; a reference guide serves the same
> purpose for the product.*

Referência é a parte que se **consulta**, nunca se lê de ponta a ponta. E o
Diátaxis é duro com o tom dela: deve ser **austera e intransigente** —
neutralidade, objetividade, factualidade. A função é dar ao leitor *"verdade e
certeza — plataformas firmes sobre as quais se apoiar enquanto trabalha"*.

A regra é **descrever, e só descrever**. O erro característico é achar que
descrição pura é insuficiente e temperar com instrução: a página que documenta o
parâmetro `timeout` e emenda *"recomendamos 30 segundos na maioria dos casos"*.
Recomendação é guia prático. Ponha um link.

Duas coisas que valem saber:

**A estrutura da referência deve espelhar a estrutura do produto.** Se o código
tem módulos, a referência tem seções por módulo. Não se inventa organização para
referência — a organização já existe, e inventar outra obriga o leitor a manter
dois mapas na cabeça.

**Documentação gerada automaticamente é referência, e só isso.** Muita gente
gera o Sphinx ou o `godoc` e considera a documentação pronta. Está pronta uma das
quatro. A gerada é excelente naquilo que faz e não substitui nenhuma das outras
três, porque ela **não sabe** por que as decisões foram tomadas nem o que alguém
está tentando conseguir.

## Explicação: a mais difícil, e a que só você pode escrever

Explicação é orientada ao entendimento. Ela se lê longe do teclado — a atividade
associada não é fazer nem consultar, é **refletir**.

Três coisas que ela faz e nenhuma das outras faz:

- **Estabelece conexões.** Com outros assuntos, inclusive fora do imediato: por
  que esta escolha se parece com aquela outra, o que a decisão tem a ver com o
  modelo de concorrência.
- **Dá contexto e história.** Por que foi feito assim, que restrição existia, o
  que foi descartado.
- **Admite opinião e perspectiva.** É o único dos quatro em que isso é legítimo.
  "Achamos que essa abordagem é superior porque..." não cabe em referência e cabe
  aqui.

E é a mais difícil de escrever por um motivo estrutural, não por falta de talento:
**ela não tem fronteira natural**. O tutorial acaba quando o aluno aprendeu o que
se propôs. O guia acaba quando o problema foi resolvido. A referência acaba quando
o sistema acabou. A explicação não acaba nunca sozinha — quem escreve precisa
*decidir* onde ela termina, e essa arbitrariedade é desconfortável.

A dica de título ajuda a impor essa fronteira: use algo que aceite um **"sobre"**
implícito. "Sobre o modelo de autenticação" funciona; "Configurando autenticação"
não é explicação, é guia com roupa errada.

Vale o alerta sobre o custo de não escrevê-la. Sem explicação, a pessoa fica com
uma prática **ansiosa**: ela consegue executar, os comandos funcionam, e ela não
sabe por quê — então cada situação nova é um abismo. É o estado de quem copiou do
Stack Overflow e reza para não precisar mudar nada.

## Agora o que muda com agentes

Um humano lendo um README misturado faz uma coisa que nem percebe: ele **filtra**.
Passa os olhos, reconhece "isso é tutorial, não quero", pula adiante, encontra a
flag, segue a vida. A mistura custa atenção, mas o filtro é quase automático.

Um agente não filtra. Ele **recupera um trecho** e usa o que veio. Se o trecho
tem três intenções misturadas, ele não descarta duas — trata as três como
igualmente verdadeiras para a tarefa atual.

Por isso os quatro tipos deixam de ser cortesia com o leitor e viram
**arquitetura de contexto**. Documento de um tipo só é um trecho que se recupera
inteiro e se usa inteiro. Documento misturado é ruído com aparência de sinal.

E cada tipo tem um destino diferente:

**Referência é a que ele mais usa, e a que mais o quebra quando envelhece.** Um
humano que lê "a flag é `--parallel`" e encontra `--jobs` no `--help` percebe que
a documentação ficou para trás. O agente não percebe: escreve `--parallel`, com
confiança, e você recebe um erro que parece bug do seu código. Referência
desatualizada, para uma máquina, é indistinguível de referência correta.

**Guia prático é o que ele mais aproveita**, porque é o formato do trabalho dele:
uma tarefa concreta, um caminho, sem digressão. A regra "ação e só ação" é, por
acidente, a regra de ouro para escrever para agente.

**Explicação é o que impede o agente de redecidir.** Se o código tem uma escolha
deliberada e o motivo não está escrito em lugar nenhum, o agente vai encontrar a
escolha, achar que é descuido, e "consertar". Um parágrafo dizendo *"usamos fila
em vez de chamada direta porque o provedor derruba conexões acima de 30 s"* não
está lá para ensinar ninguém: está lá para que a decisão não seja desfeita por
alguém — humano ou não — que só vê o resultado e não vê a alternativa descartada.

Repare que é exatamente o tipo que as equipes mais deixam de escrever, por parecer
o menos urgente. Ele virou o mais caro de não ter.

## A armadilha do tutorial

E aqui as duas partes deste texto se encontram, porque o perigo do tutorial para
agentes é **consequência direta das regras dele**.

O tutorial simplifica de propósito — é a natureza dele. E como ele não pode
explicar nem oferecer alternativas, os avisos aparecem como prosa solta ao redor
do código:

> Para simplificar, vamos pular a autenticação neste exemplo.

> Aqui usamos SQLite; em produção você vai querer outra coisa.

> Não se preocupe com tratamento de erro por enquanto.

Um humano lê isso e registra. Um agente recupera o **bloco de código**, e o aviso
— que estava uma linha acima, em prosa — não vem junto ou não pesa o bastante. O
atalho pedagógico vira **código de produção**, com a autenticação pulada.

A defesa não é escrever menos tutorial. É garantir que o tutorial **nunca seja a
única fonte de um fato**. Se a única ocorrência de "como conectar ao banco" no seu
repositório está num tutorial que usa SQLite para simplificar, é isso que vai ser
copiado. A referência precisa existir, separada, dizendo o que é de verdade.

## No seu repositório, hoje

Se você mantém um `CLAUDE.md`, um `AGENTS.md` ou equivalente, ele provavelmente
tem a doença do README — com o agravante de ser carregado em **todo** contexto,
ocupando espaço mesmo quando nada ali é relevante.

Três ajustes que valem mais que reescrever tudo:

**Separe a referência e deixe-a exata.** Comandos, caminhos, nomes de variáveis,
versões. Sem prosa em volta. É o que mais se consulta e o que mais envelhece.

**Escreva datas absolutas.** "Vamos revisar no mês que vem" é inútil dois meses
depois, e um agente não tem como saber quando "o mês que vem" era. "Revisar em
outubro de 2026" continua legível para sempre. O mesmo vale para "recentemente",
"a versão nova" e "por enquanto".

**Prefira o exemplo executável à descrição em prosa:**

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

## Como aplicar sem parar tudo

A tentação, depois de ler o framework, é planejar a grande reorganização. O
próprio Diátaxis desaconselha, e com uma frase bem direta:

> *Don't try to work on the big picture. It's both unnecessary and unhelpful.*

O método proposto é um ciclo pequeno, repetido: **escolha alguma coisa** — uma
página, um parágrafo, uma frase, sem precisar mapear os problemas antes;
**avalie** se atende a uma necessidade e a qual dos quatro tipos pertence;
**decida uma única próxima ação**; **faça e publique**. Depois repita.

A ideia por trás é que a estrutura **emerge** das peças bem formadas, em vez de
ser imposta de cima. A documentação fica sempre completa em cada etapa, mesmo que
nunca fique pronta.

Isso encaixa bem com como uma base de código evolui, e evita o destino mais comum
de reorganização de documentação: o branch gigante que ninguém termina.

## Uma última distinção que vale

O Diátaxis separa duas qualidades, e a diferença é útil bem além de documentação.

**Qualidade funcional** é o que se mede contra o mundo: precisão, completude,
consistência, utilidade. São critérios independentes — um texto pode ser preciso
sem ser completo — e verificáveis.

**Qualidade profunda** é o que se mede contra a necessidade humana: o texto flui,
é agradável de usar, cai bem. Essas não se isolam uma da outra, e não se
verificam por lista. A analogia deles é roupa: qualidade funcional é aquecer e
não rasgar; qualidade profunda é cair bem e acompanhar o movimento. *"Your body
knows it."*

Eles são honestos sobre o limite do próprio framework: ele ajuda a alcançar a
segunda, mas não produz sozinho. Estrutura correta é condição, não garantia.

---

Vale terminar pelo que continua igual, porque é fácil tratar agente como leitor
exótico e reescrever tudo em função dele.

Não é exótico. É um leitor que **não estava na sala** quando a decisão foi
tomada, que não conhece o contexto óbvio e não pode perguntar. Isto é, exatamente
o mesmo leitor que você daqui a seis meses. A documentação que funciona para um
funciona para o outro, e sempre foi assim — a diferença é que agora o leitor sem
contexto chegou em volume, e escrever mal cobra mais rápido.

O Diátaxis não é sobre agentes. É que agentes tornaram caro continuar ignorando.
