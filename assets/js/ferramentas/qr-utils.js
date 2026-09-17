/**
 * QRUtils — QR code generation and reading.
 *
 * CDN deps:
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
 *   <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"></script>
 *   <script src="https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>
 */
class QRUtils {
  static generate(text, containerId, opts = {}) {
    const {
      width = 128, height = 128,
      colorDark = '#000000', colorLight = '#ffffff',
      correctLevel = QRCode.CorrectLevel.H
    } = opts;
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Container #${containerId} not found`);
    container.innerHTML = '';
    return new QRCode(container, { text, width, height, colorDark, colorLight, correctLevel });
  }

  static generateDataURL(text, opts = {}) {
    return new Promise((resolve) => {
      const div = document.createElement('div');
      div.style.position = 'absolute'; div.style.left = '-9999px';
      document.body.appendChild(div);
      const id = 'tmp-qr-' + Date.now();
      div.id = id;
      this.generate(text, id, opts);
      setTimeout(() => {
        const img = div.querySelector('img');
        resolve(img ? img.src : null);
        document.body.removeChild(div);
      }, 300);
    });
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
