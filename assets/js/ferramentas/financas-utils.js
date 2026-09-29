/**
 * BoletoUtils   — decodifica linha digitável de boleto bancário e de conta de consumo.
 * FinanciamentoUtils — tabelas SAC e PRICE.
 *
 * Tudo aritmética local. Nada aqui consulta banco nenhum: dá para saber o
 * vencimento e o valor que estão ESCRITOS no código, não se o boleto foi pago.
 */

class BoletoUtils {
  /* Módulo 10 com pesos 2,1,2,1… da direita para a esquerda. */
  static _mod10(num) {
    let soma = 0, peso = 2;
    for (let i = num.length - 1; i >= 0; i--) {
      let v = Number(num[i]) * peso;
      if (v > 9) v = Math.floor(v / 10) + (v % 10);
      soma += v; peso = peso === 2 ? 1 : 2;
    }
    const r = soma % 10;
    return r === 0 ? 0 : 10 - r;
  }

  /* Módulo 11 com pesos 2..9 cíclicos. `arrecadacao` muda o tratamento dos
     restos 0, 1 e 10, que é onde as duas famílias de boleto divergem. */
  static _mod11(num, arrecadacao = false) {
    let soma = 0, peso = 2;
    for (let i = num.length - 1; i >= 0; i--) {
      soma += Number(num[i]) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    if (arrecadacao) {
      const r = soma % 11;
      if (r === 0) return 0;
      if (r === 1) return 0;
      return 11 - r;
    }
    const r = 11 - (soma % 11);
    return (r === 0 || r === 10 || r === 11) ? 1 : r;
  }

  /* Fator de vencimento: dias desde 07/10/1997. Em 22/02/2025 o contador
     estourou 9999 e foi reiniciado em 1000 pelo Banco Central, então fator
     baixo com boleto recente é data nova, não boleto de 1997. */
  static _vencimento(fator) {
    const f = Number(fator);
    if (f === 0) return null;
    const base = Date.UTC(1997, 9, 7);
    const dias = f < 1000 ? f + 9000 : f;
    const d = new Date(base + dias * 86400000);
    return d.toISOString().slice(0, 10);
  }

  static decodificar(entrada) {
    const d = String(entrada ?? '').replace(/\D/g, '');
    if (d.length === 48) return BoletoUtils._arrecadacao(d);
    if (d.length === 47) return BoletoUtils._bancario(d);
    throw new Error(`a linha tem ${d.length} dígitos; boleto bancário tem 47 e conta de consumo tem 48`);
  }

  static _bancario(d) {
    const campos = [
      { n: d.slice(0, 9),   dv: d[9]  },
      { n: d.slice(10, 20), dv: d[20] },
      { n: d.slice(21, 31), dv: d[31] },
    ];
    const conferencia = campos.map((c, i) => ({
      campo: i + 1, informado: Number(c.dv), esperado: BoletoUtils._mod10(c.n),
    }));
    const dvGeral = Number(d[32]);
    const fator = d.slice(33, 37);
    const valorCentavos = Number(d.slice(37));
    const banco = d.slice(0, 3);
    const BANCOS = { '001':'Banco do Brasil','033':'Santander','041':'Banrisul','070':'BRB',
      '077':'Inter','104':'Caixa Econômica Federal','208':'BTG Pactual','212':'Banco Original',
      '237':'Bradesco','260':'Nu Pagamentos','336':'C6 Bank','341':'Itaú','356':'Banco Real',
      '389':'Mercantil','422':'Safra','655':'Votorantim','745':'Citibank','756':'Sicoob' };
    // código de barras = banco+moeda + dvGeral + fator + valor + campo livre
    const barras = d.slice(0,4) + d[32] + d.slice(33) + d.slice(4,9) + d.slice(10,20) + d.slice(21,31);
    return {
      tipo: 'boleto bancário (47 dígitos)',
      banco: `${banco} — ${BANCOS[banco] || 'banco não catalogado aqui'}`,
      moeda: d[3] === '9' ? 'real (9)' : `código ${d[3]}`,
      vencimento: BoletoUtils._vencimento(fator) || 'sem vencimento no código (fator 0000)',
      fator_vencimento: fator,
      valor: valorCentavos === 0 ? 'não informado no código' :
             (valorCentavos / 100).toLocaleString('pt-BR', { style:'currency', currency:'BRL' }),
      digitos_dos_campos: conferencia,
      campos_conferem: conferencia.every(c => c.informado === c.esperado),
      dv_geral_informado: dvGeral,
      codigo_de_barras: barras,
    };
  }

  static _arrecadacao(d) {
    const blocos = [d.slice(0,11), d.slice(12,23), d.slice(24,35), d.slice(36,47)];
    const dvs    = [d[11], d[23], d[35], d[47]];
    const id = d[2];                       // 6 e 7 = mod10, 8 e 9 = mod11
    const usaMod10 = id === '6' || id === '7';
    const conferencia = blocos.map((b, i) => ({
      bloco: i + 1, informado: Number(dvs[i]),
      esperado: usaMod10 ? BoletoUtils._mod10(b) : BoletoUtils._mod11(b, true),
    }));
    const valorCentavos = Number(blocos.join('').slice(4, 15));
    const SEGMENTOS = { '1':'prefeitura','2':'saneamento','3':'energia elétrica e gás',
      '4':'telecomunicações','5':'órgão governamental','6':'carnês e assemelhados',
      '7':'multas de trânsito','9':'uso exclusivo do banco' };
    return {
      tipo: 'conta de consumo / arrecadação (48 dígitos)',
      segmento: SEGMENTOS[d[1]] || `código ${d[1]}`,
      identificacao_valor: usaMod10 ? 'valor efetivo, dígitos por módulo 10'
                                    : 'valor efetivo, dígitos por módulo 11',
      valor: valorCentavos === 0 ? 'não informado no código' :
             (valorCentavos / 100).toLocaleString('pt-BR', { style:'currency', currency:'BRL' }),
      vencimento: 'contas de consumo não trazem vencimento no código',
      digitos_dos_blocos: conferencia,
      blocos_conferem: conferencia.every(c => c.informado === c.esperado),
    };
  }
}

class FinanciamentoUtils {
  /* taxaAnual em % (ex.: 10.5). Devolve a tabela mês a mês e os totais. */
  static tabela(valor, taxaAnual, meses, sistema = 'SAC') {
    valor = Number(valor); meses = Math.round(Number(meses));
    if (!(valor > 0)) throw new Error('o valor financiado precisa ser maior que zero');
    if (!(meses > 0)) throw new Error('o prazo precisa ser de pelo menos 1 mês');
    if (meses > 600) throw new Error('prazo acima de 600 meses (50 anos) — confira o número');
    const i = Math.pow(1 + Number(taxaAnual) / 100, 1 / 12) - 1;   // taxa mensal equivalente
    const linhas = [];
    let saldo = valor;

    if (sistema.toUpperCase() === 'PRICE') {
      const p = i === 0 ? valor / meses
                        : valor * (i * Math.pow(1 + i, meses)) / (Math.pow(1 + i, meses) - 1);
      for (let m = 1; m <= meses; m++) {
        const juros = saldo * i;
        const amort = p - juros;
        saldo = Math.max(0, saldo - amort);
        linhas.push({ mes: m, parcela: p, juros, amortizacao: amort, saldo });
      }
    } else {
      const amort = valor / meses;
      for (let m = 1; m <= meses; m++) {
        const juros = saldo * i;
        saldo = Math.max(0, saldo - amort);
        linhas.push({ mes: m, parcela: amort + juros, juros, amortizacao: amort, saldo });
      }
    }
    const totalPago = linhas.reduce((s, l) => s + l.parcela, 0);
    return {
      sistema: sistema.toUpperCase(), valor_financiado: valor,
      taxa_anual: Number(taxaAnual), taxa_mensal_equivalente: i * 100,
      meses, linhas,
      primeira_parcela: linhas[0].parcela,
      ultima_parcela: linhas[linhas.length - 1].parcela,
      total_pago: totalPago,
      total_juros: totalPago - valor,
      juros_sobre_valor: (totalPago - valor) / valor,
    };
  }

  static comparar(valor, taxaAnual, meses) {
    const sac = FinanciamentoUtils.tabela(valor, taxaAnual, meses, 'SAC');
    const price = FinanciamentoUtils.tabela(valor, taxaAnual, meses, 'PRICE');
    return { sac, price, diferenca_juros: price.total_juros - sac.total_juros };
  }
}

if (typeof window !== 'undefined') { window.BoletoUtils = BoletoUtils; window.FinanciamentoUtils = FinanciamentoUtils; }
