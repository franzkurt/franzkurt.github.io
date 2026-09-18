#!/usr/bin/env python3
"""Testa /ferramentas/ num navegador de verdade — o que o script shell não faz.

    tools/testar-ferramentas-navegador.py [--url http://localhost:8777]

Sem argumento, sobe um servidor sobre o _site já construído.

Existe porque a checagem estática aprova uma página cujas ferramentas não
funcionam. Em 17/09/2026 as 7 bibliotecas de CDN não estavam sendo carregadas e
NADA na página acusava: QR, PDF, código de barras, planilha e OCR ficavam mudos.
E o gerador de QR, com a biblioteca antiga, falhava em qualquer texto acentuado.

Precisa de playwright. Sem ele, o script diz o que falta e sai com 0 — não é
motivo para reprovar quem só quer publicar um artigo.
"""
import argparse, http.server, socketserver, subprocess, sys, tempfile, threading
from pathlib import Path

BLOG = Path(__file__).resolve().parent.parent
TEXTO = "Ação e çãõ — https://franzkurt.github.io/ferramentas/"


def serve():
    """Sobe o _site numa porta EFÊMERA e devolve (servidor, porta).

    Porta fixa não serve: cada execução deixa dezenas de conexões em TIME-WAIT,
    e neste ambiente nem SO_REUSEADDR permite religar por cima delas — a segunda
    execução seguida falhava com "Address already in use". Pedir 0 ao sistema
    faz ele escolher uma porta livre, e o problema deixa de existir.
    """
    d = BLOG / "_site"
    if not d.exists():
        print(f"erro: {d} não existe — rode o build antes", file=sys.stderr)
        sys.exit(2)

    class Quieto(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass      # o log de cada GET só atrapalha a leitura

    h = lambda *a, **k: Quieto(*a, directory=str(d), **k)
    srv = socketserver.TCPServer(("127.0.0.1", 0), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", help="testa uma URL já no ar, em vez de subir servidor")
    args = ap.parse_args()
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright não instalado — pulando o teste de navegador.")
        print("  uv pip install playwright && playwright install chromium")
        return 0

    srv = None
    base = args.url
    if not base:
        srv, porta = serve()
        base = f"http://127.0.0.1:{porta}"

    falhas = 0
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        p = b.new_page()
        erros = []
        p.on("pageerror", lambda e: erros.append(str(e)[:90]))
        p.goto(f"{base}/ferramentas/", wait_until="networkidle", timeout=90000)

        print("▸ Bibliotecas de terceiros, no navegador")
        libs = p.evaluate("""() => ({qrcode: typeof qrcode, jsQR: typeof jsQR,
          PDFLib: typeof PDFLib, pdfjsLib: typeof pdfjsLib, XLSX: typeof XLSX,
          JsBarcode: typeof JsBarcode, Tesseract: typeof Tesseract})""")
        for nome, tipo in libs.items():
            if tipo == "undefined":
                print(f"  ✗ {nome} não carregou"); falhas += 1
        print(f"  {sum(1 for v in libs.values() if v != 'undefined')}/{len(libs)} disponíveis")

        print("\n▸ Todas as ferramentas abrem")
        ids = p.evaluate("""() => [...document.querySelectorAll('.card')]
            .map(c => (c.getAttribute('onclick')||'').match(/openTool\\('([^']+)'\\)/)?.[1]).filter(Boolean)""")
        vazias = 0
        for tid in ids:
            p.evaluate(f"openTool({tid!r})")
            p.wait_for_timeout(120)
            if p.evaluate("() => document.querySelector('#tool-panel').innerText.trim().length < 20"):
                print(f"  ✗ {tid}: painel vazio"); vazias += 1
        falhas += vazias
        print(f"  {len(ids) - vazias}/{len(ids)} abrem com conteúdo")

        print("\n▸ Toda ferramenta explica o que entra e o que sai")
        sem = [tid for tid in ids if not p.evaluate(
            "(id) => { openTool(id); const c = document.querySelector('#tool-panel .como');"
            "  return !!c && c.querySelectorAll('.como-linha').length === 2; }", tid)]
        if sem:
            print(f"  ✗ sem explicação: {', '.join(sem[:6])}"); falhas += len(sem)
        print(f"  {len(ids) - len(sem)}/{len(ids)} com 'Como funciona'")

        print("\n▸ Tema claro e escuro")
        for tema in ("light", "dark"):
            p.evaluate(f"document.documentElement.setAttribute('data-theme','{tema}')")
            p.wait_for_timeout(200)
            m = p.evaluate("""() => {
              const raiz = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
              const fer = getComputedStyle(document.querySelector('#ferramentas')).getPropertyValue('--bg').trim();
              return {raiz, fer};
            }""")
            if m["raiz"] != m["fer"]:
                print(f"  ✗ {tema}: a caixa não segue o tema ({m['fer']} ≠ {m['raiz']})"); falhas += 1
            else:
                print(f"  ok  {tema}: fundo {m['fer']} acompanha o blog")

        print("\n▸ QR: gerar e ler de volta (com acento)")
        p.evaluate("openTool('qr-gen')"); p.wait_for_timeout(300)
        p.fill("#qr-text", TEXTO); p.wait_for_timeout(1200)
        dado = p.evaluate("""() => { const c = document.querySelector('#qr-output canvas');
                                     return c ? c.toDataURL() : null; }""")
        if not dado:
            print("  ✗ não gerou:", p.locator("#qr-output").inner_text()[:60]); falhas += 1
        else:
            import base64
            png = base64.b64decode(dado.split(",", 1)[1])
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
                f.write(png); caminho = f.name
            p.evaluate("openTool('qr-read')"); p.wait_for_timeout(300)
            p.set_input_files("#qrr-input", caminho); p.wait_for_timeout(400)
            p.evaluate("runQRRead()"); p.wait_for_timeout(2500)
            saida = p.locator("#qrr-out").inner_text()
            if TEXTO in saida:
                print(f"  ok  ida e volta preservou o texto ({len(png)} bytes)")
            else:
                print(f"  ✗ leu {saida.strip()[:70]!r}"); falhas += 1

        if erros:
            print("\n▸ Erros de página"); falhas += len(erros)
            for e in erros[:5]: print("  ✗", e)
        b.close()
    if srv:
        srv.shutdown()
        srv.server_close()   # shutdown para o laço; quem libera a porta é este

    print("\n──────────────────────────────────────────────")
    print("APROVADO" if not falhas else f"REPROVADO — {falhas} problema(s)")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
