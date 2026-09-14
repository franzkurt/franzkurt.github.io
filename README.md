# franzkurt.github.io

Blog pessoal em [Jekyll](https://jekyllrb.com/), construído pelo próprio GitHub
Pages a cada `push` na `main`. Sem tema de terceiros: layout, CSS e includes
estão todos aqui.

**No ar:** <https://franzkurt.github.io> · **Feed:** <https://franzkurt.github.io/feed.xml>

## Estrutura

```
_config.yml          Título, descrição, plugins, paginação, permalinks
_layouts/            default (moldura) · post (artigo) · page (página solta)
_includes/           header, footer, cartão da listagem, data em pt-BR, tempo de leitura
_posts/              Os artigos: AAAA-MM-DD-slug.md
assets/css/style.css Tema inteiro — a paleta são variáveis CSS no topo do arquivo
assets/js/site.js    Alternador de tema, botão copiar no código, tabelas roláveis
index.html           Home paginada
tags.html            /tags/ com índice por assunto
sobre.md             /sobre/
404.html             Página de erro do GitHub Pages
```

## Publicar um artigo

Crie `_posts/2026-09-20-meu-titulo.md`:

```yaml
---
title: "Meu título"
date: 2026-09-20 09:00:00 -0300
tags: [engenharia, notas]
description: "Uma linha que aparece na listagem, no RSS e no Google."
---

Texto em Markdown.
```

`git push` e pronto — o GitHub Pages reconstrói o site. Artigo com data no futuro
só aparece quando a data chegar; rascunho sem data vai em `_drafts/`.

## Rodar localmente

Requer Ruby 3.x:

```bash
bundle install
bundle exec jekyll serve --livereload   # http://localhost:4000
```

Sem Ruby instalado, dá para usar um contêiner:

```bash
podman run --rm -it -v "$PWD":/srv -w /srv -p 4000:4000 docker.io/library/ruby:3.3 \
  bash -c "bundle install && bundle exec jekyll serve --host 0.0.0.0"
```

## Plugins

Apenas os homologados pelo GitHub Pages, para que o build continue acontecendo no
servidor deles sem Action nenhuma: `jekyll-feed` (RSS), `jekyll-seo-tag`
(meta tags e Open Graph), `jekyll-sitemap` e `jekyll-paginate`.
