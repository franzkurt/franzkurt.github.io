/**
 * FormatoUtils — formatar e validar JSON, XML e SQL.
 * TextoUtils    — contagem de palavras, tempo de leitura e densidade.
 * PrazoUtils    — prazo processual em dias úteis, com feriados nacionais.
 *
 * Nada aqui usa biblioteca externa.
 */
class FormatoUtils {
  static json(txt, { indentacao = 2, minificar = false } = {}) {
    let obj;
    try { obj = JSON.parse(txt); }
    catch (e) {
      /* A mensagem nativa dá a posição em caracteres, que é inútil num
         arquivo grande. Converter para linha e coluna é o que ajuda. */
      const m = /position (\d+)/.exec(e.message) || /at position (\d+)/.exec(e.message);
      if (m) {
        const antes = txt.slice(0, +m[1]);
        const linha = antes.split('\n').length;
        const col = +m[1] - antes.lastIndexOf('\n');
        throw new Error(`JSON inválido na linha ${linha}, coluna ${col}: ${e.message.split(' in JSON')[0]}`);
      }
      throw new Error('JSON inválido: ' + e.message);
    }
    return {
      texto: minificar ? JSON.stringify(obj) : JSON.stringify(obj, null, indentacao),
      chaves: FormatoUtils._contarChaves(obj),
      profundidade: FormatoUtils._profundidade(obj),
      tipo_raiz: Array.isArray(obj) ? `array de ${obj.length}` : typeof obj,
    };
  }
  static _contarChaves(o, n = 0) {
    if (o && typeof o === 'object') for (const k of Object.keys(o)) {
      n += Array.isArray(o) ? 0 : 1; n = FormatoUtils._contarChaves(o[k], n);
    }
    return n;
  }
  static _profundidade(o) {
    if (!o || typeof o !== 'object') return 0;
    return 1 + Math.max(0, ...Object.values(o).map(v => FormatoUtils._profundidade(v)));
  }

  static xml(txt, { indentacao = 2 } = {}) {
    const doc = new DOMParser().parseFromString(txt, 'application/xml');
    const err = doc.querySelector('parsererror');
    if (err) throw new Error('XML inválido: ' + err.textContent.trim().split('\n')[0]);
    const ind = ' '.repeat(indentacao);
    const fmt = (no, nivel) => {
      const p = ind.repeat(nivel);
      if (no.nodeType === 3) { const t = no.nodeValue.trim(); return t ? p + t + '\n' : ''; }
      if (no.nodeType === 8) return p + '<!--' + no.nodeValue + '-->\n';
      if (no.nodeType !== 1) return '';
      const atr = [...no.attributes].map(a => ` ${a.name}="${a.value}"`).join('');
      const filhos = [...no.childNodes];
      const soTexto = filhos.length === 1 && filhos[0].nodeType === 3;
      if (!filhos.length) return `${p}<${no.nodeName}${atr}/>\n`;
      if (soTexto) return `${p}<${no.nodeName}${atr}>${filhos[0].nodeValue.trim()}</${no.nodeName}>\n`;
      return `${p}<${no.nodeName}${atr}>\n` + filhos.map(f => fmt(f, nivel + 1)).join('') + `${p}</${no.nodeName}>\n`;
    };
    return { texto: [...doc.childNodes].map(n => fmt(n, 0)).join('').trimEnd(),
             raiz: doc.documentElement?.nodeName, elementos: doc.querySelectorAll('*').length };
  }

  static sql(txt) {
    const PALAVRAS = ['SELECT','FROM','WHERE','INNER JOIN','LEFT JOIN','RIGHT JOIN','FULL JOIN',
      'JOIN','GROUP BY','ORDER BY','HAVING','LIMIT','OFFSET','UNION ALL','UNION','INSERT INTO',
      'VALUES','UPDATE','SET','DELETE FROM','CREATE TABLE','ALTER TABLE','DROP TABLE','ON','AND','OR'];
    let s = txt.replace(/\s+/g, ' ').trim();
    for (const p of PALAVRAS) {
      s = s.replace(new RegExp(`\\s+${p.replace(/ /g, '\\s+')}\\s+`, 'gi'),
                    m => (['AND','OR','ON'].includes(p) ? '\n  ' : '\n') + p + ' ');
    }
    s = s.replace(/,\s*/g, ',\n  ');
    return { texto: s.trim(), instrucoes: (txt.match(/;/g) || []).length || 1 };
  }
}

class TextoUtils {
  /** Palavras por minuto: 200 é a média para leitura silenciosa em português. */
  static analisar(txt, { ppm = 200 } = {}) {
    const limpo = String(txt ?? '');
    const palavras = limpo.trim() ? limpo.trim().split(/\s+/) : [];
    const frases = limpo.split(/[.!?]+(?:\s|$)/).filter(f => f.trim()).length;
    const paragrafos = limpo.split(/\n\s*\n/).filter(p => p.trim()).length;
    const semEspaco = limpo.replace(/\s/g, '').length;
    const freq = {};
    const VAZIAS = new Set(['a','o','as','os','de','da','do','das','dos','e','ou','que','em','no','na',
      'nos','nas','um','uma','para','com','por','se','como','mas','ao','à','é','são','foi','ser','tem']);
    for (const p of palavras) {
      const k = p.toLowerCase().replace(/[^\wà-ú]/gi, '');
      if (k.length > 2 && !VAZIAS.has(k)) freq[k] = (freq[k] || 0) + 1;
    }
    const seg = Math.round(palavras.length / ppm * 60);
    return {
      caracteres: limpo.length, caracteres_sem_espaco: semEspaco,
      palavras: palavras.length, frases, paragrafos,
      media_palavras_por_frase: frases ? +(palavras.length / frases).toFixed(1) : 0,
      tempo_de_leitura: seg < 60 ? `${seg} s` : `${Math.floor(seg/60)} min ${seg%60} s`,
      mais_frequentes: Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 12)
        .map(([p,n]) => ({ palavra: p, vezes: n, densidade: +(100*n/palavras.length).toFixed(2) })),
    };
  }
}

class PrazoUtils {
  /* Feriados nacionais fixos. Os móveis saem da Páscoa (algoritmo de Meeus).
     Feriado estadual e municipal NÃO estão aqui, e isso muda prazo de verdade
     — por isso a ferramenta avisa em vez de fingir que a conta é definitiva. */
  static _pascoa(ano) {
    const a = ano % 19, b = Math.floor(ano/100), c = ano % 100;
    const d = Math.floor(b/4), e = b % 4, f = Math.floor((b+8)/25);
    const g = Math.floor((b-f+1)/3), h = (19*a+b-d-g+15) % 30;
    const i = Math.floor(c/4), k = c % 4, l = (32+2*e+2*i-h-k) % 7;
    const m = Math.floor((a+11*h+22*l)/451);
    const mes = Math.floor((h+l-7*m+114)/31), dia = ((h+l-7*m+114) % 31) + 1;
    return new Date(Date.UTC(ano, mes-1, dia));
  }
  static feriados(ano) {
    const d = (m, dia) => new Date(Date.UTC(ano, m-1, dia));
    const p = PrazoUtils._pascoa(ano), dia = 86400000;
    return [
      [d(1,1), 'Confraternização Universal'],
      [new Date(+p - 48*dia), 'Carnaval (segunda)'],
      [new Date(+p - 47*dia), 'Carnaval (terça)'],
      [new Date(+p - 2*dia), 'Sexta-feira Santa'],
      [d(4,21), 'Tiradentes'], [d(5,1), 'Dia do Trabalho'],
      [new Date(+p + 60*dia), 'Corpus Christi'],
      [d(9,7), 'Independência'], [d(10,12), 'Nossa Senhora Aparecida'],
      [d(11,2), 'Finados'], [d(11,15), 'Proclamação da República'],
      [d(11,20), 'Consciência Negra'], [d(12,25), 'Natal'],
    ].map(([data, nome]) => ({ data: data.toISOString().slice(0,10), nome }));
  }
  /** Conta dias ÚTEIS (art. 219 do CPC), pulando fim de semana e feriado. */
  static contar(inicio, dias, { uteis = true, recessoForense = true } = {}) {
    const d0 = new Date(inicio + 'T12:00:00Z');
    if (isNaN(d0)) throw new Error('data inicial inválida — use aaaa-mm-dd');
    if (!(dias > 0)) throw new Error('o prazo precisa ser de pelo menos 1 dia');
    const mapa = new Map();
    for (const a of [d0.getUTCFullYear(), d0.getUTCFullYear()+1, d0.getUTCFullYear()+2])
      for (const f of PrazoUtils.feriados(a)) mapa.set(f.data, f.nome);
    const pulados = [];
    let d = new Date(d0), contados = 0;
    while (contados < dias) {
      d = new Date(+d + 86400000);
      const iso = d.toISOString().slice(0,10);
      const fds = d.getUTCDay() === 0 || d.getUTCDay() === 6;
      const rec = recessoForense && (iso.slice(5) >= '12-20' || iso.slice(5) <= '01-20');
      const fer = mapa.get(iso);
      if (uteis && (fds || fer || rec)) {
        pulados.push({ data: iso, motivo: fer || (fds ? 'fim de semana' : 'recesso forense (arts. 220 do CPC)') });
        continue;
      }
      contados++;
    }
    return {
      inicio, dias, contagem: uteis ? 'dias úteis' : 'dias corridos',
      vencimento: d.toISOString().slice(0,10),
      dias_pulados: pulados.length, pulados,
      aviso: 'feriados estaduais e municipais não entram nesta conta e podem mover o vencimento',
    };
  }
}
if (typeof window !== 'undefined') {
  window.FormatoUtils = FormatoUtils; window.TextoUtils = TextoUtils; window.PrazoUtils = PrazoUtils;
}
