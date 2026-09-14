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

## Auditoria de segredos

O repositório é público: tudo que entra num commit fica visível para sempre, mesmo
que um commit posterior remova o arquivo. `tools/audit-secrets.sh` existe para que
isso não aconteça por descuido.

```bash
./tools/audit-secrets.sh            # árvore de trabalho
./tools/audit-secrets.sh --staged   # só o que seria commitado
./tools/audit-secrets.sh --history  # todos os blobs de todos os commits
./tools/audit-secrets.sh --all      # tudo acima
```

Ative o bloqueio automático **uma vez por clone** (hooks não são versionados pelo git):

```bash
git config core.hooksPath .githooks
```

A partir daí, um commit com token, chave privada, credencial em URL ou arquivo
`.env` é recusado. Em emergência consciente: `git commit --no-verify` — e nesse caso
o GitHub Actions (`.github/workflows/auditoria.yml`) ainda pega no push.

O que ele verifica:

| Categoria | Exemplos |
|---|---|
| Credenciais | tokens GitHub/Slack/Google/OpenAI/Anthropic, chaves AWS, chaves privadas, senha embutida em URL |
| Arquivos | `.env`, `*.pem`, `id_rsa`, `.netrc`, `.npmrc`, `credentials.json` |
| Config local | remote com token na URL, `credential.helper=store` |
| Identidade | e-mail pessoal exposto nos commits |

Três decisões de projeto que valem explicar:

1. **Ele se autotesta antes de varrer.** Cada padrão é confrontado com uma amostra
   sintética; se algum não detectar a própria amostra, o script sai com código 2 e
   não reporta nada. Um verificador quebrado dizendo "limpo" é pior que verificador
   nenhum. Esse autoteste já pegou um bug real: o padrão de chave privada começa com
   `-` e o `grep` o interpretava como opção.
2. **Varredura vazia não é varredura limpa.** Se a lista de arquivos ou a enumeração
   de blobs vier vazia, ele falha em vez de aprovar.
3. **Nunca imprime o valor de um segredo** — só o local e um prefixo de 4 caracteres.
   Relatório de vazamento com o segredo dentro é mais vazamento.

## Plugins

Apenas os homologados pelo GitHub Pages, para que o build continue acontecendo no
servidor deles sem Action nenhuma: `jekyll-feed` (RSS), `jekyll-seo-tag`
(meta tags e Open Graph), `jekyll-sitemap` e `jekyll-paginate`.
