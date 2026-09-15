---
title: "O Hamlet negativo: quando nada está quebrado e a empresa sangra dinheiro"
date: 2026-10-22 09:00:00 -0300
tags: [segurança, design, engenharia, ddd, arquitetura]
description: "Firewall certo, portas fechadas, sem SQL injection, sem XSS. E os clientes davam desconto a si mesmos comprando quantidades negativas. Secure by Design é sobre a falha que nenhum scanner acha, porque tecnicamente não há falha."
---

Uma rede internacional de varejo contrata uma equipe de segurança para auditar a
loja online. A equipe faz o de sempre: sonda os firewalls, varre portas abertas,
joga pacotes malformados no servidor web. Tudo se comporta. A infraestrutura está
sólida, o que não surpreende — hoje em dia é raro o problema estar ali.

Aí um dos testadores fica curioso com o campo **quantidade** do formulário de
pedido. Tenta um trecho de JavaScript, nada acontece. Tenta provocar SQL
injection, nada. Então digita `-1` na quantidade de um exemplar de *Hamlet* que
custa 39 dólares.

Ele acabou de tentar comprar um Hamlet negativo.

<!--more-->

## Ninguém reclamou

O pedido é aceito. Passa por todo o fluxo. Ele paga com cartão e recebe o e-mail
de confirmação. "Estranho", anota no caderno, e segue trabalhando.

Na tarde seguinte batem na porta da sala da equipe. Entra uma moça, hesitante.

> — Sou do financeiro, e queria saber se alguém aqui conhece uma pessoa chamada
> Joe Tester.

É o cliente de teste da equipe, eles respondem. O que houve?

> — Eu estava rodando o contas a receber e o sistema emitiu uma **nota de crédito
> de 39 dólares** para ele. Mas quando fomos enviar o livro, notei uma coisa
> esquisita no endereço do cliente: é o mesmo endereço da nossa matriz. Foi aí
> que desconfiei.

O sistema estava tentando **pagar dinheiro de verdade** ao Joe Tester.

Essa é a abertura de [*Secure by
Design*](https://www.manning.com/books/secure-by-design), de Daniel Deogun, Dan
Bergh Johnsson e Daniel Sawano. É um caso real de um cliente deles, com o ramo
trocado para preservar o sigilo — não eram livros, e eles fazem questão de dizer
que a Amazon teve um bug parecido lá por 2000.

## A parte que custa dinheiro

A nota de crédito, aliás, era a forma **menos** popular de explorar a falha.

Ao investigar as divergências de estoque, o time descobre o uso de verdade:
terminar as compras com alguns livros negativos no carrinho para **reduzir o
total antes de pagar**. Duzentos e quarenta e seis dólares em livros, mais um
Hamlet negativo, e a conta fecha em duzentos e sete.

O boato sobre a "funcionalidade estranha" tinha se espalhado. Muita gente usava.
A loja havia, sem querer, distribuído **vales-desconto de faça-você-mesmo**, e o
prejuízo foi significativo — e irrecuperável na prática, embora desse para
identificar quem tinha se beneficiado.

Agora repare no que **não** aconteceu. Nenhum invasor entrou. Nenhum dado vazou.
Nenhum certificado expirou. Nenhuma biblioteca tinha CVE. Nenhum log registrou
erro, porque **erro nenhum houve** — o sistema fez exatamente o que o código
mandava. As regras violadas não eram técnicas; eram regras de negócio. O livro
chama isso de **quebra de integridade de negócio**, e a observação incômoda é que
nenhuma ferramenta de varredura tem como encontrar.

## Segurança é uma preocupação, não uma feature

A tese do livro está na distinção entre as duas palavras, e a ilustração histórica
é de 1854.

Na noite de 25 de março daquele ano, o banco sueco Öst-Götha está prestes a ser
assaltado. O cabo Nils Strid e o ferreiro Lars Ekström chegam à porta. A porta
externa está trancada — mas a chave pende de um prego do lado de fora, para quem
souber onde olhar. O banco também tinha investido em fechaduras de altíssima
qualidade para o cofre, praticamente impossíveis de arrombar.

Os ladrões não arrombaram fechadura nenhuma. Tiraram a porta das **dobradiças**.

As features de segurança foram entregues, todas elas, com nota fiscal. A
preocupação com segurança não foi atendida. É a diferença entre ter itens numa
lista e ter a propriedade que a lista deveria produzir.

Daí vem a orientação que dá nome ao livro, e que parece contraditória à primeira
leitura:

> *We believe that in order to efficiently and effortlessly create secure
> software, you need to have a mindset that might be different from what you're
> used to — a mindset where you focus **more on design rather than on
> security**.*

Não há capítulo sobre firewall. Não há OWASP Top 10 para decorar. Há uma pergunta
repetida até virar hábito: **este bug consegue sequer ser expresso no meu
modelo?**

## Quantidade não é um número inteiro

Volte ao Hamlet negativo e pergunte onde estava o defeito. A resposta fácil é
"faltou validar a quantidade". A resposta do livro é outra: **quantidade estava
modelada como um inteiro**, e inteiro aceita `-1` porque é isso que inteiro faz.

A solução são os **domain primitives**:

> *A value object so precise in its definition that it, by its mere existence,
> manifests its validity.*

Em português direto: **se existe, é válido; se não é válido, não pode existir.**

São duas restrições, e as duas são obrigatórias. Primeiro, a invariante é
verificada **na criação** — não depois, não pelo chamador, não "em algum lugar da
camada de serviço". Segundo, primitiva de linguagem e tipo genérico ficam
**proibidos** para representar conceito de domínio. Nada de `int quantidade`,
nada de `String email`, nada de `Map<String, Object>` carregando um pedido.

Com um tipo `Quantity` que recusa valores fora da faixa no construtor, a loja não
precisa lembrar de checar em lugar nenhum. Não há onde o `-1` entrar. Nas
palavras do livro:

> *Using domain primitives removes a security vulnerability without the use of
> explicit countermeasures.*

Essa frase é o livro inteiro. A vulnerabilidade não foi **defendida**; ela deixou
de ser representável.

## A ordem importa mais que a lista

O outro trecho que uso toda semana é a ordem canônica de validação. A lista em si
é previsível; **a ordem é o ponto**, porque cada etapa custa mais que a anterior e
você não quer pagar a cara para lixo óbvio:

| | Etapa | Pergunta |
|---|---|---|
| 1 | Origem | o remetente é legítimo? |
| 2 | Tamanho | o payload tem magnitude razoável? |
| 3 | Léxico | os caracteres e o encoding são dos tipos permitidos? |
| 4 | Sintaxe | a estrutura está bem formada? |
| 5 | Semântica | o conteúdo *significa* algo válido? |

Só a etapa 5 encosta no banco. Validar semântica antes de tamanho é conferir a
assinatura de um documento de dois gigabytes antes de perguntar por que ele tem
dois gigabytes.

E vem junto uma regra curta que parece pedantismo e não é:

> *Repairing data before validation is dangerous and should be avoided at all
> costs.*

Sanitizar antes de validar permite que o atacante monte uma entrada que **se torna
maliciosa por causa do seu conserto**. Já vi a versão inocente disso num validador
de CPF: ele barrava a string comprida com `if len(cpf) > 11`, e logo em seguida
chamava `zfill(11)`, completando a curta em silêncio. `'123'` virava documento
válido. O tipo existia, a invariante existia, e o furo passava — prova de que
"domain primitive" não é garantia automática, é um **lugar onde a garantia pode
morar**.

## Falha de negócio não é exceção

Se eu tivesse que eleger um capítulo, seria este — e o argumento é desarmante de
tão simples:

> *Because exceptions represent something exceptional (the name kind of gives it
> away) and **failures are expected outcomes**, it doesn't make sense to model
> them as exceptions.*

Saldo insuficiente numa transferência é **comum**. Não é excepcional. Logo, não é
exceção — é um resultado possível da operação, do mesmo jeito que o sucesso é.

Até aqui parece questão de estilo. O que transforma isso em segurança é a
consequência. Se "nenhuma conta encontrada" (falha de negócio) e "banco de dados
fora do ar" (falha técnica) chegam como a mesma exceção, o único jeito de
distingui-las depois é **comparar a mensagem por string**. E aí:

> *But what happens if you change the message...? Won't that cause the exception
> to propagate out of the domain? It certainly will, and **this is how sensitive
> data often ends up in logs or accidentally being displayed to the end user.**

Design frágil se paga em vazamento. A regra derivada é mais dura do que parece:
**nunca inclua dado de negócio numa exceção técnica, seja ele sensível ou não** —
porque a classificação de sensibilidade muda com o tempo, e a exceção sobrevive a
ela.

E o fecho do capítulo é a parte que mudou como eu escrevo código:

> *Once you start designing both successes and failures as results, **the only
> exceptions that can still occur are those caused by either bugs or a violation
> of an invariant**.*

Exceção deixa de ser canal de controle de fluxo e vira **sinal puro de defeito**.
Se uma subiu, ou tem bug ou uma invariante foi violada. Não há terceira hipótese
a investigar.

## O ataque que não quebra nada

O conceito mais original do livro é também o menos conhecido, e é irmão direto do
Hamlet negativo: o **domain DoS**.

> *When exploiting domain rules, you're actually creating a domain DoS attack in
> which rules are executed **in a way that's accepted by the business**, but with
> malicious intent.*

O exemplo é um hotel com cancelamento gratuito até as 16h. Reserve todos os
quartos, cancele às 15h59. Custo zero para você, um dia inteiro perdido para o
hotel. Nenhuma regra foi quebrada — todas foram **seguidas**.

Não é hipótese de livro. A Lyft acusou a Uber de reservar e cancelar mais de
cinco mil corridas; a Uber processou a Ola por quatrocentas mil corridas falsas.

> *Domain DoS attacks are extremely difficult to detect because **there's no
> difference between benevolent and malevolent use of domain rules — it's only
> the intent that differs.***

Nenhum scanner acha. Nenhum WAF bloqueia. Nenhum pen test tradicional aponta.
Não há nada tecnicamente errado para apontar.

O que sobra é exercitar as próprias regras com má intenção, de propósito, e o
valor disso é indireto: *"by exercising domain rules in a malicious way, you gain
deeper understanding of weaknesses in the domain model — knowledge that could be
invaluable when designing alarms to trigger on thresholds and user behavior."* Ou
seja: você não vai fechar a brecha, porque ela é a regra de negócio. Vai aprender
**onde colocar o alarme**.

## A apólice grátis

O caso do capítulo de microsserviços vale o capítulo inteiro, e é sobre uma
palavra.

Uma seguradora separou o monolito em dois serviços, **Finance** e **Policy**. O
contrato entre eles: quando o Finance registra um `Payment`, o Policy emite a
apólice e manda pelo correio.

Entra o pagamento por boleto. O banco expõe três mensagens, e a documentação diz
que `Payment` significa "pagamento registrado". O time do Finance lê, conclui
razoavelmente que pagamento é pagamento, e mapeia direto.

| Mensagem do banco | O que parece | O que **significa** |
|---|---|---|
| `Payment` | "o pagamento está ok" | **nenhum dinheiro foi transferido ainda** |
| `Confirm` | "confirmação, tanto faz" | **o dinheiro foi transferido** |
| `Bounce` | — | a transferência falhou |

Resultado: apólices válidas emitidas para pagamentos que nunca se completaram.
Seguro de graça, para quem percebesse.

O diagnóstico é o que faz esse caso valer mais que a maioria dos textos sobre
microsserviços:

> *Going back to the individual systems, **none of them does anything that's
> unreasonable according to its domain**... It takes gathering our collective
> understanding of the subtleties, **looking at all three domains at the same
> time**, to see that this situation isn't sound.*

Cada serviço, isolado, está correto. Não há bug para achar em lugar nenhum. O
defeito mora **entre** eles, num nome que significa duas coisas.

E a causa raiz é organizacional: o medo de quebrar a dependência técnica levou o
time a reusar o termo `Payment` mesmo depois de o significado ter divergido — *"the
sad part is that this is exactly what messed things up."*

A prescrição é contraintuitiva e eu a adotei: **renomeie, e quebre o consumidor de
propósito.**

> *It's not desirable to break a technical dependency. But if that's what it takes
> to ensure that a crucial domain discussion happens, then it's worth it.*

Uma quebra de compilação é barata e acontece na sua frente. Um nome ambíguo é
caro e acontece em produção, seis meses depois, no contas a receber.

## O que o livro não é

Duas ressalvas honestas.

Os exemplos são em **Java e C#**, e são bastante orientados a objetos. Quem
programa em Python ou Go vai traduzir mentalmente o tempo todo — a ideia atravessa
sem esforço, o código não. São 400 páginas, e não há edição em português.

E ele não substitui o resto. Nada aqui te protege de uma dependência com CVE, de
um segredo commitado ou de uma porta aberta. O livro é explícito quanto a isso: o
que ele endereça é a classe de falha que as outras ferramentas **não conseguem
ver**, porque para elas não há falha nenhuma.

Que é exatamente o caso do Hamlet negativo. Firewall certo, portas fechadas, sem
injection, sem XSS, sem erro no log — e os clientes se dando desconto sozinhos,
por meses.

*Este texto aprofunda a seção sobre o livro em [Cinco livros, quatro distâncias do
mesmo código](/2026/09/quatro-livros-de-codigo/).*
