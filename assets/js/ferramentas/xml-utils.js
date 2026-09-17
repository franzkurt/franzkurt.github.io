/**
 * XMLUtils — NFe and CT-e XML parsing (browser DOMParser, no CDN required).
 */
class XMLUtils {
  static parse(xmlString) {
    const parser = new DOMParser();
    return parser.parseFromString(xmlString, 'application/xml');
  }

  static getText(doc, tagName) {
    const el = doc.getElementsByTagName(tagName)[0];
    return el ? el.textContent.trim() : null;
  }

  static getAll(doc, tagName) {
    return Array.from(doc.getElementsByTagName(tagName)).map(el => el.textContent.trim());
  }

  static parseNFe(xmlString) {
    const doc = this.parse(xmlString);
    const ide = doc.getElementsByTagName('ide')[0];
    const emit = doc.getElementsByTagName('emit')[0];
    const dest = doc.getElementsByTagName('dest')[0];
    const total = doc.getElementsByTagName('total')[0];
    const prot = doc.getElementsByTagName('protNFe')[0];

    const get = (root, tag) => root ? this.getText(root, tag) : null;

    const produtos = Array.from(doc.getElementsByTagName('det')).map(det => {
      const prod = det.getElementsByTagName('prod')[0];
      return {
        nItem: det.getAttribute('nItem'),
        cProd: get(prod, 'cProd'),
        xProd: get(prod, 'xProd'),
        ncm: get(prod, 'NCM'),
        cfop: get(prod, 'CFOP'),
        uCom: get(prod, 'uCom'),
        qCom: get(prod, 'qCom'),
        vUnCom: get(prod, 'vUnCom'),
        vProd: get(prod, 'vProd')
      };
    });

    return {
      chave: prot ? get(prot, 'chNFe') : null,
      versao: doc.documentElement.getAttribute('versao'),
      ide: {
        cUF: get(ide, 'cUF'), cNF: get(ide, 'cNF'), natOp: get(ide, 'natOp'),
        mod: get(ide, 'mod'), serie: get(ide, 'serie'), nNF: get(ide, 'nNF'),
        dhEmi: get(ide, 'dhEmi'), tpNF: get(ide, 'tpNF'), idDest: get(ide, 'idDest'),
        cMunFG: get(ide, 'cMunFG'), tpImp: get(ide, 'tpImp'), tpEmis: get(ide, 'tpEmis'),
        finNFe: get(ide, 'finNFe')
      },
      emit: {
        cnpj: get(emit, 'CNPJ'), cpf: get(emit, 'CPF'), xNome: get(emit, 'xNome'),
        xFant: get(emit, 'xFant'), ie: get(emit, 'IE'), crt: get(emit, 'CRT'),
        enderEmit: {
          xLgr: get(emit, 'xLgr'), nro: get(emit, 'nro'), xBairro: get(emit, 'xBairro'),
          cMun: get(emit, 'cMun'), xMun: get(emit, 'xMun'), uf: get(emit, 'UF'), cep: get(emit, 'CEP')
        }
      },
      dest: {
        cnpj: get(dest, 'CNPJ'), cpf: get(dest, 'CPF'), xNome: get(dest, 'xNome'),
        ie: get(dest, 'IE'), indIEDest: get(dest, 'indIEDest'),
        enderDest: {
          xLgr: get(dest, 'xLgr'), nro: get(dest, 'nro'), xBairro: get(dest, 'xBairro'),
          cMun: get(dest, 'cMun'), xMun: get(dest, 'xMun'), uf: get(dest, 'UF'), cep: get(dest, 'CEP')
        }
      },
      produtos,
      total: {
        vBC: get(total, 'vBC'), vICMS: get(total, 'vICMS'), vIPI: get(total, 'vIPI'),
        vPIS: get(total, 'vPIS'), vCOFINS: get(total, 'vCOFINS'), vNF: get(total, 'vNF')
      },
      protocolo: prot ? {
        tpAmb: get(prot, 'tpAmb'), verAplic: get(prot, 'verAplic'), chNFe: get(prot, 'chNFe'),
        dhRecbto: get(prot, 'dhRecbto'), nProt: get(prot, 'nProt'), cStat: get(prot, 'cStat'),
        xMotivo: get(prot, 'xMotivo')
      } : null
    };
  }

  static parseCTe(xmlString) {
    const doc = this.parse(xmlString);
    const ide = doc.getElementsByTagName('ide')[0];
    const emit = doc.getElementsByTagName('emit')[0];
    const rem = doc.getElementsByTagName('rem')[0];
    const dest = doc.getElementsByTagName('dest')[0];
    const vPrest = doc.getElementsByTagName('vPrest')[0];
    const prot = doc.getElementsByTagName('protCTe')[0];
    const get = (root, tag) => root ? this.getText(root, tag) : null;

    const infQ = Array.from(doc.getElementsByTagName('infQ')).map(q => ({
      cUnid: this.getText(q, 'cUnid'),
      tpMed: this.getText(q, 'tpMed'),
      qCarga: this.getText(q, 'qCarga')
    }));

    return {
      chave: prot ? get(prot, 'chCTe') : null,
      ide: {
        cUF: get(ide, 'cUF'), cCT: get(ide, 'cCT'), cDV: get(ide, 'cDV'),
        mod: get(ide, 'mod'), serie: get(ide, 'serie'), nCT: get(ide, 'nCT'),
        dhEmi: get(ide, 'dhEmi'), tpEmis: get(ide, 'tpEmis'), cMunEnv: get(ide, 'cMunEnv'),
        xMunEnv: get(ide, 'xMunEnv'), ufEnv: get(ide, 'UFEnv'), modal: get(ide, 'modal'),
        tpServ: get(ide, 'tpServ'), cMunIni: get(ide, 'cMunIni'), xMunIni: get(ide, 'xMunIni'),
        ufIni: get(ide, 'UFIni'), cMunFim: get(ide, 'cMunFim'), xMunFim: get(ide, 'xMunFim'),
        ufFim: get(ide, 'UFFim')
      },
      emit: {
        cnpj: get(emit, 'CNPJ'), xNome: get(emit, 'xNome'),
        xFant: get(emit, 'xFant'), ie: get(emit, 'IE')
      },
      rem: {
        cnpj: get(rem, 'CNPJ'), cpf: get(rem, 'CPF'), xNome: get(rem, 'xNome'),
        xLgr: get(rem, 'xLgr'), nro: get(rem, 'nro'), xBairro: get(rem, 'xBairro'),
        cMun: get(rem, 'cMun'), xMun: get(rem, 'xMun'), uf: get(rem, 'UF'), cep: get(rem, 'CEP')
      },
      dest: {
        cnpj: get(dest, 'CNPJ'), cpf: get(dest, 'CPF'), xNome: get(dest, 'xNome'),
        xLgr: get(dest, 'xLgr'), nro: get(dest, 'nro'), xBairro: get(dest, 'xBairro'),
        cMun: get(dest, 'cMun'), xMun: get(dest, 'xMun'), uf: get(dest, 'UF'), cep: get(dest, 'CEP')
      },
      vPrest: {
        vTPrest: get(vPrest, 'vTPrest'), vRec: get(vPrest, 'vRec'),
        comp: Array.from(doc.getElementsByTagName('Comp')).map(c => ({
          xNome: get(c, 'xNome'), vComp: get(c, 'vComp')
        }))
      },
      infQ,
      protocolo: prot ? {
        tpAmb: get(prot, 'tpAmb'), chCTe: get(prot, 'chCTe'), dhRecbto: get(prot, 'dhRecbto'),
        nProt: get(prot, 'nProt'), cStat: get(prot, 'cStat'), xMotivo: get(prot, 'xMotivo')
      } : null
    };
  }
}
