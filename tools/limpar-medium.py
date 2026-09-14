#!/usr/bin/env python3
"""Remove os artefatos que a importação do Medium deixa nos artigos.

    tools/limpar-medium.py            aplica e reporta
    tools/limpar-medium.py --dry-run  só reporta

O feed do Medium embute tweet e vídeo como blocos que o Markdown não entende;
o import os deixou como lixo repetido. Cada padrão abaixo nasceu de um defeito
visto num artigo real, não de suposição.
"""
import argparse, re, unicodedata
from pathlib import Path


def norm(s):
    s = unicodedata.normalize("NFKD", s.lower())
    return re.sub(r"[^a-z0-9 ]", "", s)


def limpa(texto):
    linhas = texto.split("\n")
    saida, rel = [], {"tweet_embed": 0, "ingles_dup": 0, "media_cruft": 0,
                      "linha_vazia_dupla": 0}
    i = 0
    while i < len(linhas):
        l = linhas[i]

        # 1) header-embed de tweet: "#### Autor on Twitter: "texto / Twitter""
        m = re.match(r'^#{1,6}\s+.*\bon Twitter:\s*"(.*)"\s*$', l)
        if m:
            rel["tweet_embed"] += 1
            dentro = m.group(1)
            dentro = re.sub(r'https?://\S+', '', dentro)
            dentro = re.sub(r'/\s*Twitter\s*$', '', dentro).strip()
            i += 1
            # pula linhas em branco e o parágrafo em inglês que repete o embed
            j = i
            while j < len(linhas) and not linhas[j].strip():
                j += 1
            if j < len(linhas):
                cand = re.sub(r'https?://\S+|pic\.twitter\S+', '', linhas[j]).strip()
                if cand and norm(cand)[:40] and norm(cand)[:40] in norm(dentro):
                    rel["ingles_dup"] += 1
                    i = j + 1
            continue

        # 2) lixo de vídeo/mídia: "[https://medium.com/media/HASH/href](...)TEXTO"
        if "medium.com/media" in l:
            rel["media_cruft"] += 1
            # preserva o texto que grudou depois do link, se houver
            resto = re.sub(r'^#{0,6}\s*\[https?://medium\.com/media/\S+?\]\(\S+?\)', '', l).strip()
            # "href3. China —" -> "3. China —"
            resto = re.sub(r'^href', '', resto).strip()
            if resto:
                saida.append(resto)
            i += 1
            continue

        # 3) parágrafo solto de texto de tweet em inglês (sem header antes),
        #    reconhecível por terminar em "/ Twitter" ou pic.twitter
        if re.search(r'/\s*Twitter\s*$', l) and re.search(r'https?://t\.co|pic\.twitter', l):
            rel["ingles_dup"] += 1
            i += 1
            continue

        saida.append(l)
        i += 1

    # colapsa 3+ linhas em branco seguidas em uma só
    txt = "\n".join(saida)
    n_antes = len(re.findall(r'\n{3,}', txt))
    txt = re.sub(r'\n{3,}', '\n\n', txt)
    rel["linha_vazia_dupla"] = n_antes
    return txt, rel


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    posts = sorted(Path("_posts").glob("2021-*.md"))
    total = {}
    tocados = 0
    for p in posts:
        orig = p.read_text(encoding="utf-8")
        novo, rel = limpa(orig)
        mudou = novo != orig
        if mudou and not args.dry_run:
            p.write_text(novo, encoding="utf-8")
        if any(rel.values()):
            tocados += 1
            print(f"  {p.name[:50]}")
            for k, v in rel.items():
                if v:
                    print(f"      {k}: {v}")
            for k, v in rel.items():
                total[k] = total.get(k, 0) + v

    print(f"\n{tocados}/{len(posts)} artigos com artefatos"
          + (" (dry-run, nada gravado)" if args.dry_run else " — limpos"))
    if total:
        print("totais:", ", ".join(f"{k}={v}" for k, v in total.items()))


if __name__ == "__main__":
    main()
