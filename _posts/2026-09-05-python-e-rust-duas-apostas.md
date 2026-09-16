---
title: "Python e Rust: duas apostas opostas, e o que cada uma cobrou"
date: 2026-09-05 10:00:00 -0300
tags: [python, rust, arquitetura, engenharia, linguagens]
description: "A linguagem mais usada e a mais admirada escolheram o contrário uma da outra em quase tudo. E o desfecho tem ironia: as ferramentas de Python que mais crescem hoje são escritas em Rust."
---

Há um fato que resume bem o estado das duas linguagens em 2026: o **uv**, que
está ganhando a briga de quinze anos sobre empacotamento em Python, é escrito em
Rust. O **Ruff** também. O núcleo do Pydantic, o Polars, o orjson, os
tokenizadores do Hugging Face — todos Rust.

Não é coincidência nem moda. É consequência de decisões de projeto tomadas há
muito tempo, em direções opostas, e que cobraram preços diferentes. Este texto é
sobre quais foram essas decisões, o que cada uma comprou, e como elas acabam
aparecendo na arquitetura de projetos que nunca escreveram uma linha da outra
linguagem.

<!--more-->

## A aposta de cada uma

Vale começar pelo que cada linguagem está otimizando, porque quase tudo o que vem
depois deriva disso.

**Python otimiza o tempo entre ter uma ideia e vê-la rodando.** REPL, tipagem
dinâmica, baterias inclusas, nenhuma etapa de compilação. Você escreve três
linhas e tem resultado.

**Rust otimiza o tempo entre o código compilar e você confiar nele em
produção.** Se passou no compilador, uma classe inteira de erro não existe ali.
O custo está todo na frente.

Nenhuma das duas é melhor. Elas compram coisas diferentes com o mesmo dinheiro —
e é por isso que a comparação só fica interessante quando se olha **o que cada
uma cobrou**.

## Memória: quem decide, e quando

Python nunca te pede para pensar em memória. Contagem de referências mais coletor
de ciclos, e pronto. O preço dessa conveniência foi o **GIL**: se o refcount de
cada objeto é alterado o tempo todo, e várias threads fazem isso ao mesmo tempo,
ou se protege cada alteração — caro — ou se protege o interpretador inteiro com
uma trava só. O Python escolheu a trava, e conviveu com ela por trinta anos.

Rust faz a pergunta oposta, e faz cedo: **quem é o dono deste valor?** Não há
coletor. O compilador rastreia posse e empréstimo, e libera a memória no ponto
em que o dono sai de escopo. A pergunta não pode ser adiada, porque o programa
não compila enquanto ela não for respondida.

O efeito disso está medido, e em escala grande. O Google publicou os números do
Android depois de migrar parte do sistema para Rust: vulnerabilidades de
segurança de memória caíram de **mais de 75% do total para menos de 20%**, com
densidade cerca de **mil vezes menor** no código Rust que no equivalente em C e
C++. Dois números menos citados e igualmente interessantes: as mudanças em Rust
têm **um quarto da taxa de reversão** e passam **25% menos tempo em revisão de
código** — ou seja, o ganho não é só de segurança, é de velocidade de entrega.

E em dezembro de 2022 o kernel do Linux aceitou a infraestrutura inicial de Rust
na versão 6.1. Doze mil linhas, quase nada em termos práticos, e um sinal enorme:
o projeto mais conservador do mundo em compatibilidade abriu a porta.

## Erro: o que viaja invisível e o que o chamador precisa abrir

Aqui está, na minha opinião, a diferença que mais muda o desenho de um sistema.

Em Python, uma função que pode falhar tem exatamente a mesma assinatura de uma
que não pode. A exceção viaja por cima da pilha sem aparecer em lugar nenhum do
contrato. Quem chama pode tratar, e pode não saber que existe algo a tratar.

Em Rust, falhar é um **valor de retorno**. Uma função que pode falhar devolve
`Result<T, E>`, e o chamador não consegue chegar ao `T` sem antes lidar com o
`E`. O caminho de erro está no tipo, então aparece em toda revisão de código e
em todo autocompletar.

Vale notar que essa não é uma ideia de Rust. É a mesma que o *Secure by Design*
defende para qualquer linguagem, e que eu descrevi
[neste texto](/2025/10/secure-by-design-hamlet-negativo/): falha de negócio é
**resultado esperado**, não algo excepcional, e modelá-la como exceção é o que
faz dado sensível acabar em log. A diferença é que o Rust não deixa isso como
recomendação — fez disso o caminho padrão, e o caminho alternativo é que dá
trabalho.

A consequência arquitetural é concreta: em Python, o mapa de falhas de um sistema
não está em lugar nenhum; ele se descobre lendo o código ou em produção. Em Rust,
ele é a soma das assinaturas.

## Tipos: anotação que não obriga, tipo que carrega o projeto

As anotações de Python são objetos guardados num dicionário, e o interpretador
**não as verifica** — [escrevi sobre isso em
detalhe](/2026/08/tipos-em-python-por-dentro/). `def f(x: int) -> str: return x`
roda sem reclamar. Quem verifica é uma ferramenta externa que você escolhe
instalar.

Em Rust os tipos são a espinha do projeto. E a técnica que isso habilita tem
nome: **tornar o estado inválido inexprimível**. Em vez de um booleano `ativo` e
outro `cancelado` que podem ser verdadeiros ao mesmo tempo, um `enum` com três
variantes em que a combinação inválida simplesmente não existe. Sem `null`:
ausência é `Option<T>`, e o compilador cobra o caso vazio.

É — de novo — a mesma ideia dos *domain primitives*: se existe, é válido. Python
consegue chegar perto disso com esforço e disciplina; Rust chega por inércia,
porque o caminho preguiçoso é o correto.

## Concorrência: uma trava global e um sistema de tipos

Python passou três décadas com o GIL, e a saída começou a chegar agora. A
[PEP 703](https://peps.python.org/pep-0703/) trouxe o build sem GIL como
experimento no 3.13; a [PEP 779](https://peps.python.org/pep-0779/) o promoveu a
**oficialmente suportado** no 3.14, em outubro de 2025 — ainda como build
opcional.

Rust nunca teve esse problema porque codificou a resposta no sistema de tipos:
`Send` para o que pode ser movido entre threads, `Sync` para o que pode ser
compartilhado. Não são convenções nem documentação — são traits que o compilador
cobra. Compartilhar algo não seguro entre threads não é um bug difícil de achar;
é um erro de compilação.

E aqui a decisão de linguagem vira decisão de **arquitetura**, de forma bem
visível. Como Python não podia usar threads para CPU, o ecossistema inteiro
aprendeu a escalar por **processo**: workers do gunicorn, `multiprocessing`,
Celery, filas. Isso não é preferência estética — é contorno de uma trava, e ele
custa memória duplicada e serialização entre processos. Projetos em Rust resolvem
o mesmo problema com threads, dentro de um processo só, compartilhando memória.

Trinta anos de arquitetura de sistemas Python foram moldados por uma decisão de
implementação do interpretador.

## Ferramenta: a diferença que mais explica adoção

Se eu tivesse que escolher **um** fator para explicar a admiração por Rust, não
seria o borrow checker. Seria o Cargo.

Na pesquisa da Stack Overflow, Rust é a linguagem mais admirada com **72%**. E o
**Cargo é a ferramenta de infraestrutura mais admirada, com 71%** — praticamente
empatado com a linguagem. Isso diz muito: parte enorme do que as pessoas amam em
Rust não é a linguagem, é o fato de existir **uma** forma de construir, testar,
formatar, documentar e publicar.

Python fez o oposto, e não por escolha — por acúmulo. `distutils`, `setuptools`,
`easy_install`, `pip`, `virtualenv`, `venv`, `pipenv`, `poetry`, `pdm`, `conda`.
Cada um resolveu um problema real e nenhum resolveu todos, e quem chega na
linguagem precisa escolher antes de saber o suficiente para escolher.

Daí a ironia com que este texto começou. A ferramenta que está finalmente
unificando esse espaço é o [uv](/2026/09/uv-ruff-pyrefly-python-moderno/) — e ela
é escrita em Rust. Não por marketing: porque instalar pacotes é resolver
dependências, descompactar e escrever em disco em paralelo, e é exatamente o
trabalho que o Python faz mal e o Rust faz bem.

## Compatibilidade: a lição mais cara, e quem aprendeu com ela

O Python 3.0 saiu em **3 de dezembro de 2008**, descrito na época como o primeiro
release intencionalmente incompatível da linguagem. O Python 2.7 só chegou ao fim
da vida em **1º de janeiro de 2020**.

Onze anos e um mês de ecossistema partido ao meio. Bibliotecas mantendo duas
versões, empresas presas em 2.7 por dependências, e uma geração inteira de
tutoriais que não dizia para qual das duas servia.

Rust olhou para isso e desenhou a resposta: **edições**. A cada três anos — 2015,
2018, 2021, 2024 — a linguagem pode fazer mudanças incompatíveis. A diferença
está em três detalhes que resolvem o problema inteiro:

- A edição é declarada **por crate**, não pela instalação.
- Crates de edições diferentes **interoperam** no mesmo binário.
- O compilador continua compilando código de 2015.

Ou seja, a migração é incremental, por biblioteca, sem data-limite e sem
partir o ecossistema. É uma solução de engenharia para um problema social, e ela
existe porque alguém assistiu ao que aconteceu com o Python.

## Como isso molda a arquitetura dos projetos

Juntando tudo, a diferença mais profunda é **onde mora a arquitetura**.

Em Python, a arquitetura mora **em tempo de execução**. Duck typing significa que
o contrato entre duas peças é o conjunto de métodos que uma chama na outra, e
esse contrato não está escrito em lugar nenhum — está distribuído no código que
usa. Injeção de dependência é convenção. Teste substitui objeto por
*monkeypatching*.

A consequência prática é que **a suíte de testes carrega o peso que o sistema de
tipos não carrega**. Em projeto Python sério, o teste não é rede de segurança: é
onde a arquitetura é verificada. Quando a cobertura cai, não é a qualidade que
cai — é a especificação que some.

Em Rust, a arquitetura mora **nos tipos**. O contrato entre duas peças é uma
trait, declarada, verificada na compilação. O custo do desenho é pago antes da
primeira execução, e refatorar é um diálogo com o compilador: ele lista o que
quebrou, você conserta, e quando para de reclamar você terminou.

E há a pergunta da posse, que é a mais subestimada das duas. Rust obriga a
responder "quem é o dono deste dado?" no momento do desenho. Python permite adiar
para sempre — e a resposta adiada costuma aparecer como um objeto compartilhado
mutado por dois caminhos, às duas da manhã.

## O desfecho: a fronteira se moveu

O que aconteceu em 2026 não foi uma linguagem vencer a outra. Foi a fronteira
entre elas se mover para um lugar novo e bastante confortável: **Python na
borda, Rust no núcleo**.

Você escreve o script, o notebook, a API, a orquestração — em Python, porque é
onde a iteração rápida vale mais. E o pedaço que roda milhões de vezes, ou que
precisa de paralelismo real, ou que não pode ter falha de memória, vem de uma
extensão em Rust que você instala com `pip` e nunca vê.

É por isso que a lista do começo existe. E é por isso que a briga "qual
linguagem é melhor" envelheceu mal: a resposta prática é **as duas, em camadas
diferentes**, e o ponto de decisão virou onde traçar a fronteira.

## O que cada uma cobrou

Fecho com a conta, que é o que raramente se diz.

**O que Python cobrou:** correção adiada para tempo de execução, e portanto para
a sua suíte de testes e para os seus usuários. Trinta anos de arquitetura
distorcida por uma trava de interpretador. Quinze anos de fragmentação de
ferramenta. Onze anos de ecossistema partido por uma migração.

**O que Rust cobrou:** tudo demora mais no começo, inclusive as coisas que não
precisavam ser seguras. Um script de trinta linhas para ler um CSV e somar uma
coluna é desproporcionalmente mais caro em Rust, e nenhuma vantagem de
compilação paga isso. A curva de aprendizado é real e afasta gente que resolveria
o problema em Python numa tarde.

Nenhuma das duas contas está errada. Elas são o preço de apostas diferentes — e a
escolha madura não é entre as linguagens, é entre os preços, sabendo qual deles
você está disposto a pagar naquele pedaço específico do sistema.

## Referências

- [PEP 703 — Making the Global Interpreter Lock Optional](https://peps.python.org/pep-0703/) — a proposta que abriu o build sem GIL
- [PEP 779 — Criteria for supported status for free-threaded Python](https://peps.python.org/pep-0779/) — os critérios que tornaram o build oficialmente suportado
- [What Is Ownership?](https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html) — o modelo de posse do Rust, no livro oficial
- [Rust in Android: move fast and fix things](https://blog.google/security/rust-in-android-move-fast-fix-things/) — os números de segurança de memória citados
