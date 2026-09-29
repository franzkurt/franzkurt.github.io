---
title: "GitHub Pages e Jekyll: o que cada um faz"
date: 2026-09-14 10:00:00 -0300
tags: [jekyll, github-pages, site-estatico, infraestrutura]
description: "Um site estático hospedado de graça, com build no servidor de outra pessoa. Este texto separa o que é Jekyll do que é GitHub Pages, mede o que esse arranjo entrega, e mostra as três armadilhas que me custaram tempo."
---

Este blog roda em GitHub Pages com Jekyll, e a pergunta que me fazem sobre isso
nunca é "como publico um artigo", é se vale a pena.

São duas coisas separadas que costumam ser citadas como uma só, e entender onde
uma termina e a outra começa é o que explica tanto as vantagens quanto as
limitações. Os números aqui foram medidos neste site.

<!--more-->

## Jekyll é o que transforma texto em site

Jekyll é um **gerador de site estático**. Você escreve em Markdown, ele aplica um
layout e cospe HTML pronto. Nada acontece quando alguém visita a página: o
arquivo já existe, inteiro, desde o momento do build.

É o oposto de um WordPress, onde cada visita dispara PHP, que consulta um banco,
que monta a página na hora. A troca é clara:

| | site estático | site dinâmico |
|---|---|---|
| quando a página é montada | uma vez, no build | a cada visita |
| o que o servidor precisa fazer | entregar um arquivo | rodar código e consultar banco |
| superfície de ataque | quase nada | aplicação, banco, plugins |
| conteúdo por usuário | não dá | é o ponto |

Um Markdown com este cabeçalho — o **front matter** — é tudo que Jekyll precisa:

```yaml
---
title: "O título"
date: 2026-09-14 10:00:00 -0300
tags: [jekyll, notas]
---

O texto começa aqui.
```

A regra que organiza tudo: arquivos em `_posts/` viram artigos, e o nome do
arquivo precisa ser `AAAA-MM-DD-titulo.md`. Isso volta como armadilha mais adiante.

## GitHub Pages hospeda, e impõe as regras

GitHub Pages é hospedagem estática gratuita. Você dá `git push`, e eles rodam o
Jekyll e publicam. Não há servidor para manter, certificado para renovar nem
conta para pagar.

O preço não é dinheiro, é **controle**. Como o build roda na máquina deles, eles
fixam as versões:

```
jekyll 3.10.0      ← não é a 4.x
github-pages 232
kramdown 2.4.0
rouge 3.30.0
```

E rodam em modo seguro, com uma **lista de plugins permitidos**. Você não escolhe
quais extensões usar: escolhe entre as que eles homologaram. A razão é óbvia
quando você pensa do lado deles — plugin de Jekyll é código Ruby arbitrário, e
eles estariam executando o seu código em servidores próprios, de graça, para
qualquer pessoa da internet.

Os quatro que este site usa estão na lista, e cobrem o que um blog precisa:

| plugin | o que resolve |
|---|---|
| `jekyll-feed` | gera o RSS em `/feed.xml` |
| `jekyll-sitemap` | gera o `/sitemap.xml` para buscadores |
| `jekyll-seo-tag` | meta tags e Open Graph no `<head>` |
| `jekyll-paginate` | quebra a listagem em páginas |

Se você precisar de algo fora da lista, o caminho é abandonar o build automático
e montar uma GitHub Action que roda o Jekyll que você quiser e publica o
resultado. Aí você recupera o controle e passa a ter um pipeline para manter —
que é exatamente o que este arranjo existe para evitar.

## Os números

**Build local: 2,1 segundos.** Três medições seguidas deram 2,31 / 2,13 / 2,14 s
para gerar o site inteiro. Isso é o ciclo de edição: salvar, olhar.

**Deploy: 50,5 segundos de mediana.** Medi os dez últimos builds pela API do
GitHub: entre 39,8 e 113,5 segundos, do `git push` ao site no ar. É rápido o
bastante para não atrapalhar e lento o bastante para você não ficar conferindo.

**Os limites são generosos para um blog:**

| limite | valor | onde este site está |
|---|---|---|
| tamanho do site | 1 GB | 67,5 MB — **6,6%** |
| banda mensal | 100 GB (flexível) | longe |
| builds por hora | 10 (flexível) | nunca cheguei perto |

O detalhe interessante está dentro desses 67,5 MB: **61 MB são áudio**. As
narrações dos artigos ocupam noventa por cento do site, e todo o texto,
CSS, HTML e imagens somam os 6,5 MB restantes. Texto é barato de um jeito que a
gente esquece.

**E vem um CDN junto, sem configuração.** Os cabeçalhos denunciam:

```
server: GitHub.com
cache-control: max-age=600
etag: W/"6ab5661e-3289"
via: 1.1 varnish
x-served-by: cache-cwb-sbct2070021-CWB
age: 16
```

`via: varnish` é a Fastly na frente. O `cache-cwb` no fim é o nó que me atendeu:
Curitiba. A página não veio dos servidores do GitHub — veio de uma máquina na
minha região, e o `age: 16` diz que ela estava em cache há 16 segundos.

Uma coisa que **não** vem: compressão brotli. Pedindo `gzip`, a home cai de
12.937 para 4.025 bytes. Pedindo `br`, volta crua. Brotli renderia mais uns 15%
em HTML, e esse ganho simplesmente não existe aqui.

## Três armadilhas que me custaram tempo

Estas não estão na documentação de um jeito que salve você. Todas as três me
pegaram.

### Artigo com data futura nunca aparece

Jekyll descarta, por padrão, posts com data no futuro. A ideia é razoável: você
deixa o texto pronto e ele estreia sozinho no dia.

Só que **GitHub Pages só reconstrói quando há push**. Não existe build diário. O
artigo agendado para amanhã não vai aparecer amanhã; vai aparecer no próximo
push, seja lá quando for. As duas coisas separadas fazem sentido e a combinação
não funciona.

Saídas: `future: true` no `_config.yml`, e aí o texto publica na hora carregando
uma data futura; ou uma Action agendada só para disparar o build; ou aceitar que
publicação é sempre manual. Eu escolhi a terceira.

### A URL vem do nome do arquivo

Com `permalink: /:year/:month/:title/`, o `:title` **não** sai do `title:` do
front matter. Sai do nome do arquivo.

Então mudar o título de um artigo publicado não faz nada com a URL, e renomear
o arquivo muda a URL sem você ter tocado no título. É o contrário do que a
intuição diz.

### E renomear quebra o link antigo, em silêncio

A consequência da anterior. Renomeei um arquivo nesta semana e a URL antiga
simplesmente deixou de existir. Sem redirecionamento, sem aviso: 404 para quem
tinha o link.

Existe o `jekyll-redirect-from`, que está na lista de permitidos e resolve com
uma linha no front matter. Ele só não ajuda se, como eu, você descobrir o
problema depois. Vale instalar antes de precisar.

## Quando este arranjo é o certo

**É bom para:** blog, documentação, portfólio, site de projeto, landing page.
Qualquer coisa em que o conteúdo é o mesmo para todo mundo e muda por commit.

**É ruim para:** qualquer coisa com login, comentários nativos, busca no
servidor, formulário que grava dados, ou conteúdo que muda sem alguém publicar.
Dá para contornar com serviços de terceiros, mas aí a simplicidade, que era o
motivo de estar aqui — vai embora pedaço por pedaço.

**O teste que eu usaria:** se duas pessoas diferentes precisam ver coisas
diferentes na mesma URL, site estático é a ferramenta errada. Se todo mundo vê o
mesmo, é difícil achar coisa melhor.

## Vale a pena?

**São duas decisões, não uma.** Jekyll gera; GitHub Pages hospeda. Dá para trocar
qualquer um dos dois sem mexer no outro, e saber disso ajuda quando um dos lados
aperta.

**O preço da hospedagem grátis é a lista de permitidos.** Versões fixas e plugins
homologados, porque é código seu rodando na máquina deles.

**2,1 s de build e 50,5 s de deploy**, com CDN e HTTPS que você não configurou.

**E as três armadilhas são todas sobre coisas que falham caladas:** o artigo
futuro que não estreia, a URL que vem do nome do arquivo, e o link antigo que
vira 404 sem avisar ninguém.

## Referências

- [Limites do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) — 1 GB, 100 GB/mês, 10 builds/hora
- [Versões e plugins que o Pages fixa](https://pages.github.com/versions/), a lista completa do que roda lá
- [Documentação do Jekyll](https://jekyllrb.com/docs/) — front matter, coleções, layouts
- [jekyll-redirect-from](https://github.com/jekyll/jekyll-redirect-from), o plugin que evita a terceira armadilha
