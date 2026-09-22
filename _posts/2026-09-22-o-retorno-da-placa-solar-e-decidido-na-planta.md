---
title: "O retorno da placa solar é decidido na planta, não no telhado"
date: 2026-09-22 10:00:00 -0300
tags: [energia, solar, arquitetura, python, medicao, engenharia]
description: "A Lei 14.300 mudou onde está o valor de um sistema fotovoltaico: saiu da energia exportada e foi para a consumida na hora. Calculei o quanto isso vale, e escrevi um script para você rodar na sua casa."
---

Vi um vídeo esta semana com uma tese que me pareceu certa e mal quantificada: a
partir de 2023, o retorno financeiro da energia solar residencial deixou de ser
decidido por quem instala e passou a ser decidido por quem desenhou a casa.

A tese está certa. Fui conferir os números, calculei o que dava para calcular, e
saiu um script que você pode rodar na sua casa — está no fim, junto com o vídeo.

<!--more-->

## A lei, e a data que separa dois mundos

A [Lei 14.300/2022](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2022/lei/L14300.htm)
dividiu quem gera energia em casa em dois grupos, e o critério não é o tamanho
do sistema nem a marca do painel. É a data do pedido de acesso à distribuidora.

**Quem já existia, ou protocolou solicitação de acesso em até 12 meses da
publicação da lei** — o grupo que o setor chama de GD1. A lei é de 6 de janeiro
de 2022, então o prazo fechou no começo de janeiro de 2023. Para esse grupo vale
a regra antiga, e o art. 26 é explícito quanto ao prazo: as disposições do art.
17 *"não se aplicam até 31 de dezembro de 2045"*.

**Depois disso** — GD2. O crédito continua sendo um por um, mas você passa a
pagar uma fração do **fio B**, que é a parte da tarifa que remunera o transporte:
poste, fio, transformador, manutenção. Não é a energia; é a infraestrutura que
a leva.

A fração sobe todo ano, pelo art. 27:

| ano | 2023 | 2024 | 2025 | **2026** | 2027 | 2028 |
|---|---:|---:|---:|---:|---:|---:|
| fração do fio B paga | 15% | 30% | 45% | **60%** | 75% | 90% |

E aqui o ponto em que quase todo material sobre o assunto — inclusive o vídeo —
simplifica demais. **Não existe "100% do fio B" em 2029.** Fui ler o art. 27, e
o inciso VII não traz percentual nenhum: manda aplicar *"a regra disposta no art.
17 desta Lei a partir de 2029"*.

E o art. 17 é outra coisa. Ele diz que as unidades serão faturadas pela
incidência *"de todas as componentes tarifárias não associadas ao custo da
energia"* — base mais ampla que só o fio B — e que *"deverão ser abatidos todos
os benefícios ao sistema elétrico"* propiciados pela geração distribuída,
conforme regulação da ANEEL.

Ou seja: de 2029 em diante a base de cálculo aumenta e um desconto novo entra,
e o saldo depende de uma valoração que ainda não existe. Pode dar mais que 100%
do fio B de hoje, pode dar menos. É cenário, não calendário — e é assim que vou
tratar.

## O que a lei realmente mudou

O ponto não é que ficou mais caro. É que o custo caiu sobre **uma parte
específica** do seu sistema.

O fio B é cobrado sobre a energia que você exporta e depois recompra. Ele **não**
é cobrado sobre a energia que sai do painel e vai direto para a sua geladeira no
mesmo instante. Aquele quilowatt-hora vale a tarifa cheia, sempre, e nenhuma
consulta pública vai mexer nisso.

Então o valor do seu sistema passou a depender de uma fração que o setor chama de
**fator de simultaneidade**: quanto da sua geração você consome na hora em que
ela acontece. E essa fração não é decidida pelo instalador. Ela é decidida pelo
encaixe entre duas curvas — a geração, que tem o horário do sol, e o consumo, que
tem o horário da sua vida.

No Brasil essas duas curvas estão desencontradas por projeto. O pico do consumo
residencial é no começo da noite, quando a geração solar já é zero.

## Quanto a orientação do telhado realmente custa

Aqui eu precisei calcular, porque o número que circula não bateu.

O vídeo afirma que um telhado voltado para o sul gera 47% menos que um voltado
para o norte. Calculei com `pvlib` — posição solar real, céu claro pelo modelo
Ineichen, transposição para o plano inclinado por Hay-Davies — e a 20° de
inclinação, que é telhado brasileiro comum:

| cidade | perda do telhado sul |
|---|---:|
| Curitiba | −24,3% |
| São Paulo | −22,9% |
| Brasília | −16,2% |
| Fortaleza | −4,1% |

Não são 47%. Mas o número não é inventado — ele é **condicional**, e a condição
é a inclinação:

| inclinação | Curitiba | São Paulo | Brasília |
|---:|---:|---:|---:|
| 10° | −12,7% | −11,9% | −8,3% |
| 20° | −24,3% | −22,9% | −16,2% |
| 30° | −35,4% | −33,5% | −24,1% |
| **40°** | **−46,0%** | −43,7% | −32,2% |

Os 47% aparecem num telhado de 40° em latitude sul. Num telhado de 15°, a mesma
decisão custa 18%. A tese continua de pé — a orientação é uma alavanca grande e
gratuita —, mas a condição precisa vir junto, porque quem mora em Fortaleza vai
tomar uma decisão diferente de quem mora em Curitiba.

*(Ressalva do meu lado: céu claro superestima os valores absolutos, já que não
tem nuvem. As razões entre orientações, que é o que o texto usa, são bem menos
sensíveis a isso.)*

## Três casas, o mesmo sistema, o mesmo preço

Escrevi um script que junta tudo isso: envoltória, orientação, ocupação, e o
cronograma do fio B. Mesmo sistema de 5 kWp, mesmos R$ 22.500 em todas:

```
╔═ A — casa pensada: telhado norte, envoltória boa, gente em casa
║ ENVOLTÓRIA — classe indicativa: A
║ SIMULTANEIDADE — 59% da geração é usada na hora
║    retorno em: 3,8 anos
╔═ B — casa comum: telhado leste, só o mínimo da norma
║ ENVOLTÓRIA — classe indicativa: C
║ SIMULTANEIDADE — 28% da geração é usada na hora
║    retorno em: 4,4 anos
╔═ C — casa que virou forno: telhado sul, vidro sem proteção, vazia de dia
║ ENVOLTÓRIA — classe indicativa: D
║ SIMULTANEIDADE — 15% da geração é usada na hora
║    retorno em: 5,3 anos
```

Três anos e dez meses contra cinco anos e quatro meses. Um ano e meio de
diferença, no mesmo equipamento, pelo mesmo dinheiro — e a diferença foi criada
de graça, anos antes, num desenho.

## O achado que eu não esperava

Rodando o mesmo cenário ao longo do cronograma, aparece uma coisa que o vídeo
não chega a dizer:

```
  ano  fio B         A        B        C
 2023   15%      3,6 a     4,1 a     4,8 a
 2026   60%      3,8 a     4,4 a     5,3 a
 2028   90%      3,9 a     4,8 a     5,8 a
 2029  100%      3,9 a     4,9 a     5,9 a   ← cenário meu; a lei remete ao art. 17
```

Olhe as colunas na vertical. Do começo ao fim do cronograma, a casa A piora
**0,3 ano**. A casa C piora **1,1 ano** — quase quatro vezes mais.

A casa bem projetada não é só melhor. Ela é **quase imune à mudança de regra**,
porque quase não depende da parte do sistema que a regra ataca. Quem exporta
pouco tem pouco a perder quando exportar fica caro.

Isso é uma coisa interessante de se pensar sobre risco regulatório: a proteção
contra ele não veio de acompanhar a ANEEL, veio de ter posto a janela no lugar
certo.

## E o selo que não existe na parede

A sua geladeira tem selo. O ar-condicionado tem. A lâmpada tem. A casa de
meio milhão que consome mais que todos eles somados, e que você vai pagar por 30
anos, não tem nada na parede na hora que você assina.

O programa existe — é o **PBE Edifica**, com a etiqueta ENCE numa escala de A a
E, avaliada pela INI-R. O que falta é ele ser exigido na venda.

E tem um detalhe nessa história que vale mais que o resto. Pela INI-R, atender o
procedimento simplificado da NBR 15575 — o mínimo obrigatório, a norma de
desempenho que toda obra precisa cumprir — equivale à **classe C** da envoltória.
Para chegar a B ou A é preciso avaliação por método simplificado ou por
simulação.

Ou seja: o piso legal da construção brasileira é um C. "Aprovado na norma" não é
elogio, é o chão.

## Por que ninguém te ofereceu isso

Conte quantas vezes alguém já te ofereceu uma placa solar. Anúncio, panfleto,
vendedor no shopping, vizinho que virou integrador. Agora conte quantas vezes
alguém te ofereceu orientação de telhado.

A diferença não é de mérito técnico. Placa tem código de barras, estoque,
parcelamento, comissão e anúncio. Orientação de telhado não tem nada disso — não
dá para entregar de caminhão nem parcelar em doze vezes.

Então a casa vira uma escada: a envoltória foi cortada para caber no orçamento,
aí vendem ar-condicionado para resolver o calor, aí a conta sobe e vendem placa
para resolver a conta, aí o fio B sobe e vendem bateria para resolver a placa.
Cada aparelho conserta o anterior, e a parede continua exatamente onde estava.

Tem um detalhe final que fecha o raciocínio. O integrador dimensiona o sistema
pela média da sua conta dos últimos doze meses — é a prática padrão. Mas essa
conta já é o consumo inflado por uma casa que esquenta demais. **Quanto pior a
casa, maior o sistema que te vendem**, e ninguém no processo tem motivo para
perguntar se dava para consumir menos antes de comprar mais.

## O script

Está em [`tools/selo-casa.py`](https://github.com/franzkurt/franzkurt.github.io/blob/main/tools/selo-casa.py),
sem dependência nenhuma além do Python:

```
$ python3 selo-casa.py               # os três perfis de exemplo
$ python3 selo-casa.py --tabela      # o retorno ano a ano
$ python3 selo-casa.py --json minha-casa.json
```

Ele imprime a memória de cálculo inteira — cada ponto somado, cada correção
aplicada — porque o objetivo é você discordar de um peso e trocar, não aceitar
um número.

**O que ele não é:** uma ENCE. A etiqueta oficial sai pelos métodos da INI-R,
exige dados que o script não pede, e é emitida por organismo acreditado pelo
Inmetro. A classe que ele imprime é indicativa e serve para **ordenar decisões**,
não para certificar nada. O cálculo de orientação, esse sim, é solar de verdade
e está em [`tools/orientacao-telhado.py`](https://github.com/franzkurt/franzkurt.github.io/blob/main/tools/orientacao-telhado.py).

## O que fica

**A placa continua valendo a pena.** Nada aqui diz para não instalar; ela segue
derrubando a conta de luz de forma significativa.

**Mas ela entra no fim da história.** O que decide o retorno é quanto da geração
você consome na hora, e isso foi decidido na planta.

**Duas alavancas custam zero:** para onde a casa olha, e do que ela é feita.
Nenhuma aparece no orçamento como item a mais.

**E se a casa já está de pé, não está perdido.** Sombreamento no sol da tarde,
ventilação cruzada, e rodar máquina de lavar e aquecimento no meio do dia em vez
de à noite. Isso mexe no seu bolso ainda este mês e não exige comprar aparelho
nenhum.

---

Este texto nasceu do vídeo **[A placa solar feita em casa mal feita e dinheiro
jogado no lixo](https://www.youtube.com/watch?v=E7OBSjDc8s0)**, do canal Casa
Certa / Green. A tese é dele; os cálculos, o script e a correção do número de
orientação são meus, e a ressalva sobre o 100% de 2029 está no vídeo também.

## Referências

- [Lei 14.300/2022](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2022/lei/L14300.htm) — o marco legal da geração distribuída, o art. 27 e a transição
- [PBE Edifica — INI-R](https://pbeedifica.com.br/inir) — os métodos de classificação residencial e a escala A–E
- [INI-R, texto da instrução normativa](https://labeee.ufsc.br/sites/default/files/documents/2020.11.09-INI-R_V1.pdf) — onde o mínimo da NBR 15575 é ancorado na classe C
- [pvlib](https://pvlib-python.readthedocs.io/) — a biblioteca usada nos cálculos de irradiação
- [EPE — Uso de ar-condicionado no setor residencial brasileiro](https://www.epe.gov.br/sites-pt/publicacoes-dados-abertos/publicacoes/PublicacoesArquivos/publicacao-341/NT%20EPE%20030_2018_18Dez2018.pdf) — de onde vem a participação da climatização no consumo
