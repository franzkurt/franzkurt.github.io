---
published: false          # tire esta linha quando o livro for para o ar
layout: page
title: "Título do livro"
subtitulo: "A linha que explica o título"
assunto: "Engenharia"     # a categoria que aparece ao lado do número
ordem: 1                  # controla a posição na lista
pronto: false             # true quando houver texto para ler
capa: /assets/img/livros/exemplo.jpg   # opcional; sem isso aparece a inicial
description: "Um parágrafo curto sobre o que o livro faz, mostrado na listagem."
---

## Capítulo 1

O texto começa aqui, em Markdown — do mesmo jeito que um artigo.

Para um livro com capítulos em páginas separadas, crie um arquivo por capítulo
em `_livros/` e use `ordem:` para sequenciá-los.
