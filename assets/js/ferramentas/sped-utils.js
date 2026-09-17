/**
 * SPEDUtils — EFD (SPED Fiscal) pipe-delimited file parser (no CDN required).
 */
class SPEDUtils {
  static parse(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim().startsWith('|'));
    return lines.map(line => {
      const parts = line.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1);
      return { reg: parts[0], fields: parts.slice(1) };
    });
  }

  static filterByReg(parsed, regCode) {
    return parsed.filter(r => r.reg === regCode);
  }

  static getReg0000(parsed) {
    const r = this.filterByReg(parsed, '0000')[0];
    if (!r) return null;
    const f = r.fields;
    return {
      codVer: f[0], codFin: f[1], dtIni: f[2], dtFin: f[3],
      nome: f[4], cnpj: f[5], cpf: f[6], uf: f[7], ie: f[8],
      codMun: f[9], im: f[10], suframa: f[11], indPerfil: f[12], indAtiv: f[13]
    };
  }

  static getRegC100List(parsed) {
    return this.filterByReg(parsed, 'C100').map(r => {
      const f = r.fields;
      return {
        indOper: f[0], indEmit: f[1], codPart: f[2], codMod: f[3], codSit: f[4],
        ser: f[5], numDoc: f[6], chvNfe: f[7], dtDoc: f[8], dtES: f[9], vlDoc: f[10],
        indPgto: f[11], vlDesc: f[12], vlAbatNt: f[13], vlMerc: f[14], indFrt: f[15],
        vlFrt: f[16], vlSeg: f[17], vlOutDa: f[18], vlBcIcms: f[19], vlIcms: f[20],
        vlBcIcmsSt: f[21], vlIcmsSt: f[22], vlIpi: f[23], vlPis: f[24], vlCofins: f[25],
        vlPisSt: f[26], vlCofinsSt: f[27]
      };
    });
  }

  static getReg0150List(parsed) {
    return this.filterByReg(parsed, '0150').map(r => {
      const f = r.fields;
      return {
        codPart: f[0], nome: f[1], codPais: f[2], cnpj: f[3], cpf: f[4],
        ie: f[5], codMun: f[6], suframa: f[7], endereco: f[8], num: f[9],
        compl: f[10], bairro: f[11]
      };
    });
  }

  static toJSON(text) {
    const parsed = this.parse(text);
    return {
      _0000: this.getReg0000(parsed),
      _0150: this.getReg0150List(parsed),
      _C100: this.getRegC100List(parsed),
      _raw: parsed
    };
  }
}
