#!/usr/bin/env python3
"""Importa artigos do feed RSS do Medium para _posts/ como Markdown.

    tools/importar-medium.py --usuario franzkurt
    tools/importar-medium.py --usuario franzkurt --dry-run
    tools/importar-medium.py --arquivo medium.xml        # feed já baixado

O feed do Medium entrega o artigo inteiro em <content:encoded>, então não é
preciso raspar o site nem contornar paywall.

Falhas NÃO são engolidas: cada imagem que não baixar é contada com o motivo, e
o script termina com código 1 se nada foi convertido ou se houve falha de
imagem — um import silenciosamente incompleto é pior que um import que falha.
"""
import argparse, html, os, re, sys, unicodedata, urllib.request, urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

NS = {"content": "http://purl.org/rss/1.0/modules/content/"}
FUSO = timezone(timedelta(hours=-3))
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"


def slug(texto, limite=70):
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    t = re.sub(r"[^\w\s-]", "", t.lower())
    t = re.sub(r"[\s_-]+", "-", t).strip("-")
    return t[:limite].rstrip("-")


class ParaMarkdown(HTMLParser):
    """Converte o subconjunto de HTML que o Medium produz.

    Tags observadas no feed: a, blockquote, br, em, figcaption, figure,
    h3, h4, iframe, img, li, p, strong, ul, ol.
    """

    def __init__(self, ao_encontrar_imagem):
        super().__init__(convert_charrefs=True)
        self.ao_encontrar_imagem = ao_encontrar_imagem
        self.blocos, self.buf = [], []
        self.pilha = []
        self.href = None
        self.marcas = []          # pilha de ênfases abertas
        self.figura = None          # {"src":..., "alt":..., "legenda":...}
        self.em_legenda = False
        self.desconhecidas = set()

    # -- utilidades --------------------------------------------------------
    def _fecha(self):
        texto = "".join(self.buf).strip()
        self.buf = []
        return re.sub(r"[ \t]+", " ", texto)

    def _empurra(self, texto):
        if texto:
            self.blocos.append(texto)

    # -- eventos -----------------------------------------------------------
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("p", "h3", "h4", "blockquote", "li", "ul", "ol"):
            self.pilha.append(tag)
        elif tag == "figure":
            self.figura = {"src": None, "alt": "", "legenda": ""}
        elif tag == "figcaption":
            self.em_legenda = True
            self.buf = []
        elif tag == "img":
            src = a.get("src", "")
            if "medium.com/_/stat" in src or a.get("width") == "1":
                return                                   # pixel de rastreio
            if self.figura is not None:
                self.figura["src"] = src
                self.figura["alt"] = a.get("alt", "")
            else:
                destino = self.ao_encontrar_imagem(src)
                self._empurra(f'<figure>\n  <img src="{destino}" alt="">\n</figure>')
        elif tag == "a":
            self.href = a.get("href", "")
            self.buf.append("[")
        elif tag in ("strong", "em"):
            marca = "**" if tag == "strong" else "*"
            self.buf.append(marca)
            self.marcas.append((len(self.buf) - 1, marca))
        elif tag == "br":
            self.buf.append("\n")
        elif tag == "iframe":
            src = a.get("src", "")
            alvo = re.search(r"src=([^&]+)", src)
            url = urllib.parse.unquote(alvo.group(1)) if alvo else src
            url = re.sub(r"youtube\.com/embed/([\w-]+).*", r"youtube.com/watch?v=\1", url)
            self._empurra(f"[Vídeo: {url}]({url})")
        elif tag not in ("figcaption", "img", "br", "iframe", "figure", "a",
                         "strong", "em", "span", "div", "h1", "h2", "pre", "code"):
            self.desconhecidas.add(tag)

    def handle_endtag(self, tag):
        if tag == "a":
            self.buf.append(f"]({self.href})")
            self.href = None
        elif tag in ("strong", "em"):
            # o Medium envolve espaços em <strong>/<em>; marcação vazia é lixo
            marca = "**" if tag == "strong" else "*"
            if self.marcas and self.marcas[-1][1] == marca:
                i, _ = self.marcas.pop()
                if not "".join(self.buf[i + 1:]).strip():
                    del self.buf[i]          # descarta a abertura e o par inteiro
                    return
            self.buf.append(marca)
        elif tag == "figcaption":
            if self.figura is not None:
                self.figura["legenda"] = self._fecha()
            self.em_legenda = False
        elif tag == "figure":
            f, self.figura = self.figura, None
            if f and f["src"]:
                destino = self.ao_encontrar_imagem(f["src"])
                alt = html.escape(f["legenda"] or f["alt"], quote=True)
                partes = [f'<figure>', f'  <img src="{destino}" alt="{alt}">']
                if f["legenda"]:
                    partes.append(f'  <figcaption>{f["legenda"]}</figcaption>')
                partes.append("</figure>")
                self._empurra("\n".join(partes))
        elif tag in ("p", "h3", "h4", "blockquote", "li"):
            texto = self._fecha()
            if self.pilha and self.pilha[-1] == tag:
                self.pilha.pop()
            if not texto:
                return
            if tag == "h3":
                self._empurra(f"## {texto}")
            elif tag == "h4":
                self._empurra(f"### {texto}")
            elif tag == "blockquote":
                self._empurra("\n".join("> " + l for l in texto.split("\n")))
            elif tag == "li":
                self._empurra("- " + texto.replace("\n", " "))
            else:
                self._empurra(texto)
        elif tag in ("ul", "ol") and self.pilha and self.pilha[-1] == tag:
            self.pilha.pop()

    def handle_data(self, dados):
        self.buf.append(dados)

    @staticmethod
    def _corrige_enfase(texto):
        """`***X ***` não é ênfase em Markdown: o espaço tem de sair de dentro."""
        def mover(m):
            marca, dentro = m.group(1), m.group(2)
            esq = len(dentro) - len(dentro.lstrip())
            dir_ = len(dentro) - len(dentro.rstrip())
            nucleo = dentro.strip()
            if not nucleo:
                return m.group(0)
            return " " * esq + marca + nucleo + marca + " " * dir_
        return re.sub(r"(\*{1,3})([^*]+?)\1", mover, texto)

    def resultado(self):
        self._empurra(self._fecha())
        self.blocos = [self._corrige_enfase(b) for b in self.blocos]
        saida, anterior_li = [], False
        for b in self.blocos:
            e_li = b.startswith("- ")
            if saida and not (e_li and anterior_li):
                saida.append("")
            saida.append(b)
            anterior_li = e_li
        return "\n".join(saida).strip()


def baixar(url, destino, tempo=30):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=tempo) as r:
        dados = r.read()
        tipo = r.headers.get("Content-Type", "")
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(dados)
    return len(dados), tipo


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--usuario", help="nome de usuário no Medium (sem @)")
    ap.add_argument("--arquivo", help="feed XML já baixado")
    ap.add_argument("--dry-run", action="store_true", help="não escreve nada")
    ap.add_argument("--destino", default="_posts")
    ap.add_argument("--imagens", default="assets/img/medium")
    args = ap.parse_args()

    if args.arquivo:
        xml = Path(args.arquivo).read_bytes()
    elif args.usuario:
        url = f"https://medium.com/feed/@{args.usuario}"
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        xml = urllib.request.urlopen(req, timeout=30).read()
    else:
        sys.exit("informe --usuario ou --arquivo")

    canal = ET.fromstring(xml).find("channel")
    itens = canal.findall("item")
    print(f"feed: {canal.findtext('title')}")
    print(f"artigos encontrados: {len(itens)}\n")
    if not itens:
        sys.exit("ERRO: o feed não trouxe nenhum artigo — nada a importar")

    convertidos = 0
    escritos = []
    falhas_img = []
    tags_vistas = set()

    for it in itens:
        titulo = it.findtext("title", "").strip()
        link = it.findtext("link", "").split("?")[0]
        corpo = it.findtext("content:encoded", "", NS)
        data = datetime.strptime(it.findtext("pubDate"), "%a, %d %b %Y %H:%M:%S %Z")
        data = data.replace(tzinfo=timezone.utc).astimezone(FUSO)
        s = slug(titulo)
        tags = []
        for c in it.findall("category"):
            t = unicodedata.normalize("NFC", (c.text or "").strip())
            t = t.replace("̇", "")          # i com ponto extra vindo do Medium
            if t:
                tags.append(t)
        tags_vistas.update(tags)

        pasta_img = Path(args.imagens) / s
        contador = {"n": 0}
        mapa = {}

        def registra(src, _pasta=pasta_img, _c=contador, _m=mapa):
            if src in _m:
                return _m[src]
            _c["n"] += 1
            ext = re.search(r"\.(jpe?g|png|gif|webp)", src.lower())
            ext = ext.group(1) if ext else "jpg"
            destino = f"/{_pasta}/{_c['n']:02d}.{ext}"
            _m[src] = destino
            return destino

        p = ParaMarkdown(registra)
        p.feed(corpo)
        markdown = p.resultado()
        if p.desconhecidas:
            print(f"  ! tags HTML não tratadas em '{titulo[:40]}': {p.desconhecidas}")

        primeiro = next((b for b in markdown.split("\n\n")
                         if b and not b.startswith(("#", "<", ">", "-", "["))), "")
        descricao = re.sub(r"[*\[\]]|\(https?://[^)]+\)", "", primeiro)
        descricao = re.sub(r"\s+", " ", descricao).strip()
        if len(descricao) > 180:
            descricao = descricao[:177].rsplit(" ", 1)[0] + "…"

        arquivo = Path(args.destino) / f"{data:%Y-%m-%d}-{s}.md"
        fm = [
            "---",
            f'title: "{titulo.replace(chr(34), chr(39))}"',
            f"date: {data:%Y-%m-%d %H:%M:%S %z}",
            f"tags: [{', '.join(tags)}]",
            f'description: "{descricao}"',
            f"canonical_url: {link}",
            f"medium_url: {link}",
            "---",
            "",
        ]
        conteudo = "\n".join(fm) + markdown + "\n"

        print(f"[{data:%Y-%m-%d}] {titulo[:55]}")
        print(f"    -> {arquivo}  ({len(markdown.split())} palavras, {len(mapa)} imagem(ns))")

        if args.dry_run:
            convertidos += 1
            continue

        for src, destino in mapa.items():
            alvo = Path(destino.removeprefix("/"))   # remove o prefixo, não os caracteres
            if alvo.exists():
                continue
            try:
                n, tipo = baixar(src, alvo)
                if n < 500:
                    falhas_img.append((titulo, src, f"resposta suspeita: {n} bytes, {tipo}"))
            except Exception as e:                      # motivo registrado, não engolido
                falhas_img.append((titulo, src, f"{type(e).__name__}: {e}"))
        arquivo.parent.mkdir(parents=True, exist_ok=True)
        arquivo.write_text(conteudo, encoding="utf-8")
        escritos.append(arquivo)
        convertidos += 1

    # ênfase desbalanceada sobrevive à conversão quando o original parte uma
    # palavra entre duas tags; não dá para adivinhar a intenção, então reporta
    suspeitas = []
    for arq in sorted(escritos):                 # só o que este import gerou
        for n, linha in enumerate(arq.read_text(encoding="utf-8").split("\n"), 1):
            if re.search(r"\*{4,}", linha):     # 4+ asteriscos seguidos é sempre artefato
                suspeitas.append((arq.name, n, linha.strip()[:90]))

    print()
    print("=" * 62)
    print(f"artigos convertidos: {convertidos}/{len(itens)}")
    if suspeitas:
        print(f"\nREVISAR À MÃO — ênfase possivelmente desbalanceada: {len(suspeitas)}")
        for nome, n, linha in suspeitas:
            print(f"  • {nome}:{n}\n    {linha}")
    print(f"tags distintas importadas: {len(tags_vistas)}")
    if falhas_img:
        print(f"\nFALHAS DE IMAGEM: {len(falhas_img)}")
        for t, src, motivo in falhas_img:
            print(f"  • {t[:35]}: {motivo}\n    {src[:90]}")
    if convertidos == 0:
        sys.exit("ERRO: nenhum artigo convertido")
    if falhas_img:
        sys.exit(f"ERRO: import incompleto — {len(falhas_img)} imagem(ns) não baixada(s)")
    print("\nimport completo, sem falhas.")


if __name__ == "__main__":
    import urllib.parse
    main()
