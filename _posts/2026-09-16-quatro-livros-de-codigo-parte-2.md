---
title: "Cinco livros, quatro distâncias — parte 2: onde o seu código realmente dói"
date: 2026-09-16 10:00:00 -0300
tags: [livros, engenharia, arquitetura, python]
description: "Os três livros da parte 1 dizem como o código deveria ser. Os dois do Adam Tornhill dizem que a sua opinião sobre qual parte do seu sistema está pior provavelmente está errada — e mostram como medir."
---

A [parte 1](/2026/09/quatro-livros-de-codigo/) percorreu três distâncias do mesmo
código: a linha, com o *Python Fluente*; o sistema, com o *Clean Architecture*; e
o adversário, com o *Secure by Design*. Os três são prescritivos — dizem como o
código deveria ser, e valem para qualquer repositório.

Falta a quarta distância, e ela é de outra natureza. Não prescreve: **mede**. E o
que mede é o seu repositório, não código em geral.

<!--more-->
## A história: *Your Code as a Crime Scene*

Os três anteriores dizem como o código deveria ser. O Adam Tornhill faz outra
pergunta, e é por isso que ele é o mais interessante do grupo: **onde, neste
repositório específico, está o problema de verdade?**

Antes da resposta, a premissa — que já vale o livro. Se você fosse otimizar uma
única coisa no desenvolvimento de software, o que seria? A resposta convencional
é desempenho. A dele:

> *If we want to optimize any aspect of software development, then we should
> optimize for understanding. That's the big win.*

O raciocínio é direto: passamos mais tempo **entendendo** código existente do que
escrevendo código novo, e otimizar a atividade mais cara multiplica o ganho total.
E, num time ágil, não existe uma fase de manutenção lá na frente — quando começam
as mudanças no código já escrito? *"Iteration two, at the latest."* A manutenção
começa na segunda iteração, o que significa que se entra em modo de manutenção
imediatamente.

A resposta à pergunta de onde dói, por sua vez, não está no código que você lê.
Está no histórico do git. As técnicas centrais:

- **Hotspots** — cruzar complexidade com frequência de mudança. O módulo mais
  complexo do sistema, se ninguém encosta nele há três anos, não custa nada.
  O que custa é o arquivo complexo que muda toda semana. São coisas diferentes, e
  só a segunda merece refatoração. E a concentração é brutal: *"hotspots stretch
  across only 1 to 5 percent of the total codebase, yet that code is responsible
  for 25 to 75 percent of all bugs."* Um a cinco por cento do código carregando
  de um quarto a três quartos dos defeitos.
- **Change coupling** — arquivos que mudam **juntos**, commit após commit, mesmo
  sem nenhuma dependência declarada entre eles. É acoplamento invisível para o
  compilador e para a revisão de código, e visível no histórico.
- **Knowledge maps** — quem conhece o quê. Um módulo com autor único é risco
  organizacional, não técnico, e não aparece em nenhuma métrica de código.

O que ele tem de valioso é justamente **contradizer** os outros três. Clean
Architecture e Secure by Design te dão um ideal; a tendência natural é aplicá-lo
onde você *acha* que o código está ruim. E esse palpite é notoriamente ruim —
costuma apontar para o que você leu por último ou para o que te irritou na
semana passada. Tornhill troca o palpite por evidência: o repositório já sabe
onde dói, e você nunca perguntou.

Uma ressalva de honestidade: Tornhill é fundador e CTO do CodeScene, produto
comercial que faz exatamente essas análises. O livro não é um folheto — as
técnicas saem de `git log` e scripts, e dá para reproduzir tudo à mão — mas vale
saber de onde vem o entusiasmo.

## A mesma distância, mais longe: *Software Design X-Rays*

Três anos depois, Tornhill escreveu a continuação — e ela não repete o primeiro.
O *Crime Scene* te ensina a achar o hotspot. O *X-Rays* pergunta o que fazer com
ele, e chega a uma resposta que muda o endereço do problema.

O salto está num estudo da Microsoft que ele cita e que vale reler devagar:

> *The research shows that organizational factors are better predictors of
> defects than any property of the code itself, be it code complexity or code
> coverage.*

Número de autores, número de ex-autores, propriedade organizacional do módulo.
Esses fatores predizem defeito **melhor que complexidade e melhor que cobertura
de testes**. Se isso se sustenta no seu caso, então o arquivo cheio de bug talvez
não esteja pedindo refatoração — talvez esteja pedindo que menos gente mexa nele
ao mesmo tempo.

É por isso que ele é a mesma distância e não uma nova: continua olhando o
histórico. Só que agora enxerga, dentro dele, a organização que produziu o código
em vez de só o código.

O achado que mais me fez mudar de opinião, porém, é sobre duplicação — e
contradiz o reflexo de todo mundo que leu um livro de design:

> *Copy-paste isn't a problem in itself; copying and pasting may well be the
> right thing to do if the two chunks of code evolve in different directions. If
> they don't — that is, if we keep making the same changes to different parts of
> the program — that's when we get a problem.*

Ou seja: **duplicação não é o defeito; co-mudança é**. Dois trechos parecidos que
seguem caminhos distintos estão certos como estão, e abstraí-los cria uma peça
com duas razões para mudar. Dois trechos que você sempre altera junto são o
problema, mesmo que não se pareçam em nada — e um detector textual não acha esse
caso, porque a semelhança está no `git log`, não no texto.

Repare como isso conversa com o *Clean Architecture*: lá, a orientação é traçar
fronteiras no ponto de inflexão do custo. Aqui está o instrumento que mede se
esse ponto chegou.

### A ressalva que o livro faz contra si mesmo

E agora a parte que me fez confiar mais nele, não menos. Munido de análises que
identificam quem escreveu o quê, com quanta dispersão, em quais módulos, a
tentação óbvia é usar isso para avaliar pessoas. Tornhill fecha essa porta:

> *Once someone starts to evaluate contributors, people adapt by optimizing for
> what's being measured. For example, if I'm evaluated on how many commits I do,
> I'll increase my number of commits. My commits will no longer carry any
> meaning, but my statistics "improve."*

A consequência que ele aponta é mais grave que o injusto: **a própria medição
deixa de funcionar**. O objeto medido muda de natureza ao ser medido, e você
perde o instrumento junto com a confiança do time.

Se você vai levar análise comportamental de código para dentro de uma empresa,
essa é a frase que precisa estar no primeiro slide, não numa nota de rodapé.

## Em que ordem ler

Se fosse recomendar uma ordem, inverteria a expectativa: **comece pela última
distância**. O *Crime Scene* é o único que fala do seu código, não de código em
geral. Uma tarde com `git log` e alguns scripts te diz quais três arquivos
concentram a dor do seu sistema — e aí os outros deixam de ser teoria e viram
instruções para um lugar específico.

Depois disso: *Clean Architecture* pela regra de dependência, *Secure by Design*
pela ideia de tornar o estado inválido inexprimível, e *Python Fluente* se o seu
dia a dia for Python — esse dá para ir lendo aos pedaços, por anos, e continua
rendendo.

O *X-Rays* eu deixaria por último, e não por ser o menos importante. Ele responde
uma pergunta que só aparece depois que as outras foram respondidas: você já sabe
onde dói, já sabe qual fronteira faltou, já tentou consertar — e o problema
voltou. É aí que a resposta "não era o código, era quanta gente mexia nele ao
mesmo tempo" faz sentido, e não antes.

## Os dados dos cinco

| Livro | Autor(es) | Editora, ano | ISBN |
|---|---|---|---|
| [*Fluent Python*, 2ª ed.](https://www.fluentpython.com/) | Luciano Ramalho | O'Reilly, 2022 | 978-1492056355 |
| [*Clean Architecture*](https://www.pearson.com/en-us/subject-catalog/p/clean-architecture-a-craftsman-s-guide-to-software-structure-and-design/P200000009528) | Robert C. Martin | Prentice Hall, 2017 | 978-0134494166 |
| [*Secure by Design*](https://www.manning.com/books/secure-by-design) | Deogun, Bergh Johnsson, Sawano | Manning, 2019 | 978-1617294358 |
| [*Your Code as a Crime Scene*, 2ª ed.](https://pragprog.com/titles/atcrime2/your-code-as-a-crime-scene-second-edition/) | Adam Tornhill | Pragmatic Bookshelf, 2024 | 979-8888650325 |
| [*Software Design X-Rays*](https://pragprog.com/titles/atevol/software-design-x-rays/) | Adam Tornhill | Pragmatic Bookshelf, 2018 | 978-1680502725 |

Em português: [*Python Fluente*, 2ª edição](https://pythonfluente.com/2/), tradução
de Paulo Cavalcanti, gratuita sob Creative Commons; e *Arquitetura Limpa*
(Alta Books, 2019). *Secure by Design* e os dois do Tornhill só existem
em inglês.
