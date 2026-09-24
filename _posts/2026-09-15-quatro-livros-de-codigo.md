---
title: "Cinco livros, quatro distâncias — parte 1: como o código deveria ser"
date: 2026-09-15 10:00:00 -0300
tags: [livros, arquitetura, segurança, python]
description: "Python Fluente, Clean Architecture e Secure by Design olham o mesmo código de três distâncias — a linha, o sistema e o adversário. Os três dizem como o código deveria ser; a quarta distância, na parte 2, diz que seu palpite sobre o seu código está errado."
---

Lista de "livros que todo programador deve ler" é barata — normalmente é o mesmo
punhado de títulos repetido sem que ninguém diga o que muda depois de lê-los. Os
cinco aqui têm uma relação entre si que raramente se aponta: **não competem**.
Cada um olha exatamente o mesmo código de uma distância diferente, da linha que
você acabou de digitar até o histórico de cinco anos do repositório — e os dois
últimos, do mesmo autor, ocupam a mesma distância, um continuando o outro.

E há uma tensão boa entre eles. Os três primeiros dizem como o código *deveria*
ser. A última distância diz que a sua opinião sobre qual parte do *seu* sistema
está pior provavelmente está errada — e mostra como medir.

<!--more-->

| Distância | Livro | A pergunta que responde |
|---|---|---|
| A linha | Python Fluente | Estou usando a linguagem ou lutando contra ela? |
| O sistema | Clean Architecture | O que aqui é decisão e o que é detalhe? |
| O adversário | Secure by Design | Este bug consegue sequer existir? |
| A história | Your Code as a Crime Scene | Onde dói de verdade neste repositório? |
| A história, mais longe | Software Design X-Rays | E quanto disso é problema de código, afinal? |

Esta parte cobre as três primeiras distâncias. A última — a que mede em vez de
prescrever — fica na [parte 2](/2026/09/quatro-livros-de-codigo-parte-2/), junto
com a ordem de leitura e os dados bibliográficos dos cinco.

## A linha: *Python Fluente*

O livro do [Luciano Ramalho](https://github.com/ramalho) parte de uma ideia que
reorganiza tudo o que vem depois: Python é uma linguagem **pequena e coerente**,
desde que você entenda o *data model*. Os métodos com underscore duplo — `__len__`,
`__iter__`, `__enter__` — não são truques esotéricos. São o protocolo que o próprio
interpretador usa. Quando você implementa `__len__`, não está "sobrescrevendo uma
função mágica": está entrando no mesmo contrato que `list` e `dict` cumprem.

O que muda depois de ler: você para de escrever Python como se fosse Java com
outra sintaxe. Deixa de criar `get_length()` e passa a implementar `__len__`.
Deixa de percorrer índices e passa a escrever geradores. Não é questão de estilo —
é código que se encaixa nas ferramentas da linguagem em vez de correr por fora
delas.

O que ele **não** é: um primeiro livro de Python. São cerca de mil páginas na
segunda edição, e elas pressupõem que você já escreve Python e quer escrever
melhor. Quem está começando vai se afogar.

E aqui está o melhor detalhe, que quase ninguém no Brasil sabe: **a segunda edição
em português é gratuita e legal**. Quando entregou o manuscrito, Ramalho negociou
com a O'Reilly a liberação da tradução brasileira sob licença aberta; a editora
que publicou a primeira edição não quis seguir nesses termos, e o texto completo
foi para o ar em [pythonfluente.com](https://pythonfluente.com/2/), traduzido por
Paulo Cavalcanti, sob Creative Commons BY-NC-ND. Um livro de mil páginas, em
português, de graça. Não há desculpa.

## O sistema: *Clean Architecture*

O objetivo que Robert C. Martin declara não é elegância — é **minimizar o esforço
humano** para construir e manter um sistema. E o que consome esse esforço tem
nome: acoplamento a decisões prematuras. Uma decisão é prematura quando não tem
nada a ver com a regra de negócio: o framework, o banco, o servidor web, o
injetor de dependência.

A carga útil é **a regra de dependência**, e ela é mais sutil do que o resumo
comum sugere. Não é "camadas". É a observação de que duas coisas que parecem uma
só andam em sentidos diferentes:

> *Data flows and source code dependencies do not always point in the same
> direction.*

{% include diagrama-regra-de-dependencia.html %}

O dado vai da entrada ao banco. A dependência de código vai no sentido oposto: a
borda conhece o núcleo, e o núcleo não conhece ninguém. Quando isso se sustenta,
o banco e o framework viram decisões adiáveis — dá para rodar e testar a política
central sem subir nada.

O que me surpreendeu ao reler é o quanto o livro é **operacional** onde eu
esperava abstração. "Nível" não é metáfora; tem definição que ordena módulos:

> *The farther a policy is from both the inputs and the outputs of the system,
> the higher its level.*

Disso sai um corolário contraintuitivo — **entidades são de nível mais alto que
casos de uso**, porque entidades generalizam entre aplicações e casos de uso são
específicos de uma.

E o teste mais barato do livro cabe numa linha de código. Isto é arquitetura
errada:

```
function encrypt() { while(true) writeChar(translate(readChar())); }
```

A função de alto nível menciona `readChar` e `writeChar`. Traduzindo para o seu
código: **qualquer função de orquestração de domínio que chama `requests.get` ou
`session.execute` diretamente tem essa forma.** É um grep, não um julgamento.

A parte sobre banco de dados é onde mais gente entende errado, e o livro se
antecipa:

> *I am not talking about the data model. The structure you give to the data
> within your application is highly significant to the architecture. But the
> database is not the data model.*

O modelo de dados é arquitetural; o RDBMS é detalhe. Daí sai uma proibição
concreta e verificável: passar linhas e tabelas do banco como objetos pelo
sistema é **erro de arquitetura**. O critério prático não é "ORM sim ou não" — é
onde o objeto de linha pode aparecer. Confinado a repositórios que devolvem
estruturas simples, tudo bem. Circulando dentro da regra de negócio, não.

O capítulo de que mais gosto é aquele em que Martin **perde uma discussão e
concorda com quem ganhou**. Ele brigou contra colocar um banco relacional num
sistema que não precisava, estava tecnicamente certo, e escreve:

> *They were absolutely right and I was wrong. Not for engineering reasons, mind
> you: I was right about that.*

O cliente queria o banco como item de checklist comercial. A conclusão dele é a
lição: quando o requisito é político e não técnico, a resposta arquitetural é
**satisfazê-lo atrás de um canal estreito**, mantendo o núcleo intacto — não
brigar. Vale igual para exigência de stack, de dashboard e de "tem que ter IA".

Fronteira, aliás, custa nos dois sentidos — construir cedo demais desperdiça, e
adicionar depois é caro mesmo com bateria de testes. O ofício está no timing: o
livro pede que você as implemente no ponto de inflexão em que o custo de não
tê-las passa o de tê-las. Isso é uma instrução de julgamento, não uma receita, e
é por isso que o livro se relê bem.

## O adversário: *Secure by Design*

Este é o menos conhecido dos cinco e talvez o que mais muda o dia a dia. A tese
dos autores é declarada logo no começo, e é quase provocativa:

> *We believe that in order to efficiently and effortlessly create secure
> software, you need to have a mindset that might be different from what you're
> used to — a mindset where you focus **more on design rather than on
> security**.*

O enquadramento que sustenta o livro inteiro cabe em cinco palavras: **segurança é
uma preocupação, não uma feature**. E o exemplo histórico que eles usam para isso
é ótimo — o assalto ao Öst-Götha Bank, em 1854. O banco investiu em fechaduras
impossíveis de arrombar. O ladrão arrancou as **dobradiças**. As features foram
entregues; a preocupação, não.

Por isso não há capítulo sobre firewall nem lista da OWASP para decorar. Há uma
pergunta repetida de forma implacável: este bug consegue sequer ser expresso no
seu modelo?

O conceito central são os **domain primitives**:

> *A value object so precise in its definition that it, by its mere existence,
> manifests its validity.*

Ou, curto: **se existe, é válido; se não é válido, não pode existir.** Em vez de
passar uma `String` chamada `email` por doze camadas e validar "em algum lugar",
você cria um tipo cuja invariante é verificada **na construção** — não depois, não
pelo chamador. A partir dali, todo código que o recebe já tem a garantia. A classe
inteira de bug some, não porque alguém lembrou de checar, mas porque não há como
escrever o estado errado.

A outra peça que uso toda semana é a **ordem canônica de validação**. Não é a lista
que importa, é a ordem — o mais barato e mais brutal primeiro, porque cada etapa
custa mais que a anterior e você não quer pagar a cara para lixo óbvio:

| | Etapa | O que checa |
|---|---|---|
| 1 | Origem | o remetente é legítimo? |
| 2 | Tamanho | o payload tem magnitude razoável? |
| 3 | Léxico | os caracteres e o encoding são dos tipos permitidos? |
| 4 | Sintaxe | a estrutura está bem formada? |
| 5 | Semântica | o conteúdo *significa* algo válido? |

Só a etapa 5 consulta o banco. Validar semântica antes de tamanho é como conferir
a assinatura de um documento de dois gigabytes antes de perguntar por que ele tem
dois gigabytes.

Há ainda o **read-once object** para valor sensível — senha, token, credencial.
Leitura destrutiva e atômica, `__repr__` mascarado para o valor não vazar por log
ou stack trace, e serialização bloqueada para não escapar por pickle ou JSON. Três
mecanismos, cada um fechando um vazamento diferente, e os dois últimos são
exatamente os que a gente esquece.

Uma honestidade que o livro merece e que aprendi na prática: **validar no
construtor não basta se a forma da validação estiver errada**. Já vi um validador
de CPF que fazia `if len(cpf) > 11: raise` e logo em seguida `cpf.zfill(11)` — só
barrava o comprido, e completava o curto em silêncio. `'123'` virava documento
válido. O tipo existia, a invariante existia, e o bug passava. "Domain primitive"
não é garantia automática; é um lugar onde a garantia *pode* morar.

Ressalvas: os exemplos são em Java e C#, o que afasta parte de quem programa em
Python ou Go — embora a ideia atravesse linguagem sem esforço. São 400 páginas,
e não há edição em português.

## O que fica para a parte 2

As três distâncias acima têm uma coisa em comum: elas dizem como o código
**deveria** ser. São prescrições — a regra de dependência, o estado inválido
inexprimível, o data model da linguagem — e todas valem para código em geral.

A quarta distância faz o oposto. Ela não prescreve nada: pega o **seu**
repositório, lê o histórico dele, e responde onde dói de verdade. E a resposta
costuma contradizer o seu palpite, que é justamente o que a torna útil.

É o assunto da [parte 2](/2026/09/quatro-livros-de-codigo-parte-2/), com os dois
livros do Adam Tornhill, a ordem de leitura que eu recomendaria e os dados
bibliográficos dos cinco.
