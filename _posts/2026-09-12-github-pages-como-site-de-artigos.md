---
title: "Do 'Hello World' a um blog: GitHub Pages como site de artigos"
date: 2026-09-12 10:00:00 -0300
tags: [jekyll, github-pages, tutorial]
description: "O GitHub Pages hospeda HTML de graça, mas um blog de verdade precisa de RSS, listagem, tags e SEO. O caminho para chegar lá sem Action nenhuma para manter — e a conta honesta do que custa."
---

Criar um site no GitHub Pages leva um minuto: um repositório, um `index.html`, e o
endereço `usuario.github.io` está no ar. O problema aparece no segundo dia, quando
você quer publicar o segundo artigo — e percebe que hospedar uma página HTML e ter
um blog são coisas diferentes.

Um blog precisa de listagem que se atualiza sozinha, feed RSS, páginas de tags,
meta tags para o Google e um jeito de escrever em texto em vez de HTML. Este texto
é o caminho até lá, com uma restrição que muda todas as decisões: **nada de
GitHub Actions para manter**.

<!--more-->

## Por que Jekyll, e não outra coisa

A resposta curta: porque o GitHub Pages já constrói Jekyll sozinho, no servidor
deles, sem você configurar nada.

Qualquer gerador de site estático — Hugo, Astro, Eleventy — produz HTML que o Pages
hospeda. Mas com esses, *você* precisa rodar o build, e no GitHub isso significa um
workflow de Actions: um arquivo YAML para manter, uma pipeline que pode quebrar, um
token que pode expirar. Com Jekyll, o servidor do Pages faz o build a cada `push`.
Você escreve Markdown, dá `git push`, o site sobe. Não há peça no meio.

Essa é a escolha que este artigo defende: **deixar o build onde ele já acontece de
graça e sem manutenção**. Tudo o que segue vem daí.

## Começar do zero: o nome do repositório é a primeira decisão

Antes de qualquer Jekyll, há um detalhe que decide o endereço do site: **o nome do
repositório**. O GitHub trata de forma especial um repositório chamado
`<seu-usuario>.github.io` — com o mesmo nome do seu perfil.

| Nome do repositório | Endereço do site | `baseurl` no config |
|---|---|---|
| `franzkurt.github.io` | `https://franzkurt.github.io` | `""` (vazio) |
| `blog` | `https://franzkurt.github.io/blog/` | `"/blog"` |

O primeiro caso — nome igual ao perfil — publica na raiz do domínio e é o que você
quer para um blog pessoal. Cada conta tem **um** repositório desses. O segundo caso
serve para projetos, e exige o `baseurl` certo ou todos os links quebram.

Trocando `franzkurt` pelo seu usuário, o passo a passo é:

1. **Crie o repositório** com o nome `<seu-usuario>.github.io`. Marque como
   **público** — no plano gratuito, o Pages só funciona em repositório público.
2. **Clone e escreva** os arquivos do Jekyll (a estrutura abaixo).
3. **`git push`** para a branch `main`.
4. **Ative o Pages**: em *Settings → Pages*, no repositório, defina *Source* como
   *Deploy from a branch* e escolha `main` / `/ (root)`. O primeiro build começa
   em seguida e leva um ou dois minutos.

A partir do segundo `push`, nada disso se repete: o site reconstrói sozinho.

### A estrutura mínima

O Jekyll monta o site a partir de convenções de pastas. O esqueleto de um blog:

```
.
├── _config.yml        título, plugins, permalinks — a configuração
├── index.html         a página inicial (a listagem de artigos)
├── _posts/            um arquivo por artigo: AAAA-MM-DD-titulo.md
├── _layouts/          moldes de HTML: default, post, page
├── _includes/         pedaços reusados: cabeçalho, rodapé
└── assets/            CSS, imagens, JavaScript
```

Só o `_config.yml`, o `index.html` e a pasta `_posts/` são obrigatórios para ter um
blog no ar; o resto é o que dá forma a ele. As pastas com `_` na frente são
especiais para o Jekyll — ele as lê para montar o site, mas não as copia cruas para
a saída.

Um `_config.yml` mínimo já funcional:

```yaml
title: Meu Blog
description: Um blog sobre o que eu aprendo.
url: "https://franzkurt.github.io"
baseurl: ""
permalink: /:year/:month/:title/

plugins:
  - jekyll-feed
  - jekyll-seo-tag
  - jekyll-sitemap
  - jekyll-paginate
paginate: 8
```

O `permalink` acima faz cada artigo virar um endereço limpo como
`/2026/09/meu-titulo/` — melhor de ler e de compartilhar que o padrão.

## Os quatro plugins que importam

O GitHub Pages não roda qualquer plugin Jekyll — só uma lista homologada. Sair dela
força o build para Actions, exatamente o que queremos evitar. Quatro plugins dessa
lista resolvem quase tudo:

```yaml
# _config.yml
plugins:
  - jekyll-feed        # RSS/Atom em /feed.xml
  - jekyll-seo-tag     # meta tags e Open Graph
  - jekyll-sitemap     # /sitemap.xml para buscadores
  - jekyll-paginate    # listagem paginada
```

Cada um entrega algo que dá trabalho fazer à mão:

| Plugin | O que gera | Onde |
|---|---|---|
| jekyll-feed | feed Atom completo | `/feed.xml` |
| jekyll-seo-tag | `<title>`, description, Open Graph | no `<head>` |
| jekyll-sitemap | mapa do site | `/sitemap.xml` |
| jekyll-paginate | páginas 2, 3, 4… | `/pagina/2/` |

O feed é o que mais rende. Ele entrega o artigo inteiro, não um resumo, então quem
assina lê no leitor sem depender de rede social nem algoritmo. É o recurso que
transforma um site em algo que se *acompanha*.

## Escrever um artigo é criar um arquivo

Com a estrutura pronta, publicar vira uma operação de texto. Um arquivo em `_posts/`
com o nome no padrão `AAAA-MM-DD-titulo.md`:

```markdown
---
title: "O título do artigo"
date: 2026-09-12 10:00:00 -0300
tags: [engenharia, notas]
description: "A linha que aparece na listagem, no RSS e no Google."
---

O texto começa aqui, em Markdown.
```

Três detalhes economizam tempo depois:

- **Data no futuro não é publicada.** É o jeito mais simples de deixar um artigo
  pronto esperando a data chegar.
- **`description`** alimenta a listagem, o feed e o resultado de busca de uma vez.
- **`_drafts/`** guarda rascunho sem data no nome; ele só aparece com
  `jekyll serve --drafts`.

`git push`, e o Pages reconstrói. Sem etapa manual, sem deploy.

## Os limites reais, em números

"De graça" tem letra miúda, e é melhor conhecê-la antes de precisar. Os limites do
GitHub Pages são todos *soft* — o GitHub avisa ou reduz a velocidade, não derruba o
site nem manda fatura:

| Limite | Valor |
|---|---|
| Tamanho do site | 1 GB |
| Banda | 100 GB por mês |
| Builds | 10 por hora |

Para um blog de texto, esses números são enormes. Um artigo com imagens pesa
dezenas de KB; estourar 100 GB de banda exigiria centenas de milhares de visitas por
mês. O limite de 10 builds por hora só incomodaria quem dá `push` a cada dois
minutos — e nem se aplica quando o site é publicado por um workflow próprio.

Uma ressalva que vale saber: repositório **público** no plano Free tem tudo isso de
graça. Tornar o repositório privado passa a exigir um plano pago para o Pages
funcionar. Para um blog, que é público por natureza, isso não pesa.

## Onde o build nativo ganha do Actions

É tentador, em algum momento, migrar para um workflow de Actions "para ter mais
controle". Vale entender o que se perde:

O build nativo do Pages não consome nada. O deploy que aparece na aba Actions de um
site Jekyll clássico roda em runner padrão, que em repositório público é gratuito e
ilimitado. No instante em que você troca por um workflow próprio, ganha flexibilidade
e passa a ter uma peça a mais para manter — que quebra quando uma dependência muda,
quando um token expira, quando a sintaxe do YAML fica obsoleta.

A regra prática: **só migre para Actions quando precisar de um plugin fora da lista
homologada, ou de um passo de build que o Jekyll nativo não faz.** Até lá, menos
peças é mais confiabilidade.

## Rodar localmente antes de publicar

Ver o site antes do `push` evita o artigo com erro de formatação no ar. Com Ruby
instalado:

```bash
bundle install
bundle exec jekyll serve --livereload
```

O site fica em `localhost:4000`, e o `--livereload` recarrega o navegador a cada
`Ctrl+S`. Sem Ruby na máquina, um contêiner resolve:

```bash
podman run --rm -it -v "$PWD":/srv -w /srv -p 4000:4000 \
  ruby:3 bash -c "bundle install && jekyll serve --host 0.0.0.0"
```

O detalhe que poupa uma surpresa: o Pages usa uma versão específica do Jekyll e dos
plugins. Fixar essas versões no `Gemfile` com a gem `github-pages` faz o build local
bater com o de produção — o que você vê é o que sobe.

## O que fica

No fim, a stack inteira é: Markdown nos `_posts/`, quatro plugins no `_config.yml`, e
`git push`. Sem servidor para administrar, sem pipeline para consertar, sem conta
mensal. O site se reconstrói sozinho no lugar onde já mora.

É pouca engenharia para um blog que dura anos — e essa é exatamente a intenção. O
trabalho que você não faz é o trabalho que não quebra.
