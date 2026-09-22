#!/usr/bin/env python3
"""selo-casa.py — estimativa indicativa da classe de eficiência de uma casa
e do quanto a decisão de projeto vale em reais no sistema fotovoltaico.

O QUE ISTO É: uma conta aberta, para você ver quais decisões pesam e quanto.
O QUE ISTO NÃO É: uma ENCE. A etiqueta oficial do PBE Edifica sai pelos métodos
da INI-R (prescritivo, simplificado ou simulação), exige dados que não estão
aqui e é emitida por Organismo de Inspeção Acreditado pelo Inmetro. Este script
não substitui nem antecipa aquele resultado.

Âncora usada: pela INI-R, atender o procedimento simplificado da NBR 15575
equivale à classe C da envoltória — ou seja, o mínimo obrigatório é um C, não
um A. Subir daí exige avaliação por método simplificado ou simulação.

Uso:
    python3 selo-casa.py                 # roda os três perfis de exemplo
    python3 selo-casa.py --json casa.json
"""
from __future__ import annotations
import argparse, json, sys
from dataclasses import dataclass, field, asdict

# ── dados que o script precisa e de onde vêm ─────────────────────────────────
# Fio B: percentual da TUSD-fio B pago sobre a energia COMPENSADA, art. 27 da
# Lei 14.300/2022 (incisos I a VI, de 2023 a 2028).
#
# ATENÇÃO ao que vem depois: o inciso VII NÃO traz percentual. Ele manda aplicar
# "a regra disposta no art. 17 desta Lei a partir de 2029". E o art. 17 fatura
# "todas as componentes tarifárias não associadas ao custo da energia" — base
# mais ampla que o fio B — abatidos "todos os benefícios ao sistema elétrico",
# conforme regulação da ANEEL. Logo, 100% em 2029 é CENÁRIO, não lei.
FIO_B_POR_ANO = {2023: 0.15, 2024: 0.30, 2025: 0.45,
                 2026: 0.60, 2027: 0.75, 2028: 0.90}
FIO_B_2029_CENARIO = 1.00   # cenário, não previsão

# Irradiação anual no plano inclinado (kWh/m²·ano), céu claro, calculada com
# pvlib (posição solar + Ineichen + Hay-Davies). Céu claro superestima o
# ABSOLUTO; as RAZÕES entre orientações, que é o que decide aqui, são robustas.
# Reproduza com tools/orientacao-telhado.py.
PERDA_ORIENTACAO = {   # (cidade, inclinação_graus) -> {azimute: fração do norte}
    "generico": {
        # interpolação conservadora para telhado brasileiro típico (15°–25°)
        "norte": 1.00, "nordeste": 0.97, "noroeste": 0.97,
        "leste": 0.89, "oeste": 0.89,
        "sudeste": 0.80, "sudoeste": 0.80, "sul": 0.76,
    }
}

@dataclass
class Casa:
    nome: str = "casa"
    # ── envoltória ──────────────────────────────────────────────────────────
    atende_nbr15575: bool = True      # o mínimo legal; False = abaixo do mínimo
    ventilacao_cruzada: bool = False  # aberturas em fachadas opostas
    sombreamento_oeste: bool = False  # beiral/brise/veneziana no sol da tarde
    inercia_termica: bool = False     # massa (alvenaria pesada, laje) exposta
    cobertura_ventilada: bool = False # ático ventilado ou telha com câmara de ar
    area_envidracada_alta: bool = False  # vidro grande sem proteção = penalidade
    # ── geração ─────────────────────────────────────────────────────────────
    orientacao_telhado: str = "norte"
    potencia_kwp: float = 5.0
    geracao_kwh_kwp_ano: float = 1_350.0   # norte, típico Sudeste
    # ── consumo ─────────────────────────────────────────────────────────────
    consumo_kwh_mes: float = 500.0
    ocupacao_diurna: str = "parcial"   # "vazia" | "parcial" | "cheia"
    desloca_cargas_p_dia: bool = False # máquina/louça/aquecimento ao meio-dia
    # ── tarifa ──────────────────────────────────────────────────────────────
    tarifa_cheia: float = 0.95      # R$/kWh, tudo incluído
    tusd_fio_b: float = 0.25        # R$/kWh, parcela fio B da tarifa
    custo_sistema: float = 0.0      # 0 = estima por R$/kWp
    preco_por_kwp: float = 4_500.0

# ── envoltória → classe indicativa ───────────────────────────────────────────
# Pontos são uma ponderação TRANSPARENTE, não um método normativo. Servem para
# ordenar decisões, não para emitir etiqueta.
PESOS = [
    ("ventilacao_cruzada",   2, "ventilação cruzada (aberturas opostas)"),
    ("sombreamento_oeste",   2, "sombreamento no sol da tarde"),
    ("inercia_termica",      1, "inércia térmica exposta"),
    ("cobertura_ventilada",  2, "cobertura ventilada"),
]

def classe_envoltoria(c: Casa) -> tuple[str, int, list[str]]:
    """Devolve (classe, pontos, memória de cálculo)."""
    memoria = []
    if not c.atende_nbr15575:
        return "E", -1, ["não atende o procedimento simplificado da NBR 15575 — "
                         "abaixo do mínimo obrigatório"]
    pontos = 0
    memoria.append("atende a NBR 15575 → parte-se da classe C (o mínimo = C)")
    for campo, peso, rotulo in PESOS:
        if getattr(c, campo):
            pontos += peso
            memoria.append(f"+{peso}  {rotulo}")
        else:
            memoria.append(f" 0  sem {rotulo}")
    if c.area_envidracada_alta:
        pontos -= 2
        memoria.append("-2  área envidraçada alta sem proteção")
    classe = "C"
    if pontos >= 6: classe = "A"
    elif pontos >= 3: classe = "B"
    elif pontos <= -1: classe = "D"
    return classe, pontos, memoria

def br(v, casas=2):
    """Número no formato brasileiro. Só para NÚMEROS — nunca para a prosa,
    porque trocar vírgula por ponto no texto inteiro estraga "Lei 14.300"."""
    return f"{v:,.{casas}f}".translate(str.maketrans(",.", ".,"))

# ── fator de simultaneidade ──────────────────────────────────────────────────
BASE_OCUPACAO = {"vazia": 0.20, "parcial": 0.30, "cheia": 0.45}

def fator_simultaneidade(c: Casa) -> tuple[float, list[str]]:
    """Fração da geração consumida no instante em que é gerada.

    Modelo simples e declarado: parte da ocupação diurna, sobe com deslocamento
    de cargas e com envoltória boa (que adia/evita o ar-condicionado noturno),
    e CAI quando o sistema é grande demais para o consumo da casa.
    """
    f = BASE_OCUPACAO[c.ocupacao_diurna]
    memoria = [f"ocupação diurna '{c.ocupacao_diurna}' → base {f:.0%}"]
    if c.desloca_cargas_p_dia:
        f += 0.10; memoria.append("+10 pp  cargas deslocadas para o meio do dia")
    classe, _, _ = classe_envoltoria(c)
    bonus = {"A": 0.08, "B": 0.04, "C": 0.0, "D": -0.04, "E": -0.06}[classe]
    if bonus:
        f += bonus
        memoria.append(f"{bonus:+.0%} envoltória classe {classe} "
                       f"({'menos' if bonus > 0 else 'mais'} carga fora do sol)")
    # sobredimensionamento: geração anual muito acima do consumo derruba o fator
    ger = c.potencia_kwp * c.geracao_kwh_kwp_ano
    cons = c.consumo_kwh_mes * 12
    razao = ger / cons if cons else float("inf")
    if razao > 1.0:
        corte = min(0.9, (razao - 1.0) * 0.5)
        f *= (1 - corte)
        memoria.append(f"geração/consumo = {br(razao)} → sistema sobra, "
                       f"fator cortado em {corte:.0%}")
    return max(0.02, min(f, 0.95)), memoria

# ── economia e retorno ───────────────────────────────────────────────────────
def economia(c: Casa, ano: int) -> dict:
    fator_or = PERDA_ORIENTACAO["generico"].get(c.orientacao_telhado)
    if fator_or is None:
        raise SystemExit(f"orientação desconhecida: {c.orientacao_telhado!r}. "
                         f"use uma de {sorted(PERDA_ORIENTACAO['generico'])}")
    ger = c.potencia_kwp * c.geracao_kwh_kwp_ano * fator_or
    fs, mem_fs = fator_simultaneidade(c)
    direto, exportado = ger * fs, ger * (1 - fs)

    if ano in FIO_B_POR_ANO:
        pct, origem = FIO_B_POR_ANO[ano], "art. 27 da Lei 14.300"
    else:
        pct, origem = FIO_B_2029_CENARIO, "CENÁRIO (a lei manda a ANEEL revisar)"

    # energia usada na hora vale a tarifa cheia; a exportada e recomprada
    # perde a parcela do fio B aplicada no ano
    valor_direto = direto * c.tarifa_cheia
    valor_export = exportado * (c.tarifa_cheia - c.tusd_fio_b * pct)
    custo_fio_b = exportado * c.tusd_fio_b * pct
    custo = c.custo_sistema or c.potencia_kwp * c.preco_por_kwp
    total = valor_direto + valor_export
    return {
        "ano": ano, "pct_fio_b": pct, "origem_pct": origem,
        "fator_orientacao": fator_or, "geracao_kwh_ano": ger,
        "fator_simultaneidade": fs, "memoria_fs": mem_fs,
        "kwh_direto": direto, "kwh_exportado": exportado,
        "economia_ano": total, "custo_fio_b_ano": custo_fio_b,
        "investimento": custo,
        "payback_anos": custo / total if total > 0 else float("inf"),
    }

def relatorio(c: Casa, ano: int = 2026) -> str:
    classe, pontos, mem = classe_envoltoria(c)
    e = economia(c, ano)
    L = [f"╔═ {c.nome}", "║",
         f"║ ENVOLTÓRIA — classe indicativa: {classe}  ({pontos:+d} ponto(s))"]
    L += [f"║    {m}" for m in mem]
    L += ["║", f"║ GERAÇÃO — telhado {c.orientacao_telhado} "
               f"({e['fator_orientacao']:.0%} do que um telhado norte daria)",
          f"║    {br(c.potencia_kwp,1)} kWp → {br(e['geracao_kwh_ano'],0)} kWh/ano",
          "║", f"║ SIMULTANEIDADE — {e['fator_simultaneidade']:.0%} "
               f"da geração é usada na hora"]
    L += [f"║    {m}" for m in e["memoria_fs"]]
    L += ["║",
          f"║ DINHEIRO em {ano} (fio B a {e['pct_fio_b']:.0%} — {e['origem_pct']})",
          f"║    {br(e['kwh_direto'],0):>8} kWh usados na hora  → tarifa cheia",
          f"║    {br(e['kwh_exportado'],0):>8} kWh exportados     → tarifa menos o fio B",
          f"║    economia no ano:  R$ {br(e['economia_ano']):>10}",
          f"║    pago de fio B:    R$ {br(e['custo_fio_b_ano']):>10}",
          f"║    investimento:     R$ {br(e['investimento']):>10}",
          f"║    retorno em:       {br(e['payback_anos'],1)} anos",
          "╚" + "═" * 60]
    return "\n".join(L)


def tabela_anos(casas, anos=(2023, 2025, 2026, 2027, 2028, 2029)) -> str:
    """Como o retorno de CADA perfil anda conforme o fio B sobe."""
    L = ["Mesmo sistema, mesmo preço — o retorno conforme o fio B sobe:", ""]
    L.append(f"{'ano':>5s} {'fio B':>6s}   " +
             "  ".join(f"{c.nome.split(' — ')[0]:>7s}" for c in casas))
    for ano in anos:
        pct = FIO_B_POR_ANO.get(ano, FIO_B_2029_CENARIO)
        lin = f"{ano:5d} {pct:5.0%}   "
        for c in casas:
            lin += f"{br(economia(c, ano)['payback_anos'], 1):>6} a  "
        if ano not in FIO_B_POR_ANO:
            lin += "  ← cenário; a lei manda a ANEEL revisar"
        L.append(lin.rstrip())
    return "\n".join(L)

EXEMPLOS = [
    Casa(nome="A — casa pensada: telhado norte, envoltória boa, gente em casa",
         orientacao_telhado="norte", ventilacao_cruzada=True,
         sombreamento_oeste=True, inercia_termica=True, cobertura_ventilada=True,
         ocupacao_diurna="cheia", desloca_cargas_p_dia=True),
    Casa(nome="B — casa comum: telhado leste, só o mínimo da norma",
         orientacao_telhado="leste", ocupacao_diurna="parcial"),
    Casa(nome="C — casa que virou forno: telhado sul, vidro sem proteção, vazia de dia",
         orientacao_telhado="sul", area_envidracada_alta=True,
         ocupacao_diurna="vazia"),
]

def main() -> None:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--json", metavar="ARQ", help="arquivo com os campos de Casa")
    p.add_argument("--ano", type=int, default=2026)
    p.add_argument("--tabela", action="store_true",
                   help="mostra o retorno ano a ano em vez do relatório")
    a = p.parse_args()
    if a.json:
        with open(a.json, encoding="utf-8") as f:
            dados = json.load(f)
        validos = {c for c in Casa.__dataclass_fields__}
        if desconhecidos := set(dados) - validos:
            raise SystemExit(f"campo(s) desconhecido(s): {sorted(desconhecidos)}\n"
                             f"válidos: {sorted(validos)}")
        casas = [Casa(**dados)]
    else:
        casas = EXEMPLOS
    if a.tabela:
        print(tabela_anos(casas)); return
    for c in casas:
        print(relatorio(c, a.ano)); print()

if __name__ == "__main__":
    main()
