/**
 * BarcodeUtils — Barcode generation via JsBarcode (Code128, EAN-13, etc.).
 *
 * CDN dep:
 *   <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
 */
class BarcodeUtils {
  static generate(containerId, data, opts = {}) {
    const {
      format = 'CODE128', width = 2, height = 100,
      displayValue = true, fontSize = 18,
      lineColor = '#000000', background = '#ffffff'
    } = opts;
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Container #${containerId} not found`);
    if (typeof JsBarcode === 'undefined') throw new Error('JsBarcode CDN not loaded');
    container.innerHTML = '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'barcode-' + Date.now();
    container.appendChild(svg);
    JsBarcode(svg, data, { format, width, height, displayValue, fontSize, lineColor, background });
    return svg;
  }

  static generateDataURL(data, opts = {}) {
    return new Promise((resolve, reject) => {
      const div = document.createElement('div');
      div.style.position = 'absolute'; div.style.left = '-9999px';
      document.body.appendChild(div);
      const svgId = 'barcode-tmp-' + Date.now();
      div.innerHTML = `<svg id="${svgId}"></svg>`;
      try {
        this.generate(svgId, data, opts);
        setTimeout(() => {
          const svg = div.querySelector('svg');
          const source = new XMLSerializer().serializeToString(svg);
          resolve('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source));
          document.body.removeChild(div);
        }, 200);
      } catch (e) { reject(e); }
    });
  }

  static supportedFormats() {
    return ['CODE128','EAN13','EAN8','EAN5','EAN2','UPC','UPCE',
            'CODE39','ITF14','MSI','pharmacode'];
  }
}
