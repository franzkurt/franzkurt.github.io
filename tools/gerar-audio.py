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

# ── Qwen3-TTS: parâmetros APROVADOS pelo Franz em 14/09/2026 ────────────────
# Ele ouviu quatro variantes da mesma frase (temp 0.9 padrão, 0.6, 0.35 e uma
# acelerada 12%) e escolheu esta. Não mexer sem ele pedir.
# Temperatura menor deixa a fala mais LENTA (13,1 s a 0.9 contra 15,7 s a
# 0.35 no mesmo texto); se a fala soar arrastada, acelere com ATEMPO abaixo,
# não suba a temperatura — isso afasta o timbre da referência.
QWEN_DIR = Path("~/.local/qwentts").expanduser()
QWEN_MODELO = "qwen-talker-0.6b-base-Q8_0.gguf"
QWEN_CODEC = "qwen-tokenizer-12hz-Q8_0.gguf"
QWEN_VOZ = QWEN_DIR / "voz" / "franz.wav"
QWEN_TEMP = 0.35
QWEN_SUB_TEMP = 0.35
QWEN_TOP_K = 20
QWEN_IDIOMA = "Portuguese"
QWEN_IMAGEM = "localhost/qwentts-run"
QWEN_PALAVRAS_POR_BLOCO = 110   # ~45 s de fala; o modelo tem teto de ~163 s
ATEMPO = 1.0                    # 1.0 = sem alteração; >1 acelera sem mudar o tom
PAUSA_ENTRE_SECOES = 0.55      # entre blocos: respiro de frase (as pausas de
                              # vírgula já vêm dentro de cada bloco, do modelo)
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

    # sem assinatura falada: o Franz pediu em 15/09/2026 que o áudio comece
    # pelo título e siga direto para o texto — quem ouve já sabe de quem é
    blocos = [para_locucao(titulo)]
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
def falar_qwen(texto, saida):
    """Qwen3-TTS com a voz do Franz, via qwentts.cpp em contêiner."""
    r = subprocess.run(
        ["podman", "run", "--rm", "-i", "--cpu-shares=256",
         "-v", f"{QWEN_DIR}:/q", "-v", f"{saida.parent}:/out",
         "-w", "/q", "-e", "LD_LIBRARY_PATH=/q/build",
         QWEN_IMAGEM, "nice", "-n", "19", "./build/qwen-tts",
         "--model", f"models/{QWEN_MODELO}",
         "--codec", f"models/{QWEN_CODEC}",
         "--ref-wav", f"voz/{QWEN_VOZ.name}",
         "--lang", QWEN_IDIOMA,
         "--temp", str(QWEN_TEMP), "--sub-temp", str(QWEN_SUB_TEMP),
         "--top-k", str(QWEN_TOP_K),
         "--max-new", "700",   # teto de frames: 700/12.5 = 56s/bloco. O default
                               # 2048 (163s) enche de silêncio quando a parada
                               # do modelo não é limpa — causou 79% de padding.
         "-o", f"/out/{saida.name}"],
        input=texto, capture_output=True, text=True, timeout=1800)
    if r.returncode != 0 or not saida.exists():
        return None, (r.stderr or r.stdout or "").strip()[-200:]
    # o Qwen deixa silêncio de padding no começo e no fim do bloco; aparar SÓ
    # as bordas (não o meio) tira o padding sem tocar nas pausas de vírgula.
    aparado = saida.with_suffix(".trim.wav")
    corte = ("silenceremove=start_periods=1:start_silence=0.08:start_threshold=-40dB:detection=peak,"
             "areverse,"
             "silenceremove=start_periods=1:start_silence=0.20:start_threshold=-40dB:detection=peak,"
             "areverse")
    rt = subprocess.run(
        ["podman", "run", "--rm", "-v", f"{saida.parent}:/out", "-w", "/out",
         IMAGEM_FFMPEG, "ffmpeg", "-y", "-loglevel", "error",
         "-i", saida.name, "-af", corte, aparado.name],
        capture_output=True, text=True, timeout=120)
    if rt.returncode == 0 and aparado.exists():
        aparado.replace(saida)
    return saida, None


def agrupa_para_qwen(blocos, teto=QWEN_PALAVRAS_POR_BLOCO):
    """Junta blocos curtos numa mesma chamada — cada chamada recarrega o modelo.

    Não junta através de um título de seção: é ali que a pausa longa precisa
    cair, e a pausa vem da montagem dos WAV, não do modelo.
    """
    grupos, atual, n = [], [], 0
    for b in blocos:
        curto = len(b.split()) < 12 and b.endswith(".") and len(b) < 90
        if atual and (n + len(b.split()) > teto or curto):
            grupos.append(" ".join(atual)); atual, n = [], 0
        atual.append(b); n += len(b.split())
        if curto and atual:
            grupos.append(" ".join(atual)); atual, n = [], 0
    if atual:
        grupos.append(" ".join(atual))
    return grupos


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
    filtros = [] if ATEMPO == 1.0 else ["-af", f"atempo={ATEMPO}"]
    r = subprocess.run(
        ["podman", "run", "--rm", "-v", f"{wav.parent}:/a", "-w", "/a",
         IMAGEM_FFMPEG, "ffmpeg", "-y", "-loglevel", "error",
         "-i", wav.name, *filtros, "-codec:a", "libmp3lame", "-b:a", BITRATE,
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
        sintetizar = falar_qwen if args.motor == "qwen" else falar
        unidades = agrupa_para_qwen(blocos) if args.motor == "qwen" else blocos
        partes, falhas = [], []
        for n, bloco in enumerate(unidades):
            alvo = tmp / f"{n:04d}.wav"
            ok, erro = sintetizar(bloco, alvo)
            if ok:
                partes.append(alvo)
            else:
                falhas.append((n, erro, bloco[:60]))
        if not partes:
            print(f"  [ERRO] {slug}: nenhum bloco sintetizado")
            return False
        if falhas:                       # falha por bloco é reportada, não engolida
            print(f"  [ERRO] {slug}: {len(falhas)} de {len(unidades)} blocos falharam")
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
    ap.add_argument("--motor", choices=("piper", "qwen"), default="qwen",
                    help="qwen = voz do Franz (padrão); piper = voz sintética faber")
    args = ap.parse_args()

    if not args.texto and args.motor == "qwen":
        if not (QWEN_DIR / "build" / "qwen-tts").exists():
            sys.exit(f"qwentts.cpp não encontrado em {QWEN_DIR}/build")
        if not QWEN_VOZ.exists():
            sys.exit(f"gravação de referência ausente: {QWEN_VOZ}")
        if subprocess.run(["podman", "image", "exists", QWEN_IMAGEM]).returncode != 0:
            sys.exit(f"imagem {QWEN_IMAGEM} não existe")
    if not args.texto and args.motor == "piper":
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
