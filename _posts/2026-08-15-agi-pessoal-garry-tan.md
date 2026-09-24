---
title: "O AGI pessoal de Garry Tan: a biblioteca e o bibliotecário"
date: 2026-08-15 10:00:00 -0300
tags: [ia, agentes, conhecimento, processo]
description: "O presidente do Y Combinator abriu o próprio sistema de conhecimento e disse que todo mundo deveria ter um. A tese se sustenta — e o ponto em que ela quebra é um parágrafo que dura meio minuto no meio da palestra."
---

Na Startup School de 2026, Garry Tan — presidente e CEO do Y Combinator — deu
uma palestra chamada
[Own Your Intelligence](https://www.ycombinator.com/library/WX-garry-tan-own-your-intelligence).
Ela dura quarenta minutos, está em inglês, e o conteúdo dela merece circular em
português, porque a tese é boa e o material prático é aproveitável por quem não
tem nada a ver com startup.

A palestra tem duas metades. A primeira é uma arquitetura, com o sistema dele
aberto no GitHub. A segunda é um argumento político sobre de quem é a sua
competência quando ela vira arquivo executável.

Este texto cobre as duas, e acrescenta o que eu acho que a palestra subestima.

<!--more-->

## A tese, em uma equação

Tan chama o que propõe de **AGI pessoal**, e faz questão de separar isso do que
as empresas vendem com nome parecido:

> Não quero dizer um chatbot que você paga vinte dólares por mês. [...] É só uma
> assinatura que você aluga. É um AGI corporativo que você não é dono. Ele
> **reseta quando você fecha a aba**. Ele sabe o que todo mundo já sabe.

A alternativa que ele descreve é *"um agente que roda na sua infraestrutura, lê
de uma memória que é sua, executa procedimentos que você escreveu, e **compõe**"*.
E a diferença que ele aponta entre os dois é a que importa: o corporativo melhora
quando a empresa lança alguma coisa; o seu melhora **todo dia que você usa**.

A equação, então:

> Um modelo de fronteira — **alugado**, comoditizado, mais barato a cada
> trimestre. Mais **o seu contexto** — seu, e idealmente de mais ninguém no
> mundo. Mais um *harness* que liga os dois.

Vale reter a assimetria, porque é o núcleo do argumento: **a qualidade do modelo
é alugada, o seu cérebro é próprio.** Os pesos são de todo mundo; a biblioteca é
sua.

## Sete coisas contra mil páginas

A arquitetura sai de uma observação sobre limites, e é a melhor parte didática da
palestra.

Um ser humano segura sete coisas na cabeça ao mesmo tempo — sete mais ou menos
dois, o artigo mais citado da psicologia cognitiva, e a razão de telefones locais
terem sete dígitos. Tan observa que **toda instituição que a humanidade construiu
é uma prótese para esse limite**: checklist, organograma, arquivo, reunião diária.

Um agente segura um milhão de tokens. Cerca de mil páginas — três livros do Harry
Potter abertos ao mesmo tempo, e ele acha a agulha em qualquer um dos três.

E aí ele vira a régua ao contrário, que é o movimento inteligente:

> Mil páginas é muito, mas também é muito pouco. Sua vida não são três livros.
> **Sua vida é uma biblioteca.**

Do que sai a pergunta que organiza o resto:

> A pergunta que determina se o seu agente é um gênio ou um peixinho dourado é
> esta: **o que decide quais três livros estão abertos na mesa?**

Note que a resposta não é o modelo. É a camada que escolhe o que carregar antes
de o modelo pensar. Tan chama o conjunto de **biblioteca mais bibliotecário**, e é
isso que o sistema dele, o **gbrain**, se propõe a ser: cerca de **220 mil
páginas** de Markdown, vinte e cinco anos de vida diarizados, compilados e
curados por agentes.

## O que é, na prática: Markdown

A parte anticlimática, e ela é de propósito. A implementação não tem banco
vetorial exótico nem framework proprietário:

> É basicamente arquivo de skill mais um navegador que os agentes conseguem
> dirigir. Páginas de inglês e um jeito de agir sobre o mundo. **Markdown, não
> mágica. Skills gordas, harness magro.**

E um *skill file*, no exemplo que ele mostra, é uma página de instrução em prosa:
quando uma gravação de reunião chegar, transcreva com rótulo de quem fala,
extraia os compromissos assumidos, quem assumiu e o prazo, confira cada pessoa
citada contra a biblioteca, arquive o resumo aqui e a transcrição ali, e **se
algo contradisser o que já acreditamos, sinalize — não sobrescreva**.

Daí sai o teste que eu achei o mais útil da palestra inteira:

> Se um estagiário esperto conseguiria seguir, um agente consegue executar.

E a afirmação que mais rendeu discussão: **"Markdown é código de verdade. Se você
consegue escrever instruções claras em inglês, você é um programador. O
compilador é um modelo de linguagem."** Ele conta que gente de mídia, eventos e
financeiro do YC — que nunca abriu um terminal — está escrevendo skill files.

## Latente e determinístico

Há um ponto técnico que ele afirma explicar *"toda falha de agente que eu já vi"*,
e eu concordo com a força da afirmação.

Existem dois lugares onde a computação pode acontecer, e confundi-los é o
problema. **Espaço latente** é onde vivem julgamento, gosto e a leitura do que
alguém quis dizer num pedido vago — isso mora no modelo, e você guia com um
arquivo Markdown. **Espaço determinístico** é aritmética, consulta SQL, contagem —
isso mora em código, que o Markdown chama.

O exemplo é ótimo porque é escalar: sentar cinco pessoas numa mesa é fácil e pode
ser latente. Montar a grade de horários de seis mil pessoas numa arena exige que
o agente **escreva código**, porque o modelo falha onde nós falhamos.

A regra derivada que eu tiraria disso, e que a palestra não enuncia: **número que
o código pode contar, o código conta**. Total escrito à mão em prosa envelhece em
silêncio, porque não se parece com saída de medição — parece decoração.

## A ressalva que dura vinte segundos

Entre a arquitetura e o como-fazer, há um parágrafo curto que, na minha leitura, é
a coisa mais importante da palestra — e ele passa rápido demais:

> Um brain que ninguém cura é **um depósito de lixo com busca ótima**. A
> recuperação vai trazer um fato velho com total confiança. Uma skill ruim
> codifica um processo ruim para sempre.

A prescrição vem junto, também de passagem: *"proveniência em cada fato, checagem
de contradição quando informação nova colide com a velha, e um bibliotecário cujo
trabalho de verdade é **podar**."*

Aqui está a minha divergência de ênfase, e é a razão de eu ter escrito este texto
em vez de só recomendar o vídeo.

**Esse parágrafo não é uma nota de rodapé. É o problema inteiro.**

O modo de falha de um sistema desses não é esquecer — é **lembrar com confiança
de algo que nunca foi verdade**. E recuperação não distingue as duas coisas: um
fato errado bem indexado chega com exatamente a mesma autoridade de um certo.
Pior, ele chega *mais* convincente, porque veio da sua própria biblioteca, e você
confia nela.

E há uma assimetria que a palestra não menciona. **Tudo no modelo escala menos a
verificação.** Ingestão escala, indexação escala, recuperação escala, redação
escala. Conferir se a afirmação bate com a fonte continua sendo alguém abrindo o
texto original e procurando a frase literal. É o gargalo, e ele não tem
automação — nem a promessa de uma.

Vale ser concreto sobre como o erro se parece, porque ele não parece erro. O caso
típico não é uma afirmação absurda: é uma afirmação **plausível e no espírito
certo da fonte**, com um número específico que a fonte não traz. O sinal de alerta
é fino: uma afirmação quantificada apoiada numa citação qualitativa. Se o trecho
que sustenta o "trinta por cento" não contém número nenhum, o número foi
parafraseado para dentro.

## O como-fazer, em cinco passos

Para quem quiser experimentar, a parte prática da palestra é curta e vale
traduzir:

1. **Hoje à noite:** escolha um *harness* e rode um agente na sua máquina.
2. **Neste fim de semana:** comece a biblioteca. Não um arquivo grandioso — uma
   pasta de Markdown. Uma página por projeto e por pessoa com quem você trabalha,
   com o que vocês estão construindo, o que ela valoriza, o que você deve a ela.
3. **A primeira skill:** pegue a tarefa que você faz toda semana e mais detesta.
   Explique em prosa, do jeito que explicaria a um amigo esperto no primeiro dia
   de trabalho. Deixe errar, corrija, e ponha cada exceção no arquivo.
4. **Vire rotina:** toda manhã às sete, faça isto. Toda sexta, resuma aquilo.
5. **Nunca faça trabalho avulso.** No fim de cada tarefa, extraia o que foi
   aprendido para um arquivo reutilizável.

O quinto é o que ele chama de disciplina que separa quem compõe de quem
brinca, e a regra é boa: **"se você precisou pedir a mesma coisa duas vezes, você
falhou."**

A curva prometida é honesta, o que é raro numa palestra de conferência: semana 1 é
um brinquedo e você conserta mais do que economiza; semana 4 o volante engata;
semana 12 a biblioteca responde antes de você terminar de perguntar. E *"a maioria
que tentar vai desistir na semana dois"* — que eu acho o dado mais realista do
conjunto.

## A segunda metade: de quem é a sua competência

A parte final da palestra é a mais forte, e não é técnica.

Uma skill, argumenta Tan, não é um documento. É **um pedaço da sua cognição
extraído da sua cabeça, escrito e executável**. E o mesmo arquivo é dois futuros
opostos dependendo de uma variável: quem o controla.

O exemplo é uma engenheira de suporte fictícia, Maya, que em dois anos ensina
quarenta skills aos agentes dela — como triar um incidente crítico às duas da
manhã, como segurar um cliente prestes a cancelar, como escrever um post-mortem
que de fato evita o próximo. Quarenta arquivos que são o julgamento dela, dois
anos de construção, num disco.

Se os arquivos estão no repositório **dela**, ela troca de emprego e leva junto:
chega no primeiro dia com anos de julgamento composto disponível. Se estão no
repositório **da empresa**, ela sai sem nada, e a empresa segue executando o
julgamento dela indefinidamente.

> Ela não teve uma carreira. Teve uma extração.

E o paralelo histórico fecha o argumento: artesãos eram donos das próprias
ferramentas, e era isso que os fazia livres. A fábrica quebrou isso, porque o
tear pertencia ao moinho. Quem trabalha com conhecimento se achava a salvo porque
suas ferramentas moravam na cabeça, onde ninguém confisca. **Skill file acaba com
essa proteção**: pela primeira vez, a sua cognição pode ser extraída, versionada e
possuída — e a única pergunta é por quem.

## O que eu acho que se sustenta, e o que não

**Se sustenta:** a assimetria entre modelo alugado e contexto próprio. Isso é
verdade e é subestimado. Cada modelo melhor que sai é um upgrade grátis para o
material que você já acumulou — desde que ele mereça ser consultado. A resposta
dele à objeção óbvia é a melhor frase da palestra:

> Isso não é só RAG? Claro. E Postgres é só árvore B. Recuperação é fácil. **Ser
> digno de recuperação é o produto.**

**Se sustenta também**, e merece crédito: ele desinfla o próprio número. Ao dizer
que produz 400 vezes mais que em 2013, ele mesmo aplica os descontos — *"assuma
que metade é andaime, assuma que estou me gabando"* — e chega a 8 vezes no piso.
Palestra que ataca o próprio dado antes que a plateia ataque é rara.

**Não se sustenta na proporção em que foi dito:** a curadoria como parágrafo de
vinte segundos. Se o modo de falha do sistema é lembrar com confiança de algo
falso, e se a única defesa conhecida é conferência manual contra a fonte, então
o custo real do AGI pessoal não é escrever a biblioteca — **é podá-la, para
sempre**. A palestra vende a parte que escala e menciona de passagem a parte que
não escala.

**E fica em aberto** a pergunta de escala: 220 mil páginas curadas por agentes,
com o dono tendo um emprego de tempo integral, só funciona se a curadoria
automática for confiável. Se for, é o resultado mais importante da palestra e
merecia mais que uma frase. Se não for, o número é impressionante pelo motivo
errado.

Nada disso desmonta a tese. Só realoca o trabalho: o difícil não é acumular, é
**duvidar** — e um sistema que só acumula fica melhor em lembrar, não em estar
certo.

---

*A palestra está no
[YC Startup Library](https://www.ycombinator.com/library/WX-garry-tan-own-your-intelligence),
com transcrição completa. O gbrain e o harness que ele usa estão abertos.*
