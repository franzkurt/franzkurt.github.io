/**
 * ValidatorUtils — Brazilian document validators (CPF, CNPJ, PIS, RENAVAM, OAB, CNJ, CEP, IE).
 * ExtractorUtils — Regex extractors for Brazilian documents and contact info.
 * No CDN required.
 */
class ValidatorUtils {
  static validateCPF(cpf) {
    const str = String(cpf).replace(/\D/g, '');
    if (str.length !== 11 || /^(.)(\1){10}$/.test(str)) return false;
    let sum = 0, rest;
    for (let i = 1; i <= 9; i++) sum += parseInt(str[i - 1]) * (11 - i);
    rest = (sum * 10) % 11;
    if (rest === 10 || rest === 11) rest = 0;
    if (rest !== parseInt(str[9])) return false;
    sum = 0;
    for (let i = 1; i <= 10; i++) sum += parseInt(str[i - 1]) * (12 - i);
    rest = (sum * 10) % 11;
    if (rest === 10 || rest === 11) rest = 0;
    return rest === parseInt(str[10]);
  }

  /* Supports both numeric and alphanumeric CNPJ (2026+ format) */
  static validateCNPJ(cnpj) {
    const str = String(cnpj).replace(/[-\/.]/g, '').toUpperCase();
    if (str.length !== 14) return false;
    const toVal = ch => {
      const code = ch.charCodeAt(0);
      return code >= 48 && code <= 57 ? code - 48 : code;
    };
    const calcDV = base => {
      let pos = 2, sum = 0;
      for (let i = base.length - 1; i >= 0; i--) {
        sum += toVal(base[i]) * pos;
        pos = pos === 9 ? 2 : pos + 1;
      }
      const mod = sum % 11;
      return mod < 2 ? 0 : 11 - mod;
    };
    const base = str.slice(0, 12);
    const d1 = calcDV(base);
    const d2 = calcDV(base + d1);
    return str === base + d1 + d2;
  }

  static validatePIS(pis) {
    const str = String(pis).replace(/\D/g, '');
    if (str.length !== 11 || /^(.)(\1){10}$/.test(str)) return false;
    const weights = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(str[i]) * weights[i];
    const rest = sum % 11;
    const dv = rest < 2 ? 0 : 11 - rest;
    return dv === parseInt(str[10]);
  }

  static validateRENAVAM(renavam) {
    const str = String(renavam).replace(/\D/g, '');
    if (str.length !== 11) return false;
    const weights = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(str[i]) * weights[i];
    const rest = sum % 11;
    const dv = rest >= 10 ? 0 : 11 - rest;
    return dv === parseInt(str[10]);
  }

  static validateOAB(oab) {
    const regex = /^([A-Z]{2})(\d{6})([A-Z0-9])$/i;
    const m = String(oab).toUpperCase().replace(/[^A-Z0-9]/g, '').match(regex);
    if (!m) return false;
    const ufs = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
                 'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
    return ufs.includes(m[1]);
  }

  static validateCNJ(cnj) {
    const regex = /^\d{7}-\d{2}\.\d{4}\.\d\.[A-Z]{2}\.\d{4}$/i;
    return regex.test(String(cnj).trim());
  }

  static validateCEP(cep) {
    return /^\d{5}-?\d{3}$/.test(String(cep));
  }

  static validateIE(ie, uf) {
    const str = String(ie).replace(/\D/g, '');
    const sizes = { SP: 12, MG: 13, RJ: 8, RS: 10, SC: 9 };
    const expected = sizes[uf?.toUpperCase()];
    return expected ? str.length === expected : str.length >= 8 && str.length <= 14;
  }
}

class ExtractorUtils {
  static extractCPF(text) {
    return [...text.matchAll(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g)].map(m => m[0]);
  }

  static extractCNPJ(text) {
    return [...text.matchAll(/\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}\b/g)].map(m => m[0]);
  }

  static extractCEP(text) {
    return [...text.matchAll(/\b\d{5}[-\s]?\d{3}\b/g)].map(m => m[0]);
  }

  static extractCNJ(text) {
    return [...text.matchAll(/\b\d{7}-\d{2}\.\d{4}\.\d\.[A-Z]{2}\.\d{4}\b/gi)].map(m => m[0]);
  }

  static extractOAB(text) {
    return [...text.matchAll(/\b[A-Z]{2}\d{6,7}[A-Z0-9]?\b/gi)].map(m => m[0]);
  }

  static extractEmails(text) {
    return [...text.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)].map(m => m[0]);
  }

  static extractPhones(text) {
    return [...text.matchAll(/\(?\d{2}\)?[\s-]?\d{4,5}[\s-]?\d{4}/g)].map(m => m[0]);
  }

  static extractAll(text) {
    return {
      cpfs: this.extractCPF(text),
      cnpjs: this.extractCNPJ(text),
      ceps: this.extractCEP(text),
      cnjs: this.extractCNJ(text),
      oabs: this.extractOAB(text),
      emails: this.extractEmails(text),
      phones: this.extractPhones(text)
    };
  }
}
