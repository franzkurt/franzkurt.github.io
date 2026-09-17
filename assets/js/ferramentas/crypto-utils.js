/**
 * HashUtils — SHA-256, SHA-1, MD5 (pure JS), HMAC-SHA256 via Web Crypto API.
 * ChecksumUtils — CRC32, Luhn, EAN-13, ISBN, Modulo-11, Adler-32, Fletcher-16.
 * Base64Utils — Base64 encode/decode (string and binary).
 * No CDN required.
 */
class HashUtils {
  static async _digest(algo, data) {
    const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const hash = await crypto.subtle.digest(algo, buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  static sha256(data) { return this._digest('SHA-256', data); }
  static sha1(data)   { return this._digest('SHA-1', data); }
  static md5(data)    { return this._md5Pure(data); }

  /* MD5 pure JS — Web Crypto does not support MD5 (deprecated) */
  static _md5Pure(input) {
    const d = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
    const r = (x, c) => (x << c) | (x >>> (32 - c));
    // O digest do MD5 é little-endian (RFC 1321, seção 3.5): cada palavra de 32
    // bits sai do byte menos significativo para o mais. Emitir big-endian aqui
    // produzia um hash com os bytes trocados dentro de cada palavra — parecia
    // um hash legítimo e não batia com nenhuma outra implementação.
    const hex = (v) => {
      v >>>= 0;
      return (v & 0xff).toString(16).padStart(2, '0')
           + ((v >>> 8) & 0xff).toString(16).padStart(2, '0')
           + ((v >>> 16) & 0xff).toString(16).padStart(2, '0')
           + ((v >>> 24) & 0xff).toString(16).padStart(2, '0');
    };
    let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476;
    const len = d.length, tail = len % 64, padLen = tail < 56 ? 56 - tail : 120 - tail;
    const msg = new Uint8Array(len + padLen + 8);
    msg.set(d); msg[len] = 0x80;
    const dl = len * 8;
    msg.set([dl & 0xff, (dl >> 8) & 0xff, (dl >> 16) & 0xff, (dl >> 24) & 0xff, 0, 0, 0, 0], len + padLen);
    const K = new Uint32Array([
      0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,
      0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,
      0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,
      0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,
      0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,
      0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,
      0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,
      0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391
    ]);
    const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
               4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
    for (let i = 0; i < msg.length; i += 64) {
      const w = new Uint32Array(16);
      for (let j = 0; j < 16; j++)
        w[j] = msg[i+j*4] | (msg[i+j*4+1] << 8) | (msg[i+j*4+2] << 16) | (msg[i+j*4+3] << 24);
      let a = h0, b = h1, c = h2, dd = h3;
      for (let j = 0; j < 64; j++) {
        let f, g;
        if (j < 16) { f = (b & c) | (~b & dd); g = j; }
        else if (j < 32) { f = (dd & b) | (~dd & c); g = (5*j+1) % 16; }
        else if (j < 48) { f = b ^ c ^ dd; g = (3*j+5) % 16; }
        else { f = c ^ (b | ~dd); g = (7*j) % 16; }
        const temp = dd; dd = c; c = b;
        b = b + r((a + f + K[j] + w[g]) | 0, S[j]);
        a = temp;
      }
      h0 = (h0+a)|0; h1 = (h1+b)|0; h2 = (h2+c)|0; h3 = (h3+dd)|0;
    }
    return hex(h0) + hex(h1) + hex(h2) + hex(h3);
  }

  static async hmacSHA256(key, message) {
    const k = typeof key === 'string' ? new TextEncoder().encode(key) : key;
    const m = typeof message === 'string' ? new TextEncoder().encode(message) : message;
    const cryptoKey = await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, m);
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

class ChecksumUtils {
  static crc32(str) {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c >>> 0;
    }
    let crc = 0 ^ (-1);
    for (let i = 0; i < str.length; i++)
      crc = (crc >>> 8) ^ table[(crc ^ str.charCodeAt(i)) & 0xFF];
    return ((crc ^ (-1)) >>> 0).toString(16).toUpperCase().padStart(8, '0');
  }

  static luhn(number) {
    const str = String(number).replace(/\D/g, '');
    let sum = 0, alt = false;
    for (let i = str.length - 1; i >= 0; i--) {
      let n = parseInt(str.substring(i, i+1), 10);
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n; alt = !alt;
    }
    return sum % 10 === 0;
  }

  static luhnChecksum(number) {
    const str = String(number).replace(/\D/g, '');
    let sum = 0, alt = true;
    for (let i = str.length - 1; i >= 0; i--) {
      let n = parseInt(str.substring(i, i+1), 10);
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n; alt = !alt;
    }
    return ((10 - (sum % 10)) % 10);
  }

  static validateEAN13(ean) {
    // EAN-13 NÃO é Luhn. O Luhn dobra dígitos alternados e subtrai 9 quando
    // passa de 9; o EAN multiplica as posições pares por 3, sem subtração.
    // Usar Luhn aqui dava a resposta invertida: 4006381333931, que é um código
    // válido de verdade, era recusado, e 4006381333932 era aceito.
    const s = String(ean).replace(/\D/g, '');
    if (s.length !== 13) return false;
    let soma = 0;
    for (let i = 0; i < 12; i++) soma += parseInt(s[i], 10) * (i % 2 ? 3 : 1);
    return (10 - (soma % 10)) % 10 === parseInt(s[12], 10);
  }

  static validateISBN13(isbn) {
    return this.validateEAN13(String(isbn).replace(/-/g, ''));
  }

  static validateISBN10(isbn) {
    const s = String(isbn).replace(/-/g, '');
    if (!/^\d{9}[\dX]$/i.test(s)) return false;
    let sum = 0;
    for (let i = 0; i < 10; i++)
      sum += (s[i] === 'X' ? 10 : parseInt(s[i], 10)) * (10 - i);
    return sum % 11 === 0;
  }

  static modulo11(str, weights = [2,3,4,5,6,7]) {
    const s = String(str).replace(/\D/g, '');
    let sum = 0, pos = 0;
    for (let i = s.length - 1; i >= 0; i--) {
      sum += parseInt(s[i], 10) * weights[pos];
      pos = (pos + 1) % weights.length;
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  }

  static adler32(str) {
    let a = 1, b = 0;
    for (let i = 0; i < str.length; i++) {
      a = (a + str.charCodeAt(i)) % 65521;
      b = (b + a) % 65521;
    }
    return ((b << 16) | a).toString(16).toUpperCase().padStart(8, '0');
  }

  static fletcher16(str) {
    let sum1 = 0, sum2 = 0;
    for (let i = 0; i < str.length; i++) {
      sum1 = (sum1 + str.charCodeAt(i)) % 255;
      sum2 = (sum2 + sum1) % 255;
    }
    return ((sum2 << 8) | sum1).toString(16).toUpperCase().padStart(4, '0');
  }
}

class Base64Utils {
  static encode(str, urlSafe = false) {
    const encoded = btoa(unescape(encodeURIComponent(str)));
    return urlSafe ? encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') : encoded;
  }

  static decode(str) {
    const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4;
    const padded = pad ? normalized + '='.repeat(4 - pad) : normalized;
    return decodeURIComponent(escape(atob(padded)));
  }

  static encodeBuffer(buffer, urlSafe = false) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const encoded = btoa(binary);
    return urlSafe ? encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') : encoded;
  }

  static decodeToBuffer(str) {
    const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4;
    const padded = pad ? normalized + '='.repeat(4 - pad) : normalized;
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  static isValid(str) {
    return /^[A-Za-z0-9+\/]*={0,2}$/.test(str) || /^[A-Za-z0-9_-]*$/.test(str);
  }
}
