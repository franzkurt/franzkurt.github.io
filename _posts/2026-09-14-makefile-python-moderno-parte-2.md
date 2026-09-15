---
title: "Um Makefile para o Python moderno (uv, Ruff, Pyrefly) — parte 2"
date: 2026-09-14 10:00:00 -0300
tags: [python, ferramentas, make, tutorial]
description: "Amarrar uv, Ruff e Pyrefly num Makefile transforma cinco comandos que ninguém decora em make check. O padrão, o truque do help auto-documentado e as três armadilhas do Make que pegam todo mundo."
audio: /assets/audio/makefile-python-moderno-parte-2.mp3
audio_duracao: "6:02"
---

Na [parte 1]({{ site.baseurl }}/2026/09/uv-ruff-pyrefly-python-moderno/) montei um
projeto com uv, Ruff e Pyrefly. O problema que sobra é humano: ninguém decora
`uv run ruff check --fix` e `uvx pyrefly check --summarize-errors`. Um `Makefile`
resolve isso — dá um nome curto a cada comando e vira o vocabulário comum do projeto,
o mesmo para você, para o colega novo e para o CI.

<!--more-->

## Por que Make, e não um script

O `make` é velho (1976) e tem defeitos, mas ganha de um `scripts.sh` em três coisas
que importam aqui: cada tarefa é um alvo nomeado (`make lint`), ele já vem instalado
em qualquer Unix, e o `Makefile` na raiz é uma convenção que todo mundo reconhece —
abrir um projeto e rodar `make` para ver o que dá é reflexo antigo. Não estamos usando
o Make para o que ele foi feito (compilar C rastreando dependências), e sim como um
menu de atalhos. Está ótimo para isso.

## O Makefile mínimo

Isto já cobre o dia a dia de um projeto com a stack da parte 1:

```makefile
UV := uv

.PHONY: install format lint types test check

install:
	$(UV) sync

format:
	$(UV) run ruff format .

lint:
	$(UV) run ruff check --fix .

types:
	uvx pyrefly check --summarize-errors

test:
	$(UV) run python -m pytest -q

check: format lint types test
```

Com isso, `make check` roda a sequência inteira — formata, corrige o lint, checa tipos
e roda os testes — num comando. É o mesmo que você quer no *pre-commit* e no CI.

Três detalhes desse arquivo merecem explicação, porque são onde o Make mais morde.

## Armadilha 1: a indentação é TAB, não espaço

Esta é a mais famosa e a que mais custa tempo. As linhas de comando embaixo de um
alvo **precisam começar com um caractere de tabulação** — não espaços. Se o seu editor
converte tab em espaços, o Make cospe o erro mais obscuro do mundo:

```
Makefile:8: *** missing separator.  Stop.
```

Não é "espaço a mais"; é "aqui tinha que ser TAB". A defesa é configurar o editor para
não expandir tab dentro de `Makefile`, ou conferir com `cat -A Makefile` — um tab
aparece como `^I`.

## Armadilha 2: `.PHONY` não é decoração

A linha `.PHONY: install format lint ...` declara que esses alvos **não são
arquivos**. Sem ela, se por acaso existir um arquivo ou pasta chamado `test` no
projeto, `make test` vê que o "arquivo" existe, conclui que está atualizado e **não
faz nada** — silenciosamente. Marcar como `.PHONY` diz ao Make "isto é uma tarefa,
rode sempre". Todo alvo que é ação, e não geração de arquivo, entra ali.

## Armadilha 3: cada linha roda num shell próprio

Cada linha de comando de um alvo executa numa subshell separada. Isso quebra o que
parece óbvio:

```makefile
# NÃO funciona: o cd vale só na primeira linha
deploy:
	cd build
	./subir.sh      # roda na pasta ERRADA, não em build/
```

O `cd` da primeira linha não sobrevive para a segunda. A correção é juntar as duas com
`&&` na mesma linha:

```makefile
deploy:
	cd build && ./subir.sh
```

O mesmo vale para variáveis de shell: uma definida numa linha não existe na próxima.

## O truque que vale a pena: help auto-documentado

Um Makefile cresce e você esquece o que cada alvo faz. Em vez de manter um alvo `help`
com `echo` à mão (que envelhece e mente), dá para gerar o help a partir de comentários
`##` nos próprios alvos:

```makefile
.PHONY: help
help:  ## mostra esta ajuda
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install:  ## instala as dependências (uv sync)
	$(UV) sync

lint:  ## corrige lint e formatação (ruff)
	$(UV) run ruff check --fix . && $(UV) run ruff format .
```

Agora `make help` lê o próprio arquivo e imprime cada alvo com sua descrição, alinhados
e coloridos. A descrição fica ao lado do comando que ela descreve, então nunca
envelhece separada — é o padrão que uso nos meus projetos e o único jeito de o help não
virar mentira. Fazer `make` sem argumento cair no help é um bônus:

```makefile
.DEFAULT_GOAL := help
```

## Parâmetros com valor padrão

Para um alvo que aceita variação — a porta do servidor, por exemplo — use `?=`, que
define um padrão que a linha de comando pode sobrescrever:

```makefile
PORT ?= 8000

.PHONY: run
run:  ## sobe o servidor (make run PORT=3000)
	$(UV) run python -m meu_app --port $(PORT)
```

`make run` usa 8000; `make run PORT=3000` usa 3000. É o mesmo mecanismo que uso para
`make dev PORT=...` e `make atualizar TAG=...`.

## O Makefile que eu levaria para um projeto novo

Juntando tudo — a stack da parte 1, o help auto-documentado e os padrões acima:

```makefile
UV := uv
PORT ?= 8000

.DEFAULT_GOAL := help
.PHONY: help install format lint types test check run clean

help:  ## mostra esta ajuda
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install:  ## sincroniza o ambiente (uv sync)
	$(UV) sync

format:  ## formata o código (ruff)
	$(UV) run ruff format .

lint:  ## corrige lint e imports (ruff)
	$(UV) run ruff check --fix .

types:  ## verifica tipos (pyrefly)
	uvx pyrefly check --summarize-errors

test:  ## roda os testes (pytest)
	$(UV) run python -m pytest -q

check: format lint types test  ## tudo: formato, lint, tipos, testes

run:  ## sobe o app (make run PORT=3000)
	$(UV) run python -m meu_app --port $(PORT)

clean:  ## limpa caches e o venv
	rm -rf .venv .ruff_cache .pytest_cache
```

O `make check` é o alvo que amarra a parte 1: um comando, e a máquina roda a stack
inteira na ordem certa. É o que vai no gancho de *pre-commit* e é a mesma linha que o
CI executa — o que garante que "passou na minha máquina" e "passou no CI" querem dizer
exatamente a mesma coisa.

Depois disso, o único comando de Python que você precisa lembrar é `make`.
