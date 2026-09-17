/**
 * PDFUtils — PDF loading, manipulation, rendering, forms, metadata.
 *
 * CDN deps:
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"></script>
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
 *   <script>pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';</script>
 */
class PDFUtils {
  /* ---- Loaders ---- */
  static async loadFromFile(file) { return file.arrayBuffer(); }
  static async loadFromUrl(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.arrayBuffer();
  }
  static loadFromBase64(base64) {
    const data = base64.includes(',') ? base64.split(',')[1] : base64;
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
  static bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  static bufferToBlob(buffer, type = 'application/pdf') { return new Blob([buffer], { type }); }
  static dataURLToBuffer(dataURL) {
    const [, body] = dataURL.split(',');
    const bstr = atob(body);
    const u8 = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
    return u8.buffer;
  }
  static download(buffer, filename = 'document.pdf', mime = 'application/pdf') {
    const blob = this.bufferToBlob(buffer, mime);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  /* ---- pdf.js helpers ---- */
  static async _openPdf(buffer) {
    return pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
  }

  static async extractText(buffer, opts = {}) {
    const { pages = null } = opts;
    const pdf = await this._openPdf(buffer);
    const nums = pages || Array.from({ length: pdf.numPages }, (_, i) => i + 1);
    const out = [];
    for (const n of nums) {
      const page = await pdf.getPage(n);
      const tc = await page.getTextContent();
      out.push({ page: n, text: tc.items.map(it => it.str).join(' ') });
    }
    return out;
  }

  static async pdfToText(buffer, opts = {}) {
    const pages = await this.extractText(buffer, opts);
    return pages.map(p => `--- Page ${p.page} ---\n${p.text}`).join('\n\n');
  }

  static async getMetadata(buffer) {
    const pdf = await this._openPdf(buffer);
    const meta = await pdf.getMetadata().catch(() => ({}));
    return {
      pageCount: pdf.numPages,
      title: meta?.info?.Title || null,
      author: meta?.info?.Author || null,
      subject: meta?.info?.Subject || null,
      creator: meta?.info?.Creator || null,
      producer: meta?.info?.Producer || null,
      creationDate: meta?.info?.CreationDate || null,
      modificationDate: meta?.info?.ModDate || null
    };
  }

  static async getPageCount(buffer) {
    const pdf = await this._openPdf(buffer);
    return pdf.numPages;
  }

  static async renderPageToImage(buffer, pageNum = 1, opts = {}) {
    const { scale = 2.0, format = 'image/png', quality = 0.92, background = '#ffffff' } = opts;
    const pdf = await this._openPdf(buffer);
    const page = await pdf.getPage(pageNum);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = vp.width; canvas.height = vp.height;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return {
      dataUrl: canvas.toDataURL(format, quality),
      blob: await new Promise(r => canvas.toBlob(r, format, quality)),
      width: canvas.width, height: canvas.height, page: pageNum
    };
  }

  static async pdfToImages(buffer, opts = {}) {
    const { startPage = 1, endPage = null, ...renderOpts } = opts;
    const pdf = await this._openPdf(buffer);
    const last = endPage || pdf.numPages;
    const imgs = [];
    for (let i = startPage; i <= last; i++) imgs.push(await this.renderPageToImage(buffer, i, renderOpts));
    return imgs;
  }

  /* ---- pdf-lib: Merge / Split / Rotate / Reorder / Remove ---- */
  static async mergePDFs(buffers) {
    const out = await PDFLib.PDFDocument.create();
    for (const buf of buffers) {
      const src = await PDFLib.PDFDocument.load(buf);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach(p => out.addPage(p));
    }
    return out.save();
  }

  static async splitPDF(buffer, ranges) {
    const src = await PDFLib.PDFDocument.load(buffer);
    const out = [];
    for (const range of ranges) {
      const dest = await PDFLib.PDFDocument.create();
      const indices = Array.isArray(range)
        ? Array.from({ length: range[1] - range[0] + 1 }, (_, i) => range[0] + i)
        : [range];
      const pages = await dest.copyPages(src, indices);
      pages.forEach(p => dest.addPage(p));
      out.push(await dest.save());
    }
    return out;
  }

  static async removePages(buffer, indicesToRemove) {
    const src = await PDFLib.PDFDocument.load(buffer);
    const total = src.getPageCount();
    const remove = new Set(indicesToRemove);
    const keep = Array.from({ length: total }, (_, i) => i).filter(i => !remove.has(i));
    const dest = await PDFLib.PDFDocument.create();
    const pages = await dest.copyPages(src, keep);
    pages.forEach(p => dest.addPage(p));
    return dest.save();
  }

  static async reorderPages(buffer, newOrder) {
    const src = await PDFLib.PDFDocument.load(buffer);
    const dest = await PDFLib.PDFDocument.create();
    const pages = await dest.copyPages(src, newOrder);
    pages.forEach(p => dest.addPage(p));
    return dest.save();
  }

  static async rotatePages(buffer, pageIndices, degrees = 90) {
    const pdf = await PDFLib.PDFDocument.load(buffer);
    const pages = pdf.getPages();
    pageIndices.forEach(idx => {
      if (pages[idx]) {
        const cur = pages[idx].getRotation().angle;
        pages[idx].setRotation(PDFLib.degrees(cur + degrees));
      }
    });
    return pdf.save();
  }

  /* ---- Watermark / Text / Images / PageNumbers ---- */
  static async addWatermark(buffer, text, opts = {}) {
    const { size = 50, color = { r: 200, g: 0, b: 0 }, opacity = 0.25, angle = -45 } = opts;
    const pdf = await PDFLib.PDFDocument.load(buffer);
    const font = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
    const c = PDFLib.rgb(color.r / 255, color.g / 255, color.b / 255);
    pdf.getPages().forEach(page => {
      const { width, height } = page.getSize();
      page.drawText(text, {
        x: width / 2 - (text.length * size * 0.25),
        y: height / 2, size, color: c, opacity,
        rotate: PDFLib.degrees(angle), font
      });
    });
    return pdf.save();
  }

  static async addPageNumbers(buffer, opts = {}) {
    const { start = 1, prefix = '', suffix = '', size = 11, color = { r: 0, g: 0, b: 0 }, y = 20 } = opts;
    const pdf = await PDFLib.PDFDocument.load(buffer);
    const font = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
    const c = PDFLib.rgb(color.r / 255, color.g / 255, color.b / 255);
    pdf.getPages().forEach((page, idx) => {
      const { width } = page.getSize();
      const txt = `${prefix}${start + idx}${suffix}`;
      const tw = font.widthOfTextAtSize(txt, size);
      page.drawText(txt, { x: (width - tw) / 2, y, size, font, color: c });
    });
    return pdf.save();
  }

  static async addText(buffer, pageIndex, text, x, y, opts = {}) {
    const { size = 12, color = { r: 0, g: 0, b: 0 }, font = PDFLib.StandardFonts.Helvetica } = opts;
    const pdf = await PDFLib.PDFDocument.load(buffer);
    const page = pdf.getPages()[pageIndex];
    if (!page) throw new Error(`Page ${pageIndex} not found`);
    const f = await pdf.embedFont(font);
    page.drawText(text, {
      x, y, size,
      color: PDFLib.rgb(color.r / 255, color.g / 255, color.b / 255),
      font: f
    });
    return pdf.save();
  }

  static async addImage(buffer, pageIndex, imageBuffer, x, y, width, height, opts = {}) {
    const { format = 'png' } = opts;
    const pdf = await PDFLib.PDFDocument.load(buffer);
    const page = pdf.getPages()[pageIndex];
    if (!page) throw new Error(`Page ${pageIndex} not found`);
    const img = (format === 'jpeg' || format === 'jpg') ? await pdf.embedJpg(imageBuffer) : await pdf.embedPng(imageBuffer);
    page.drawImage(img, { x, y, width, height });
    return pdf.save();
  }

  /* ---- Metadata ---- */
  static async setMetadata(buffer, meta = {}) {
    const pdf = await PDFLib.PDFDocument.load(buffer);
    if (meta.title) pdf.setTitle(meta.title);
    if (meta.author) pdf.setAuthor(meta.author);
    if (meta.subject) pdf.setSubject(meta.subject);
    if (meta.keywords) pdf.setKeywords(Array.isArray(meta.keywords) ? meta.keywords : [meta.keywords]);
    if (meta.creator) pdf.setCreator(meta.creator);
    if (meta.producer) pdf.setProducer(meta.producer);
    if (meta.creationDate) pdf.setCreationDate(new Date(meta.creationDate));
    if (meta.modificationDate) pdf.setModificationDate(new Date(meta.modificationDate));
    return pdf.save();
  }

  static async getPdfLibMetadata(buffer) {
    const pdf = await PDFLib.PDFDocument.load(buffer);
    return {
      title: pdf.getTitle(),
      author: pdf.getAuthor(),
      subject: pdf.getSubject(),
      creator: pdf.getCreator(),
      producer: pdf.getProducer(),
      creationDate: pdf.getCreationDate(),
      modificationDate: pdf.getModificationDate(),
      keywords: pdf.getKeywords(),
      pageCount: pdf.getPageCount()
    };
  }

  /* ---- Compress (frontend-only: stream optimization, no image re-encoding) ---- */
  static async compress(buffer, opts = {}) {
    const { useObjectStreams = true } = opts;
    const pdf = await PDFLib.PDFDocument.load(buffer);
    return pdf.save({ useObjectStreams, updateExistingPageRefs: true });
  }

  /* ---- Forms ---- */
  static async flattenForm(buffer) {
    const pdf = await PDFLib.PDFDocument.load(buffer);
    try { pdf.getForm().flatten(); } catch (e) { /* no form */ }
    return pdf.save();
  }

  static async fillForm(buffer, fields = {}) {
    const pdf = await PDFLib.PDFDocument.load(buffer);
    const form = pdf.getForm();
    Object.entries(fields).forEach(([name, value]) => {
      try {
        const f = form.getField(name);
        if (f instanceof PDFLib.PDFTextField) f.setText(String(value));
        else if (f instanceof PDFLib.PDFCheckBox) value ? f.check() : f.uncheck();
        else if (f instanceof PDFLib.PDFDropdown) f.select(String(value));
        else if (f instanceof PDFLib.PDFRadioGroup) f.select(String(value));
      } catch (err) { console.warn(`Field "${name}" not filled:`, err.message); }
    });
    return pdf.save();
  }

  /* ---- Conversion ---- */
  static async imagesToPDF(imageInputs, opts = {}) {
    const { pageWidth = 612, pageHeight = 792 } = opts;
    const pdf = await PDFLib.PDFDocument.create();
    for (const input of imageInputs) {
      let buf = input.data ?? input;
      let fmt = input.format;
      if (typeof buf === 'string' && buf.startsWith('data:image')) {
        buf = this.dataURLToBuffer(buf);
        fmt = buf.includes('image/jpeg') ? 'jpeg' : 'png';
      }
      const page = pdf.addPage([pageWidth, pageHeight]);
      const img = (fmt === 'jpeg' || fmt === 'jpg') ? await pdf.embedJpg(buf) : await pdf.embedPng(buf);
      const dims = img.scale(1);
      const margin = 24;
      const scale = Math.min((pageWidth - margin * 2) / dims.width, (pageHeight - margin * 2) / dims.height, 1);
      const scaled = img.scale(scale);
      page.drawImage(img, {
        x: (pageWidth - scaled.width) / 2,
        y: (pageHeight - scaled.height) / 2,
        width: scaled.width, height: scaled.height
      });
    }
    return pdf.save();
  }

  static async createBlankPDF(opts = {}) {
    const { width = 612, height = 792, pages = 1 } = opts;
    const pdf = await PDFLib.PDFDocument.create();
    for (let i = 0; i < pages; i++) pdf.addPage([width, height]);
    return pdf.save();
  }
}
