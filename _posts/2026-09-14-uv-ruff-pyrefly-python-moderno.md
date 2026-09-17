---
title: "Python moderno em Rust: uv, Ruff e Pyrefly na prática"
date: 2026-09-14 09:00:00 -0300
tags: [python, ferramentas, tutorial]
description: "Três ferramentas em Rust substituem meia dúzia de utilitários lentos do Python — com o contexto de quem as faz (incluindo a compra da Astral pela OpenAI), os prós e contras de cada uma, as issues que você vai encontrar e um parecer atual."
audio: /assets/audio/uv-ruff-pyrefly-python-moderno.mp3
audio_duracao: "9:11"
---

O ferramental do Python tem fama de bagunça: um programa para o ambiente virtual,
outro para instalar pacotes, um para formatar, um para o *lint*, um para checar
tipos — cada um com sua configuração e sua lentidão. Nos últimos anos, três
ferramentas escritas em Rust vêm substituindo essa pilha: **uv** para o ambiente,
**Ruff** para a higiene do código e **Pyrefly** para os tipos. Este texto monta um
projeto do zero com as três — mas antes situa de onde elas vêm, porque isso mudou
recentemente e afeta a aposta.

<!--more-->

## De onde vêm — e por que isso importa agora

As três não saíram do mesmo lugar, e a política por trás delas mudou em 2026.

**uv e Ruff são da [Astral](https://astral.sh)**, empresa fundada por Charlie Marsh.
E aqui está a novidade que reordena o tabuleiro: em **19 de março de 2026, a OpenAI
adquiriu a Astral** por um valor de nove dígitos, e a equipe passou a integrar o time
do Codex, o agente de código da OpenAI ([análise do Simon
Willison](https://simonw.substack.com/p/thoughts-on-openai-acquiring-astral)). Marsh
declarou publicamente que uv e Ruff continuam abertos sob licença MIT, nos mesmos
repositórios. Na prática, a leitura provável é integração mais estreita com o Codex —
o agente invocando uv para montar ambientes e Ruff para checar o código que gera.

**Pyrefly é da Meta**, escrito para substituir o Pyre (o antigo verificador em OCaml
usado no Instagram). Ou seja: a stack que este artigo monta mistura ferramentas de
**duas empresas concorrentes** — uv/Ruff hoje na órbita da OpenAI, Pyrefly na Meta.
Isso não quebra nada (todas são MIT e open source), mas é um dado a ter em mente ao
apostar uma base de código inteira sobre elas.

Vale o mapa antes dos comandos, porque as três ocupam camadas diferentes:

| Camada | Ferramenta | Substitui | Origem |
|---|---|---|---|
| Ambiente e pacotes | uv | pip, pyenv, virtualenv, poetry, pipx | Astral → OpenAI |
| Lint e formatação | Ruff | flake8, black, isort, pyupgrade | Astral → OpenAI |
| Tipos | Pyrefly | mypy, pyright | Meta |

## uv: o ambiente

O [uv](https://docs.astral.sh/uv/) é um binário único que não depende de um Python já
instalado — ele mesmo baixa as versões de Python que você pedir.

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Um projeto do zero:

```bash
uv init meu-projeto
cd meu-projeto
uv python pin 3.14        # grava .python-version e baixa o interpretador
uv add requests           # resolve, grava no pyproject.toml, trava e instala
uv run python app.py      # roda no ambiente, sem ativar venv na mão
```

**A favor**

- é a peça mais madura das três;
- a velocidade é real — o que o pip levava minutos, leva segundos;
- o *lockfile* (`uv.lock`) torna o ambiente reproduzível;
- o `uv python pin` acaba com o "funciona na minha máquina" por versão de Python.

**Contra — as issues que você vai encontrar**

- o ponto fraco é **monorepo**: os *workspaces* não lidam com requisitos conflitantes
  — `pydantic<2` num pacote e `pydantic>=2` noutro não compartilham um *lockfile*
  ([discussão](https://github.com/astral-sh/uv/issues/9150));
- há um bug documentado em que caminhos relativos de instalações editáveis colapsam no
  *lockfile* e quebram o `uv sync` ([issue #6371](https://github.com/astral-sh/uv/issues/6371));
- em projeto único nada disso aparece; em monorepo grande, aparece cedo.

## Ruff: lint e formatação

O [Ruff](https://docs.astral.sh/ruff/) entra como ferramenta de desenvolvimento:

```bash
uv add --dev ruff
uv run ruff check          # aponta os problemas
uv run ruff check --fix    # corrige os automáticos (import não usado, ordem…)
uv run ruff format         # formata, no estilo do black
```

A configuração mora no `pyproject.toml`:

```toml
[tool.ruff]
line-length = 88

[tool.ruff.lint]
select = ["E", "F", "I"]   # erros, pyflakes, ordenação de import
ignore = ["E501"]
```

**A favor**

- consolida flake8, black, isort, pyupgrade e mais plugins numa ferramenta só (900+ regras);
- a velocidade muda o hábito — como roda instantâneo, você checa o tempo todo, não só no fim;
- é a menos controversa das três: quase todo projeto Python novo já a adota sem discussão.

**Contra**

- as 900+ regras afogam um projeto existente se ligadas de uma vez — comece com poucas
  famílias no `select` e amplie;
- o *formatter*, quase idêntico ao black, tem pequenas diferenças que geram um *diff*
  grande na primeira aplicação sobre uma base antiga.

## Pyrefly: os tipos

O [Pyrefly](https://pyrefly.org/) é da Meta, mas se integra ao mesmo fluxo. A forma
mais limpa é via `uvx`, que roda uma ferramenta sem instalá-la no projeto:

```bash
uvx pyrefly init                     # migra config de mypy/pyright p/ [tool.pyrefly]
uvx pyrefly check --summarize-errors # verifica e resume
uvx pyrefly suppress                 # marca os erros atuais, p/ tratar só os novos
```

**A favor**

- velocidade absurda — a Meta checa os ~20 milhões de linhas do Instagram em 13 segundos,
  10 a 50 vezes mais rápido que mypy e pyright em bases grandes;
- **checa também o código sem anotação de tipo, por padrão** — o mypy, de fábrica, pula
  funções não anotadas, o que faz um projeto sem tipos parecer "limpo" sem ter sido
  checado; o Pyrefly checa mesmo assim, inferindo o que consegue. É mais honesto.

**Contra — as arestas reais**

- é a peça mais nova e menos assentada das três;
- atrito concreto com o próprio Ruff: o comentário de supressão do Pyrefly é lido pela
  regra `ERA001` do Ruff como "código comentado" e sinalizado — as duas brigam
  ([issue #19713](https://github.com/astral-sh/ruff/issues/19713));
- é notadamente **menos estrito** que os concorrentes: tolera partes não tipadas de um
  jeito que quem quer rigor máximo pode achar frouxo.

Há ainda o elefante na sala: a própria Astral (agora OpenAI) desenvolve o **ty**, um
verificador de tipos em Rust que compete diretamente com o Pyrefly. São dois candidatos
fortes disputando a mesma vaga, e a área de tipos é a menos decidida da stack. Se você
quer tudo de um fornecedor só, o par uv + Ruff + ty (tudo Astral) é uma alternativa a
considerar — ao custo de o ty ser ainda mais novo que o Pyrefly.

## Montando o projeto inteiro

O ganho de coesão fica claro no arquivo único que sobra — um só `pyproject.toml`
descreve o projeto, as dependências e a configuração das três ferramentas:

```toml
[project]
name = "meu-projeto"
version = "0.1.0"
requires-python = ">=3.14"
dependencies = ["requests"]

[dependency-groups]
dev = ["ruff"]

[tool.ruff]
line-length = 88

[tool.ruff.lint]
select = ["E", "F", "I"]

[tool.pyrefly]
project_includes = ["src"]
```

Isso substitui o que antes eram seis arquivos: `requirements.txt`, `setup.cfg` do
flake8, o bloco do black, `.isort.cfg`, `mypy.ini`. O ciclo de um dia de trabalho fica
curto:

```bash
uv sync                    # ambiente igual ao lockfile
uv run ruff format         # formata
uv run ruff check --fix    # lint e correções
uvx pyrefly check          # tipos
uv run python -m pytest    # testes
```

## O que eu acho hoje

Depois de contextualizar cada uma, o veredito honesto de setembro de 2026:

- **uv:** adote sem hesitar em projeto único — está maduro e o ganho é imediato. Em
  monorepo, teste os *workspaces* contra o seu caso antes de comprometer.
- **Ruff:** a escolha mais segura das três. Não há bom motivo para começar um projeto
  novo com flake8 e black separados hoje.
- **Pyrefly:** ótimo, rápido e honesto com código não tipado, mas é onde a poeira ainda
  não assentou — o atrito com o Ruff e a existência do ty (agora sob o mesmo dono do uv
  e do Ruff) tornam essa a decisão a revisar daqui a alguns meses.

O que não muda é a direção do ecossistema: ferramenta rápida, configuração num arquivo
só, menos peças entre você e o código. A compra da Astral pela OpenAI é sinal de que
essa direção virou ativo estratégico — o que traz recursos e, ao mesmo tempo, a
pergunta de sempre sobre concentração. Vale acompanhar; não vale esperar. As
ferramentas estão prontas para uso diário hoje.

---

*Continua numa [parte 2]({{ site.baseurl }}/2026/09/makefile-python-moderno-parte-2/), onde amarro os comandos deste texto num `Makefile` para
não decorar nenhum deles.*
