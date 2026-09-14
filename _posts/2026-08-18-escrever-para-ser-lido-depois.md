---
title: "Escrever para ser lido depois"
date: 2026-08-18 18:00:00 -0300
tags: [notas, escrita]
description: "Documentação envelhece mal porque é escrita para quem já entende. Três hábitos que fazem um texto sobreviver a seis meses de esquecimento."
audio: /assets/audio/escrever-para-ser-lido-depois.mp3
audio_duracao: "1:35"
---

Todo texto técnico tem dois leitores: o colega de hoje e você daqui a seis meses.
O segundo é mais exigente, porque terá esquecido o contexto que tornava tudo
óbvio na hora de escrever.

<!--more-->

## Registre o porquê, não o quê

O código já diz o que faz. O que ele nunca diz é qual alternativa foi descartada
e por quê. Um commit que explica *"usamos fila em vez de chamada direta porque o
provedor derruba conexões acima de 30 s"* economiza a próxima pessoa de refazer
a descoberta — inclusive quando a próxima pessoa é você.

## Datas absolutas, sempre

"Vamos revisar isso no mês que vem" é inútil dois meses depois. "Revisar em
outubro de 2026" continua legível para sempre. O mesmo vale para "recentemente",
"a versão nova" e "por enquanto".

## Um exemplo executável vale três parágrafos

Explicar o formato de um payload em prosa exige que o leitor reconstrua a
estrutura na cabeça. Mostrar o payload não exige nada:

```json
{
  "evento": "pedido.pago",
  "id": "ped_01H8Z",
  "valor_centavos": 24990,
  "ocorrido_em": "2026-08-18T18:00:00-03:00"
}
```

Valor em centavos, data com fuso, id com prefixo do tipo — três decisões de
projeto que o exemplo comunica sem uma linha de explicação.

---

Nada disso exige mais tempo de escrita. Exige apenas escrever para alguém que não
está na sala — que é, quase sempre, para quem o texto vai acabar servindo.
