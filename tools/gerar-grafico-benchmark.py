#!/usr/bin/env python3
"""Gera _includes/grafico-benchmark.html a partir dos dados medidos.

Os números vivem AQUI, não no SVG: refazer a medição e rodar este script
atualiza o gráfico, a tabela e o texto alternativo de uma vez só.

Medição: melhor de três execuções de tools/bench-free-threading.py,
CPython 3.14.7 do mesmo toolchain (python-build-standalone via uv),
host de 8 núcleos físicos / 16 lógicos.
"""
from pathlib import Path

# ── dados medidos ────────────────────────────────────────────────────────────
THREADS = [1, 2, 4, 8]
SERIES = [                      # (slot, nome na legenda, rótulo curto, tempos em s)
    ("s1", "3.14 com GIL",       "com GIL",      [0.72, 0.75, 0.74, 0.72]),
    ("s2", "3.14t sem GIL",      "sem GIL",      [0.60, 0.62, 0.43, 0.27]),
    ("s3", "3.14t GIL religado", "GIL religado", [0.69, 0.64, 0.66, 0.65]),
]
UNIDADE, YMAX, PASSOS = "s", 0.80, 4

# ── geometria ────────────────────────────────────────────────────────────────
W, H = 640, 320
ML, MR, MT, MB = 46, 132, 34, 40
x0, x1, y0, y1 = ML, W - MR, MT, H - MB

X = lambda i: x0 + i * (x1 - x0) / (len(THREADS) - 1)
Y = lambda v: y1 - (v / YMAX) * (y1 - y0)
br = lambda v, casas=2: f"%.{casas}f" % v if False else ("%.*f" % (casas, v)).replace(".", ",")


def alt_text():
    partes = []
    for _, nome, _, vals in SERIES:
        variacao = "cai" if vals[-1] < vals[0] * 0.9 else "fica plano"
        partes.append(f"{nome} {variacao} de {br(vals[0])} para {br(vals[-1])} segundos")
    return ("Gráfico de linhas, tempo por número de threads: " + "; ".join(partes) + ".")


def main():
    L = []
    a = L.append
    a('<figure class="viz" role="group" aria-labelledby="viz-benchmark-titulo">')
    a('  <figcaption id="viz-benchmark-titulo" class="viz__titulo">'
      'Tempo para contar os primos até 300.000, por número de threads</figcaption>')

    a('  <div class="viz__legenda">')
    for slot, nome, _, _ in SERIES:
        a(f'    <span class="viz__item"><span class="viz__marca viz__marca--{slot}"></span>{nome}</span>')
    a('  </div>')

    a('  <div class="viz__plot">')
    a(f'    <svg viewBox="0 0 {W} {H}" role="img" aria-label="{alt_text()}">')

    a('      <g class="viz__grade">')
    for k in range(PASSOS + 1):
        v = YMAX * k / PASSOS
        y = Y(v)
        a(f'        <line x1="{x0}" y1="{y:.1f}" x2="{x1}" y2="{y:.1f}"/>')
        a(f'        <text class="viz__rotulo" x="{x0 - 10}" y="{y + 4:.1f}" text-anchor="end">{br(v, 1)}</text>')
    a('      </g>')

    a('      <g class="viz__eixo">')
    for i, t in enumerate(THREADS):
        a(f'        <text class="viz__rotulo" x="{X(i):.1f}" y="{y1 + 24}" text-anchor="middle">{t}</text>')
    a(f'        <text class="viz__rotulo viz__rotulo--eixo" x="{(x0 + x1) / 2:.1f}" y="{H - 4}" text-anchor="middle">threads</text>')
    a(f'        <text class="viz__rotulo viz__rotulo--eixo" x="{x0 - 10}" y="{y0 - 16}" text-anchor="start">segundos</text>')
    a('      </g>')

    for slot, _, _, vals in SERIES:
        pts = " ".join(f"{X(i):.1f},{Y(v):.1f}" for i, v in enumerate(vals))
        a(f'      <polyline class="viz__linha viz__linha--{slot}" points="{pts}"/>')

    for slot, _, curto, vals in SERIES:
        for i, v in enumerate(vals):
            a(f'      <circle class="viz__ponto viz__ponto--{slot}" cx="{X(i):.1f}" cy="{Y(v):.1f}" r="4.5"/>')
        yf = Y(vals[-1])
        # rótulo direto: marca colorida carrega a identidade, o texto é tinta
        a(f'      <circle class="viz__ponto viz__ponto--{slot}" cx="{x1 + 14}" cy="{yf:.1f}" r="3.5"/>')
        a(f'      <text class="viz__direto" x="{x1 + 24}" y="{yf + 4:.1f}">{curto} · {br(vals[-1])} {UNIDADE}</text>')

    a(f'      <g class="viz__mira"><line x1="-99" x2="-99" y1="{y0}" y2="{y1}"/></g>')
    larg = (x1 - x0) / (len(THREADS) - 1)
    for i in range(len(THREADS)):
        a(f'      <rect class="viz__alvo" data-i="{i}" x="{X(i) - larg / 2:.1f}" y="{y0}" '
          f'width="{larg:.1f}" height="{y1 - y0}" fill="transparent" tabindex="0"/>')
    a('    </svg>')
    a('    <div class="viz__tooltip" hidden></div>')
    a('  </div>')

    a('  <details class="viz__tabela">')
    a('    <summary>Ver os dados em tabela</summary>')
    a('    <table>')
    a('      <thead><tr><th scope="col">Threads</th>'
      + "".join(f'<th scope="col">{n}</th>' for _, n, _, _ in SERIES) + '</tr></thead>')
    a('      <tbody>')
    for i, t in enumerate(THREADS):
        cels = "".join(f'<td>{br(s[3][i])} {UNIDADE}</td>' for s in SERIES)
        a(f'        <tr><th scope="row">{t}</th>{cels}</tr>')
    a('      </tbody>')
    a('    </table>')
    a('    <p class="viz__nota">Melhor de três execuções. CPython 3.14.7 do mesmo toolchain '
      '(python-build-standalone), host de 8 núcleos físicos.</p>')
    a('  </details>')
    a('</figure>')

    dados = [{"t": t, "v": [s[3][i] for s in SERIES]} for i, t in enumerate(THREADS)]
    nomes = [s[1] for s in SERIES]
    slots = [s[0] for s in SERIES]
    xs = [round(X(i), 1) for i in range(len(THREADS))]

    a('')
    a('<script>')
    a('(function () {')
    a('  var fig = document.currentScript.previousElementSibling;')
    a('  var svg = fig.querySelector("svg"), tip = fig.querySelector(".viz__tooltip");')
    a('  var mira = fig.querySelector(".viz__mira"), linha = mira.querySelector("line");')
    a(f'  var dados = {dados}, nomes = {nomes}, slots = {slots}, xs = {xs}, larguraSvg = {W};'
      .replace("'", '"'))
    a('  function mostrar(alvo) {')
    a('    var i = +alvo.dataset.i, d = dados[i];')
    a('    linha.setAttribute("x1", xs[i]); linha.setAttribute("x2", xs[i]);')
    a('    mira.classList.add("viz__mira--on");')
    a('    tip.innerHTML = "<strong>" + d.t + (d.t > 1 ? " threads" : " thread") + "</strong>" +')
    a('      nomes.map(function (nome, k) {')
    a('        return "<span class=\\"viz__tl\\"><span class=\\"viz__marca viz__marca--" + slots[k] +')
    a('               "\\"></span>" + nome + "<b>" + d.v[k].toFixed(2).replace(".", ",") + " s</b></span>";')
    a('      }).join("");')
    a('    var cx = svg.getBoundingClientRect(), cf = fig.getBoundingClientRect();')
    a('    var px = cx.left - cf.left + (xs[i] / larguraSvg) * cx.width;')
    a('    tip.hidden = false;')
    a('    tip.style.left = Math.min(Math.max(px - tip.offsetWidth / 2, 0),')
    a('                              fig.clientWidth - tip.offsetWidth) + "px";')
    a('  }')
    a('  fig.querySelectorAll(".viz__alvo").forEach(function (alvo) {')
    a('    ["mouseenter", "mousemove", "focus"].forEach(function (ev) {')
    a('      alvo.addEventListener(ev, function () { mostrar(alvo); });')
    a('    });')
    a('  });')
    a('  function esconder() { tip.hidden = true; mira.classList.remove("viz__mira--on"); }')
    a('  fig.querySelector(".viz__plot").addEventListener("mouseleave", esconder);')
    a('  fig.addEventListener("focusout", function (e) {')
    a('    if (!fig.contains(e.relatedTarget)) esconder();')
    a('  });')
    a('})();')
    a('</script>')

    destino = Path("_includes/grafico-benchmark.html")
    destino.write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"gerado {destino} ({len(L)} linhas, {len(SERIES)} séries, {len(THREADS)} pontos)")


if __name__ == "__main__":
    main()
