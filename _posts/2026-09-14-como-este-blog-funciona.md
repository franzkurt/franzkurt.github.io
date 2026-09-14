---
title: "Como este blog funciona"
date: 2026-09-14 10:00:00 -0300
tags: [jekyll, meta]
description: "O guia curto de como publicar um artigo aqui — estrutura de pastas, front matter e o que o GitHub Pages faz sozinho."
audio: /assets/audio/como-este-blog-funciona.mp3
audio_duracao: "2:11"
---

Este site é um Jekyll sem tema de terceiros: o layout, o CSS e os includes estão
todos no repositório, o que significa que qualquer detalhe é editável sem brigar
com um `_sass` que veio de fora.

<!--more-->

## Publicar um artigo

Crie um arquivo em `_posts/` seguindo o padrão `AAAA-MM-DD-titulo-em-slug.md`:

```yaml
---
title: "O título do artigo"
date: 2026-09-14 10:00:00 -0300
tags: [engenharia, notas]
description: "Uma linha que aparece na listagem, no RSS e no Google."
---

O texto começa aqui, em Markdown.
```

Três detalhes que economizam tempo depois:

- **`description`** alimenta a listagem da home, a meta tag do Google e o resumo
  do RSS. Sem ela, o Jekyll usa o primeiro parágrafo.
- **`<!--more-->`** marca onde o resumo automático termina, quando você preferir
  não escrever uma `description`.
- **Data no futuro não é publicada.** É o jeito mais simples de deixar um
  rascunho pronto e esperar a data chegar.

Para um rascunho de verdade, use a pasta `_drafts/` sem data no nome do arquivo —
ele só aparece com `bundle exec jekyll serve --drafts`.

## O que já vem pronto

| Recurso | Onde vive | Endereço |
|---|---|---|
| Feed RSS | `jekyll-feed` | `/feed.xml` |
| Sitemap | `jekyll-sitemap` | `/sitemap.xml` |
| Meta tags e Open Graph | `jekyll-seo-tag` | no `<head>` |
| Paginação (8 por página) | `jekyll-paginate` | `/pagina/2/` |
| Página de tags | `tags.html` | `/tags/` |

Os quatro plugins são os homologados pelo GitHub Pages, então o build acontece no
servidor deles: `git push` e o site sobe. Não há Action para manter nem token
para expirar.

## Rodar localmente

```bash
bundle install
bundle exec jekyll serve --livereload
```

O site fica em `http://localhost:4000`. O `--livereload` recarrega o navegador a
cada `Ctrl+S`, o que torna ajuste de CSS bem menos tedioso.

## Onde mexer no visual

Toda a paleta está nas primeiras 60 linhas de `assets/css/style.css`, em
variáveis CSS. Trocar o acento terracota por outro tom é uma linha:

```css
:root {
  --accent: #9c4221;
}
```

O tema escuro é automático — segue a preferência do sistema e pode ser forçado
pelo botão no cabeçalho, que guarda a escolha no `localStorage`.
