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

  /* O número único do CNJ é NNNNNNN-DD.AAAA.J.TR.OOOO, TUDO em dígitos.
   * A versão anterior exigia [A-Z]{2} no lugar do tribunal, então rejeitava
   * todo processo real e aceitava "1234567-89.2024.8.SP.0100", que não existe.
   * E conferia só o formato: o dígito DD vem do módulo 97 (Res. CNJ 65/2008)
   * e é ele que diz se o número é possível. */
  static validateCNJ(cnj) {
    const d = String(cnj ?? '').replace(/\D/g, '');
    if (d.length !== 20) return false;
    const informado = d.slice(7, 9);
    const base = d.slice(0, 7) + d.slice(9) + '00';
    const esperado = String(98n - (BigInt(base) % 97n)).padStart(2, '0');
    return informado === esperado;
  }

  /* Calcula o dígito verificador a partir das outras partes. */
  static digitoCNJ(sequencial, ano, segmento, tribunal, origem) {
    const base = String(sequencial).padStart(7, '0') + String(ano).padStart(4, '0')
               + String(segmento) + String(tribunal).padStart(2, '0')
               + String(origem).padStart(4, '0') + '00';
    return String(98n - (BigInt(base) % 97n)).padStart(2, '0');
  }

  /* Quebra o número e diz o que cada pedaço significa. É o que o profissional
   * quer ver: de qual tribunal veio e de que ano é, sem consultar nada. */
  static decodeCNJ(cnj) {
    const d = String(cnj ?? '').replace(/\D/g, '');
    if (d.length !== 20) throw new Error(`o número tem ${d.length} dígitos; o padrão CNJ tem 20`);
    const seq = d.slice(0, 7), dv = d.slice(7, 9), ano = d.slice(9, 13),
          j = d.slice(13, 14), tr = d.slice(14, 16), orig = d.slice(16);
    const SEGMENTOS = {
      '1': 'Supremo Tribunal Federal', '2': 'Conselho Nacional de Justiça',
      '3': 'Superior Tribunal de Justiça', '4': 'Justiça Federal',
      '5': 'Justiça do Trabalho', '6': 'Justiça Eleitoral',
      '7': 'Justiça Militar da União', '8': 'Justiça Estadual',
      '9': 'Justiça Militar Estadual',
    };
    /* Códigos de tribunal da Justiça Estadual (Res. CNJ 65/2008), na ordem
     * oficial. Sergipe é 25 e São Paulo é 26 — inverter os dois faz todo
     * processo paulista, que é o volume maior do país, sair rotulado errado. */
    const UF = ['','AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
                'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SE','SP','TO'];
    let tribunal;
    if (j === '8' || j === '9') tribunal = `TJ${UF[+tr] || '?'} (tribunal ${tr})`;
    else if (j === '5') tribunal = `TRT da ${+tr}ª Região`;
    else if (j === '4') tribunal = `TRF da ${+tr}ª Região`;
    else if (j === '6') tribunal = `TRE${UF[+tr] || '?'} (tribunal ${tr})`;
    else tribunal = tr === '00' ? 'tribunal superior (sem subdivisão)' : `código ${tr}`;
    const valido = ValidatorUtils.validateCNJ(d);
    return {
      formatado: `${seq}-${dv}.${ano}.${j}.${tr}.${orig}`,
      valido,
      digito_esperado: ValidatorUtils.digitoCNJ(seq, ano, j, tr, orig),
      digito_informado: dv,
      sequencial: seq, ano: +ano,
      segmento: SEGMENTOS[j] || `desconhecido (${j})`,
      tribunal,
      unidade_origem: orig === '0000' ? 'sem unidade informada' : `unidade ${orig}`,
    };
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
