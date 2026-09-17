/**
 * OCRUtils — Browser-side OCR via Tesseract.js.
 *
 * CDN deps:
 *   <script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
 *   <script>pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';</script>
 */
class OCRUtils {
  static async recognize(imageSource, opts = {}) {
    const { lang = 'por', logger = () => {} } = opts;
    const result = await Tesseract.recognize(imageSource, lang, { logger });
    return {
      text: result.data.text,
      confidence: result.data.confidence,
      words: result.data.words,
      lines: result.data.lines,
      paragraphs: result.data.paragraphs
    };
  }

  static async recognizePDF(pdfBuffer, opts = {}) {
    const { scale = 2, ...rest } = opts;
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
    const out = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const r = await this.recognize(canvas, rest);
      out.push({ page: i, ...r });
    }
    return out;
  }
}
