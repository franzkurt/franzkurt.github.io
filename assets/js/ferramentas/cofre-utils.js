/**
 * CofreUtils  — cifra e decifra arquivos com senha (AES-256-GCM + PBKDF2).
 * GravadorUtils — grava a tela ou a câmera em arquivo, via MediaRecorder.
 *
 * Tudo com APIs nativas do navegador. Nada sai da máquina.
 */
class CofreUtils {
  static MAGIC = 'FKCOFRE1';           // assinatura, para recusar arquivo alheio
  static ITERACOES = 310000;           // recomendação do OWASP para PBKDF2-SHA256

  static async _chave(senha, sal, iteracoes) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha),
      'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: sal, iterations: iteracoes, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  /** Formato: MAGIC(8) | iteracoes(4) | sal(16) | iv(12) | cifrado */
  static async cifrar(file, senha) {
    if (!senha || senha.length < 8) throw new Error('use uma senha de pelo menos 8 caracteres');
    const sal = crypto.getRandomValues(new Uint8Array(16));
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const chave = await CofreUtils._chave(senha, sal, CofreUtils.ITERACOES);
    const claro = await file.arrayBuffer();
    const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, claro);

    const cab = new Uint8Array(8 + 4 + 16 + 12);
    cab.set(new TextEncoder().encode(CofreUtils.MAGIC), 0);
    new DataView(cab.buffer).setUint32(8, CofreUtils.ITERACOES, false);
    cab.set(sal, 12); cab.set(iv, 28);
    return {
      blob: new Blob([cab, cifrado], { type: 'application/octet-stream' }),
      nome: file.name + '.cofre',
      bytes_antes: file.size, bytes_depois: cab.length + cifrado.byteLength,
      algoritmo: 'AES-256-GCM, chave por PBKDF2-SHA256',
      iteracoes: CofreUtils.ITERACOES,
    };
  }

  static async decifrar(file, senha) {
    const buf = await file.arrayBuffer();
    if (buf.byteLength < 40) throw new Error('arquivo curto demais para ser um cofre');
    const assinatura = new TextDecoder().decode(buf.slice(0, 8));
    if (assinatura !== CofreUtils.MAGIC)
      throw new Error('este arquivo não foi cifrado por esta ferramenta');
    const iteracoes = new DataView(buf).getUint32(8, false);
    const sal = new Uint8Array(buf.slice(12, 28));
    const iv  = new Uint8Array(buf.slice(28, 40));
    const chave = await CofreUtils._chave(senha, sal, iteracoes);
    let claro;
    try { claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, chave, buf.slice(40)); }
    catch {
      /* O GCM autentica: senha errada e arquivo corrompido falham igual, e não
         dá para distinguir os dois — dizer isso é mais honesto que chutar. */
      throw new Error('não abriu: a senha está errada ou o arquivo foi alterado');
    }
    return {
      blob: new Blob([claro]),
      nome: file.name.replace(/\.cofre$/, '') || 'decifrado',
      bytes: claro.byteLength, iteracoes,
    };
  }
}

class GravadorUtils {
  static suportado() {
    return typeof MediaRecorder !== 'undefined'
        && !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  }
  static formatos() {
    return ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      .filter(t => MediaRecorder.isTypeSupported(t));
  }
  /** @param {{fonte?:'tela'|'camera', audio?:boolean, formato?:string}} opts */
  static async iniciar(opts = {}) {
    const { fonte = 'tela', audio = true, formato } = opts;
    if (!GravadorUtils.suportado()) throw new Error('este navegador não grava tela');
    const stream = fonte === 'camera'
      ? await navigator.mediaDevices.getUserMedia({ video: true, audio })
      : await navigator.mediaDevices.getDisplayMedia({ video: true, audio });
    const tipo = formato || GravadorUtils.formatos()[0];
    if (!tipo) throw new Error('nenhum formato de gravação disponível');
    const rec = new MediaRecorder(stream, { mimeType: tipo });
    const pedacos = [];
    rec.ondataavailable = e => { if (e.data.size) pedacos.push(e.data); };
    const pronto = new Promise(ok => {
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());   // solta a câmera/tela
        ok(new Blob(pedacos, { type: tipo }));
      };
    });
    rec.start(1000);
    /* Se a pessoa clicar em "parar de compartilhar" na barra do navegador, o
       MediaRecorder NÃO para sozinho e a gravação fica pendurada. */
    stream.getVideoTracks()[0].onended = () => { if (rec.state !== 'inactive') rec.stop(); };
    return {
      formato: tipo,
      parar: () => { if (rec.state !== 'inactive') rec.stop(); return pronto; },
      pronto, estado: () => rec.state,
    };
  }
}
if (typeof window !== 'undefined') { window.CofreUtils = CofreUtils; window.GravadorUtils = GravadorUtils; }
