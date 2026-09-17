/**
 * QRUtils — QR code generation and reading.
 *
 * CDN deps:
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
 *   <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"></script>
 *
 * Gerava com qrcodejs 1.0.0 até 17/09/2026. Ele escolhe a versão do QR pelo
 * número de CARACTERES e codifica em BYTES UTF-8, então qualquer acento
 * estourava: "acentuação e çãõ", com 16 caracteres e 21 bytes, falhava com
 * "code length overflow (236>208)" enquanto 100 caracteres ASCII passavam.
 * Não há conserto por fora — a opção typeNumber é ignorada, e pré-codificar
 * para UTF-8 só faz a biblioteca codificar duas vezes.
 *
 * startCameraScanner() depende de Html5Qrcode, que NÃO está carregado na
 * página: nenhuma ferramenta da grade usa a câmera hoje.
 */
class QRUtils {
  /** Desenha o QR num <canvas> novo. correctLevel: 'L', 'M', 'Q' ou 'H'. */
  static toCanvas(text, opts = {}) {
    const { width = 128, colorDark = '#000000', colorLight = '#ffffff',
            correctLevel = 'H' } = opts;
    if (typeof qrcode !== 'function') throw new Error('qrcode-generator não carregou');
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    const q = qrcode(0, correctLevel);          // 0 = escolhe a versão pelo conteúdo
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    const quieto = 4;                           // zona silenciosa exigida pela norma
    const escala = Math.max(1, Math.round(width / (n + quieto * 2)));
    const lado = (n + quieto * 2) * escala;
    const cv = document.createElement('canvas');
    cv.width = cv.height = lado;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = colorLight;
    ctx.fillRect(0, 0, lado, lado);
    ctx.fillStyle = colorDark;
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (q.isDark(r, c))
          ctx.fillRect((c + quieto) * escala, (r + quieto) * escala, escala, escala);
    return cv;
  }

  static generate(text, containerId, opts = {}) {
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Container #${containerId} not found`);
    container.innerHTML = '';
    const cv = this.toCanvas(text, opts);
    container.appendChild(cv);
    return cv;
  }

  static generateDataURL(text, opts = {}) {
    return this.toCanvas(text, opts).toDataURL('image/png');
  }

  static readFromImageData(imageData, width, height) {
    const code = jsQR(imageData.data, width, height, { inversionAttempts: 'attemptBoth' });
    return code ? { text: code.data, location: code.location } : null;
  }

  static async readFromFile(file) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return this.readFromImageData(imgData, canvas.width, canvas.height);
  }

  static async readFromVideo(videoElement) {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth || videoElement.width;
    canvas.height = videoElement.videoHeight || videoElement.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0);
    return this.readFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height), canvas.width, canvas.height);
  }

  static async startCameraScanner(elementId, onScan, opts = {}) {
    const { fps = 10, qrbox = { width: 250, height: 250 } } = opts;
    const scanner = new Html5Qrcode(elementId);
    await scanner.start(
      { facingMode: 'environment' },
      { fps, qrbox },
      (decodedText) => onScan({ text: decodedText, source: 'camera' }),
      () => { /* ignore scan failure */ }
    );
    return scanner;
  }
}
