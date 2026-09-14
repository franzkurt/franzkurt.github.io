---
title: "O que o N+1 custa de verdade"
date: 2026-09-02 09:30:00 -0300
tags: [engenharia, banco-de-dados]
description: "Uma query dentro do laço parece barata em desenvolvimento e cara em produção. A diferença não está no SQL — está na latência de rede multiplicada."
audio: /assets/audio/o-que-o-n-mais-um-custa.mp3
audio_duracao: "4:48"
---

O problema do N+1 costuma ser ensinado como um erro de ORM. Na prática ele é um
erro de aritmética: você não está pagando pelo trabalho do banco, está pagando
pelo número de idas e voltas até ele.

<!--more-->

## O código que parece inocente

```python
pedidos = Pedido.objects.filter(status="aberto")   # 1 query
for pedido in pedidos:
    print(pedido.cliente.nome)                      # + 1 query por pedido
```

Em desenvolvimento, com o banco em `localhost`, cada query extra custa uns
0,2 ms. Com 50 pedidos na base de teste, o laço inteiro some no ruído: 10 ms.

Em produção o banco está em outra máquina. A latência de ida e volta vira algo
entre 1 ms e 5 ms — e a base tem 5.000 pedidos abertos.

| Ambiente | Latência por query | Queries | Total |
|---|---|---|---|
| Local, 50 registros | 0,2 ms | 51 | ~10 ms |
| Produção, 5.000 registros | 2 ms | 5.001 | ~10 s |

O SQL não ficou mais lento. O número de vezes que ele atravessa a rede é que
cresceu em três ordens de grandeza.

## A correção

```python
pedidos = Pedido.objects.filter(status="aberto").select_related("cliente")
```

Uma query, um `JOIN`, uma ida à rede. O banco trabalha um pouco mais por query e
a aplicação espera muito menos.

> A regra prática: o custo de uma consulta é `trabalho do banco + latência × número de idas`.
> Otimizar índice ataca a primeira parcela. Quase todo problema de lentidão que
> aparece só em produção mora na segunda.

## Como encontrar antes do usuário

O que funciona não é ler código procurando laços — é fazer o próprio ambiente de
desenvolvimento reclamar:

1. **Conte as queries nos testes.** Um teste que falha quando a requisição passa
   de N queries pega a regressão no pull request, não no alerta de madrugada.
2. **Log com contagem por requisição.** Uma linha com `queries=5001` no log é
   mais eloquente que qualquer perfilamento posterior.
3. **Adicione latência artificial em desenvolvimento.** Alguns milissegundos por
   query fazem o N+1 aparecer na sua máquina, do mesmo jeito que apareceria na
   produção.

O terceiro item é o que mais rende, e é o menos usado. Um ambiente de
desenvolvimento rápido demais esconde exatamente a classe de bug que só se
manifesta quando a rede entra na conta.
