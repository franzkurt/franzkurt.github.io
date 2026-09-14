#!/usr/bin/env python3
"""Narração dos artigos com Piper (TTS local, sem API, sem rede).

    tools/gerar-audio.py --post _posts/2026-09-14-....md --texto   # só o roteiro
    tools/gerar-audio.py --post _posts/2026-09-14-....md
    tools/gerar-audio.py --todos                                   # os que faltam
    tools/gerar-audio.py --todos --refazer                          # regenera tudo

A limpeza de texto segue o que o informante-diario aprendeu ouvindo defeito:
ler é diferente de ouvir, quem ouve não pode voltar. As funções de locução vêm
de lá (radio.py); o que muda aqui é que artigo tem código, tabela e figura —
coisas que não se leem em voz alta e precisam ser ANUNCIADAS, não engolidas,
senão o ouvinte não percebe que ficou faltando algo.

Requer: piper em ~/.local/piper (binário + modelo .onnx) e ffmpeg para o MP3.
Sem qualquer um dos dois, o script diz o que falta e sai — não gera meio áudio.
"""
import argparse, re, shutil, subprocess, sys, tempfile, unicodedata, wave
from pathlib import Path

SILENCIO_POR_FRASE = 0.35      # padrão do piper é 0,2 e cola as frases
PAUSA_ENTRE_SECOES = 0.75      # maior que a pausa de frase: marca a mudança de assunto
BITRATE = "48k"               # fala mono: 48 kbps basta, e o MP3 fica no histórico do git para sempre
PIPER_DIR = Path("~/.local/piper").expanduser()
IMAGEM_FFMPEG = "localhost/ffmpeg-audio"

# ── o que não se lê em voz alta (vindo de radio.py) ──────────────────────────
URL = re.compile(r"https?://\S+|www\.\S+")
ESPACOS = re.compile(r"\s+")
ANTES_DE_PONTUACAO = re.compile(r"\s+([,;.!?])")
PONTUACAO_DOBRADA = re.compile(r"([,;])(?:\s*[,;])+")


def para_locucao(t):
    t = URL.sub("", t or "")
    t = t.replace("—", ",").replace("–", ",").replace("|", ",")
    t = ESPACOS.sub(" ", t)
    t = ANTES_DE_PONTUACAO.sub(r"\1", t)
    t = PONTUACAO_DOBRADA.sub(r"\1", t)
    t = t.strip(" ,;")
    if t and t[-1] not in ".!?:":
        t += "."
    return t


# ── marcação que o olho entende e o ouvido não ──────────────────────────────
def roteiro(markdown, titulo, autor, data_extenso):
    """Markdown -> lista de blocos falados. Cada bloco vira um WAV."""
    corpo = markdown
    if corpo.startswith("---"):
        corpo = corpo.split("---", 2)[2]

    blocos = [para_locucao(titulo), f"Por {autor}. Publicado em {data_extenso}."]
    omitidos = {"codigo": 0, "tabela": 0, "figura": 0}

    linhas = corpo.split("\n")
    i, paragrafo, item_aberto = 0, [], False

    def fecha_paragrafo():
        # item de lista continua nas linhas indentadas seguintes; fechar por
        # linha partiria a frase no meio — na página o olho reconstrói, no
        # ouvido o ouvinte só escuta uma frase truncada e outra sem começo
        nonlocal paragrafo, item_aberto
        if paragrafo:
            texto = limpa_inline(" ".join(paragrafo))
            if texto:
                blocos.append(para_locucao(texto))
            paragrafo = []
        item_aberto = False

    while i < len(linhas):
        l = linhas[i]

        if l.strip().startswith("```"):                      # bloco de código
            fecha_paragrafo()
            lang = l.strip().strip("`").strip() or "código"
            i += 1
            n = 0
            while i < len(linhas) and not linhas[i].strip().startswith("```"):
                n += 1
                i += 1
            i += 1
            omitidos["codigo"] += 1
            blocos.append(f"Aqui vai um bloco de {lang} com {n} linhas, "
                          f"disponível no texto do artigo.")
            continue

        if l.strip().startswith("<figure"):                   # figura
            fecha_paragrafo()
            legenda = ""
            while i < len(linhas) and "</figure>" not in linhas[i]:
                m = re.search(r"<figcaption>(.*?)</figcaption>", linhas[i])
                if m:
                    legenda = m.group(1)
                i += 1
            i += 1
            omitidos["figura"] += 1
            blocos.append(para_locucao("Imagem: " + legenda) if legenda
                          else "Segue uma imagem, disponível no texto.")
            continue

        if l.strip().startswith("|") and l.strip().endswith("|"):   # tabela
            fecha_paragrafo()
            linhas_tabela = 0
            while i < len(linhas) and linhas[i].strip().startswith("|"):
                linhas_tabela += 1
                i += 1
            omitidos["tabela"] += 1
            dados = max(linhas_tabela - 2, 0)     # cabeçalho + separador
            blocos.append(f"Segue uma tabela com {dados} linhas de dados, "
                          f"disponível no texto.")
            continue

        if l.strip().startswith("{%") or l.strip().startswith("<!--"):
            i += 1
            continue

        if l.startswith("#"):                                  # título de seção
            fecha_paragrafo()
            texto = limpa_inline(l.lstrip("#").strip())
            if texto:
                blocos.append(para_locucao(texto))
            i += 1
            continue

        if l.strip() in ("---", "***", "___"):
            fecha_paragrafo()
            i += 1
            continue

        if not l.strip():
            fecha_paragrafo()
            i += 1
            continue

        item = re.match(r"^\s*(?:[-*+]|\d+\.)\s+(.*)", l)      # item de lista
        if item:
            fecha_paragrafo()
            paragrafo.append(item.group(1))
            item_aberto = True
            i += 1
            continue

        if item_aberto and l.startswith((" ", "\t")):          # continuação do item
            paragrafo.append(l.strip())
            i += 1
            continue

        paragrafo.append(re.sub(r"^\s*>\s?", "", l))           # citação vira texto
        i += 1

    fecha_paragrafo()
    blocos.append("Fim do artigo. O texto completo, com o código e as tabelas, "
                  "está na página.")
    return [b for b in blocos if b and b.strip(" .")], omitidos


def limpa_inline(t):
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", t)          # imagem
    t = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", t)      # link: fica o texto
    t = re.sub(r"`([^`]*)`", r"\1", t)                  # código embutido
    t = re.sub(r"\*{1,3}([^*]+)\*{1,3}", r"\1", t)      # ênfase
    t = re.sub(r"<[^>]+>", "", t)                       # html solto
    t = t.replace("&nbsp;", " ").replace("&amp;", "e")
    return ESPACOS.sub(" ", t).strip()


# ── síntese ──────────────────────────────────────────────────────────────────
def falar(texto, saida):
    exe = PIPER_DIR / "piper" / "piper"
    modelo = next(PIPER_DIR.glob("*.onnx"), None)
    r = subprocess.run([str(exe), "--model", str(modelo),
                        "--sentence_silence", str(SILENCIO_POR_FRASE),
                        "--output_file", str(saida)],
                       input=texto, capture_output=True, text=True, timeout=900)
    if r.returncode != 0 or not saida.exists():
        return None, (r.stderr or "").strip()[:200]
    return saida, None


def juntar(partes, destino, pausa=PAUSA_ENTRE_SECOES):
    with wave.open(str(partes[0])) as w:
        par = w.getparams()
    mudo = b"\x00" * int(par.framerate * pausa) * par.sampwidth * par.nchannels
    with wave.open(str(destino), "wb") as s:
        s.setparams(par)
        for n, p in enumerate(partes):
            with wave.open(str(p)) as w:
                s.writeframes(w.readframes(w.getnframes()))
            if n < len(partes) - 1:
                s.writeframes(mudo)


def para_mp3(wav, mp3):
    r = subprocess.run(
        ["podman", "run", "--rm", "-v", f"{wav.parent}:/a", "-w", "/a",
         IMAGEM_FFMPEG, "ffmpeg", "-y", "-loglevel", "error",
         "-i", wav.name, "-codec:a", "libmp3lame", "-b:a", BITRATE,
         "-ac", "1", mp3.name],
        capture_output=True, text=True, timeout=900)
    return mp3.exists(), (r.stderr or "").strip()[:200]


def duracao(wav):
    with wave.open(str(wav)) as w:
        seg = w.getnframes() / w.getframerate()
    return seg, f"{int(seg // 60)}:{int(seg % 60):02d}"


MESES = ("janeiro fevereiro março abril maio junho julho agosto setembro "
         "outubro novembro dezembro").split()


def frontmatter(texto):
    if not texto.startswith("---"):
        return {}
    bloco = texto.split("---", 2)[1]
    dados = {}
    for l in bloco.split("\n"):
        if ":" in l and not l.startswith(" "):
            k, v = l.split(":", 1)
            dados[k.strip()] = v.strip().strip('"')
    return dados


def grava_frontmatter(caminho, chave, valor):
    t = caminho.read_text(encoding="utf-8")
    cabeca, corpo = t.split("---", 2)[1], t.split("---", 2)[2]
    linhas = [l for l in cabeca.split("\n") if not l.startswith(f"{chave}:")]
    while linhas and not linhas[-1].strip():
        linhas.pop()
    linhas.append(f"{chave}: {valor}")
    caminho.write_text("---" + "\n".join(linhas) + "\n---" + corpo, encoding="utf-8")


def processa(post, args, autor):
    texto = post.read_text(encoding="utf-8")
    fm = frontmatter(texto)
    titulo = fm.get("title", post.stem)
    data = fm.get("date", "")[:10]
    try:
        ano, mes, dia = data.split("-")
        extenso = f"{int(dia)} de {MESES[int(mes) - 1]} de {ano}"
    except Exception:
        extenso = ""

    slug = re.sub(r"^\d{4}-\d{2}-\d{2}-", "", post.stem)
    blocos, omitidos = roteiro(texto, titulo, autor, extenso)
    palavras = sum(len(b.split()) for b in blocos)

    if args.texto:
        print(f"\n═══ {titulo} ═══")
        print(f"{len(blocos)} blocos, {palavras} palavras, "
              f"~{palavras / 150:.1f} min estimados")
        print(f"omitido e anunciado: {omitidos['codigo']} bloco(s) de código, "
              f"{omitidos['tabela']} tabela(s), {omitidos['figura']} figura(s)")
        for b in blocos:
            print("  ·", b[:150])
        return True

    destino = Path("assets/audio") / f"{slug}.mp3"
    if destino.exists() and not args.refazer:
        print(f"  [pula] {slug} — áudio já existe")
        return True

    destino.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        partes, falhas = [], []
        for n, bloco in enumerate(blocos):
            alvo = tmp / f"{n:04d}.wav"
            ok, erro = falar(bloco, alvo)
            if ok:
                partes.append(alvo)
            else:
                falhas.append((n, erro, bloco[:60]))
        if not partes:
            print(f"  [ERRO] {slug}: nenhum bloco sintetizado")
            return False
        if falhas:                       # falha por bloco é reportada, não engolida
            print(f"  [ERRO] {slug}: {len(falhas)} de {len(blocos)} blocos falharam")
            for n, erro, trecho in falhas[:3]:
                print(f"         bloco {n}: {erro} — “{trecho}…”")
            return False

        wav = tmp / "completo.wav"
        juntar(partes, wav)
        seg, mmss = duracao(wav)
        mp3 = tmp / f"{slug}.mp3"
        ok, erro = para_mp3(wav, mp3)
        if not ok:
            print(f"  [ERRO] {slug}: ffmpeg falhou — {erro}")
            return False
        shutil.copy(mp3, destino)

    grava_frontmatter(post, "audio", f"/assets/audio/{slug}.mp3")
    grava_frontmatter(post, "audio_duracao", f'"{mmss}"')
    print(f"  [ok] {slug} — {mmss}, {destino.stat().st_size // 1024} KB, "
          f"{len(blocos)} blocos")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--post")
    ap.add_argument("--todos", action="store_true")
    ap.add_argument("--texto", action="store_true", help="imprime o roteiro, não gera áudio")
    ap.add_argument("--refazer", action="store_true")
    ap.add_argument("--autor", default="Franz Kurt")
    args = ap.parse_args()

    if not args.texto:
        exe = PIPER_DIR / "piper" / "piper"
        if not exe.exists() or next(PIPER_DIR.glob("*.onnx"), None) is None:
            sys.exit(f"piper não encontrado em {PIPER_DIR} (binário e modelo .onnx)")
        r = subprocess.run(["podman", "image", "exists", IMAGEM_FFMPEG])
        if r.returncode != 0:
            sys.exit(f"imagem {IMAGEM_FFMPEG} não existe — construa antes de gerar MP3")

    if args.post:
        alvos = [Path(args.post)]
    elif args.todos:
        alvos = sorted(Path("_posts").glob("*.md"), reverse=True)
    else:
        sys.exit("informe --post ou --todos")
    if not alvos:
        sys.exit("ERRO: nenhum post encontrado")

    ok = sum(1 for p in alvos if processa(p, args, args.autor))
    print(f"\n{ok}/{len(alvos)} processado(s)")
    sys.exit(0 if ok == len(alvos) else 1)


if __name__ == "__main__":
    main()
