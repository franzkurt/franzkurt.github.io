/**
 * ImagemUtils — compressão, conversão de formato e remoção de metadados.
 * Tudo com Canvas e DataView nativos. Nenhuma biblioteca externa.
 */
class ImagemUtils {
  static _carregar(file) {
    return new Promise((ok, erro) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); ok(img); };
      img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('não consegui abrir como imagem')); };
      img.src = url;
    });
  }

  /* O canvas NÃO codifica todo formato. Perguntar antes evita devolver um PNG
     com extensão .avif, que é o que toBlob faz quando não suporta o tipo. */
  static suporta(mime) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    return c.toDataURL(mime).startsWith(`data:${mime}`);
  }

  static formatosDisponiveis() {
    return ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
      .filter(m => ImagemUtils.suporta(m));
  }

  /**
   * @param {File} file
   * @param {{formato?:string, qualidade?:number, larguraMax?:number, alturaMax?:number}} opts
   */
  static async comprimir(file, opts = {}) {
    const { formato = 'image/jpeg', qualidade = 0.75, larguraMax = 0, alturaMax = 0 } = opts;
    if (!ImagemUtils.suporta(formato))
      throw new Error(`este navegador não codifica ${formato}. Disponíveis: ${ImagemUtils.formatosDisponiveis().join(', ')}`);
    const img = await ImagemUtils._carregar(file);
    let { naturalWidth: w, naturalHeight: h } = img;
    const escala = Math.min(larguraMax ? larguraMax / w : 1, alturaMax ? alturaMax / h : 1, 1);
    w = Math.max(1, Math.round(w * escala));
    h = Math.max(1, Math.round(h * escala));

    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (formato === 'image/jpeg') {            // JPEG não tem alfa: fundo branco
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise(r => c.toBlob(r, formato, qualidade));
    if (!blob) throw new Error('o navegador não devolveu a imagem codificada');
    return {
      blob, formato,
      largura: w, altura: h,
      largura_original: img.naturalWidth, altura_original: img.naturalHeight,
      bytes_antes: file.size, bytes_depois: blob.size,
      reducao: 1 - blob.size / file.size,
      /* Reescrever pelo canvas descarta TODO metadado: EXIF, GPS, ICC.
         Efeito colateral bem-vindo aqui, mas o perfil de cor vai junto. */
      metadados_removidos: true,
    };
  }

  /** Remove EXIF/GPS mantendo os pixels intactos, sem recomprimir. */
  static async limparMetadados(file) {
    const buf = await file.arrayBuffer();
    const v = new DataView(buf);
    if (v.getUint16(0, false) !== 0xFFD8)
      throw new Error('só sei limpar JPEG sem recomprimir. Para PNG/WebP, use a compressão, que já descarta tudo.');
    const pedacos = [];
    let i = 2, removidos = [];
    while (i < buf.byteLength) {
      if (v.getUint16(i, false) === 0xFFDA) { pedacos.push(buf.slice(i)); break; } // início da imagem
      const marcador = v.getUint16(i, false);
      const tam = v.getUint16(i + 2, false);
      const descartar = marcador >= 0xFFE0 && marcador <= 0xFFEF   // APPn: EXIF, GPS, XMP
                     || marcador === 0xFFFE;                        // comentário
      if (descartar) removidos.push('0x' + marcador.toString(16).toUpperCase());
      else pedacos.push(buf.slice(i, i + 2 + tam));
      i += 2 + tam;
    }
    const saida = new Blob([new Uint8Array([0xFF, 0xD8]), ...pedacos], { type: 'image/jpeg' });
    return {
      blob: saida, bytes_antes: file.size, bytes_depois: saida.size,
      blocos_removidos: removidos,
      /* Se nada foi removido, a foto já estava limpa — dizer isso é melhor que
         devolver um arquivo idêntico e deixar a pessoa achar que funcionou. */
      ja_estava_limpa: removidos.length === 0,
    };
  }

  static async info(file) {
    const img = await ImagemUtils._carregar(file);
    const buf = await file.arrayBuffer();
    const v = new DataView(buf);
    let temExif = false;
    if (v.getUint16(0, false) === 0xFFD8) {
      let i = 2;
      while (i < buf.byteLength - 4) {
        const m = v.getUint16(i, false);
        if (m === 0xFFDA) break;
        if (m >= 0xFFE0 && m <= 0xFFEF) { temExif = true; break; }
        i += 2 + v.getUint16(i + 2, false);
      }
    }
    return {
      tipo: file.type || 'desconhecido', bytes: file.size,
      largura: img.naturalWidth, altura: img.naturalHeight,
      megapixels: (img.naturalWidth * img.naturalHeight / 1e6).toFixed(2),
      tem_metadados: temExif,
    };
  }
}
if (typeof window !== 'undefined') window.ImagemUtils = ImagemUtils;
