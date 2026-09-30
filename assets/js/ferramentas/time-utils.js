/**
 * TimestampUtils — Unix timestamp conversion, arithmetic, and formatting.
 * TimezoneUtils — Timezone conversion and business hours check (Intl API).
 * No CDN required.
 */
class TimestampUtils {
  static now() {
    const d = new Date();
    return {
      unix: Math.floor(d.getTime() / 1000),
      unixMs: d.getTime(),
      iso: d.toISOString(),
      local: d.toLocaleString('pt-BR'),
      utc: d.toUTCString(),
      date: d.toISOString().split('T')[0],
      time: d.toTimeString().split(' ')[0]
    };
  }

  static fromUnix(seconds) {
    const d = new Date(seconds * 1000);
    return { unix: seconds, iso: d.toISOString(), local: d.toLocaleString('pt-BR'), utc: d.toUTCString() };
  }

  static fromUnixMs(ms) {
    const d = new Date(ms);
    return { unixMs: ms, unix: Math.floor(ms/1000), iso: d.toISOString(), local: d.toLocaleString('pt-BR') };
  }

  static fromISO(iso) {
    const d = new Date(iso);
    if (isNaN(d)) throw new Error('Invalid ISO string');
    return { iso, unix: Math.floor(d.getTime()/1000), unixMs: d.getTime(), local: d.toLocaleString('pt-BR') };
  }

  static fromString(str, locale = 'pt-BR') {
    const d = new Date(str);
    if (isNaN(d)) throw new Error('Invalid date string');
    return { input: str, unix: Math.floor(d.getTime()/1000), iso: d.toISOString(), local: d.toLocaleString(locale) };
  }

  /* Soma tempo a um instante.
   *
   * A versão anterior só entendia days/hours/minutes/seconds, e IGNORAVA
   * qualquer outra chave sem avisar: add(t, {months:1}) devolvia a mesma data.
   * Pedir um mês e receber zero, calado, é pior que receber um erro.
   *
   * Meses e anos são de calendário, não de 30 ou 365 dias — e por isso
   * precisam de limite: 31/01 + 1 mês cai em 29/02 num ano bissexto, porque
   * 31 de fevereiro não existe. */
  static add(unixSeconds, opts = {}) {
    const CONHECIDAS = ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds'];
    const desconhecidas = Object.keys(opts).filter(k => !CONHECIDAS.includes(k));
    if (desconhecidas.length)
      throw new Error(`opção desconhecida: ${desconhecidas.join(', ')}. Use ${CONHECIDAS.join(', ')}`);
    const { years = 0, months = 0, weeks = 0, days = 0, hours = 0, minutes = 0, seconds = 0 } = opts;

    const d = new Date(unixSeconds * 1000);
    if (years || months) {
      const diaOriginal = d.getUTCDate();
      d.setUTCDate(1);                                   // evita transbordo de mês
      d.setUTCFullYear(d.getUTCFullYear() + years, d.getUTCMonth() + months);
      const ultimoDia = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      d.setUTCDate(Math.min(diaOriginal, ultimoDia));
    }
    const total = Math.floor(d.getTime() / 1000)
                + weeks * 604800 + days * 86400 + hours * 3600 + minutes * 60 + seconds;
    return TimestampUtils.fromUnix(total);
  }

  /* Diferença entre dois instantes. Dias e semanas são exatos; meses e anos
   * são ESTIMATIVAS por 30 e 365 dias, e vêm rotuladas como tal — um ano
   * bissexto tem 366 dias, e chamar isso de "1 ano" sem ressalva induz erro
   * em cálculo de prazo. */
  static diff(unixA, unixB) {
    const d = Math.abs(unixA - unixB);
    return {
      seconds: d, minutes: Math.floor(d / 60), hours: Math.floor(d / 3600),
      days: Math.floor(d / 86400), weeks: Math.floor(d / 604800),
      months_aprox: Math.floor(d / 2592000), years_aprox: Math.floor(d / 31536000),
      nota: 'meses e anos são aproximações (30 e 365 dias); dias e semanas são exatos',
    };
  }

  static format(unixSeconds, locale = 'pt-BR', opts = {}) {
    return new Date(unixSeconds * 1000).toLocaleString(locale, { ...opts });
  }


  /* Detecta se um epoch está em segundos, milissegundos, microssegundos ou
   * nanossegundos. Sem isso, colar 1700000000000 num campo "segundos" devolve
   * o ano 55840 sem reclamar de nada — que é o erro mais comum com epoch.
   * A heurística é a ordem de grandeza: um instante plausível (1970–2100) tem
   * ~10 dígitos em segundos, 13 em ms, 16 em µs e 19 em ns. */
  static detectarUnidade(n) {
    const abs = Math.abs(Number(n));
    if (!isFinite(abs)) throw new Error('não é um número');
    if (abs === 0) return { unidade: 's', paraMs: 1, certeza: 'baixa' };
    if (abs < 1e11) return { unidade: 's',  paraMs: 1e3,  certeza: abs > 1e8 ? 'alta' : 'baixa' };
    if (abs < 1e14) return { unidade: 'ms', paraMs: 1,    certeza: 'alta' };
    if (abs < 1e17) return { unidade: 'us', paraMs: 1e-3, certeza: 'alta' };
    return             { unidade: 'ns', paraMs: 1e-6, certeza: 'alta' };
  }

  /* Aceita qualquer coisa: epoch em qualquer unidade, ISO 8601, ou texto de
   * data. Devolve sempre o mesmo formato, para a interface não ter que
   * adivinhar qual caminho foi usado. */
  static parseQualquer(entrada, fusoAlvo) {
    const txt = String(entrada ?? '').trim();
    if (!txt) throw new Error('vazio');
    let ms, origem, unidade = null, certeza = null;

    if (/^-?\d+(\.\d+)?$/.test(txt)) {
      const d = TimestampUtils.detectarUnidade(txt);
      unidade = d.unidade; certeza = d.certeza;
      ms = Number(txt) * d.paraMs;
      origem = `epoch em ${{s:'segundos', ms:'milissegundos', us:'microssegundos', ns:'nanossegundos'}[d.unidade]}`;
    } else {
      /* new Date() não entende dd/mm/aaaa: 15/01/2024 vira "Invalid Date", e
       * 03/04/2024 vira 4 de MARÇO, porque ele assume mm/dd. Como aqui a
       * entrada mais provável é a brasileira, ela é tratada antes. */
      const br = txt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
      let dt;
      if (br) {
        const [, dia, mes, ano, h = 0, mi = 0, se = 0] = br;
        dt = new Date(+ano, +mes - 1, +dia, +h, +mi, +se);
        if (dt.getMonth() !== +mes - 1 || dt.getDate() !== +dia)
          throw new Error(`${dia}/${mes}/${ano} não existe no calendário`);
        origem = 'data no formato brasileiro (dd/mm/aaaa)';
      } else {
        dt = new Date(txt);
        origem = 'texto de data';
      }
      if (isNaN(dt)) throw new Error(`não reconheci "${txt}" como data nem como epoch`);
      ms = dt.getTime();
    }
    const d = new Date(ms);
    if (isNaN(d)) throw new Error('a data resultante é inválida');

    const fuso = fusoAlvo || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const noFuso = new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'full', timeStyle: 'long', timeZone: fuso }).format(d);
    const off = -d.getTimezoneOffset();
    const sinal = off >= 0 ? '+' : '-';
    const offTxt = `${sinal}${String(Math.floor(Math.abs(off)/60)).padStart(2,'0')}:${String(Math.abs(off)%60).padStart(2,'0')}`;

    return {
      origem, unidade, certeza,
      epoch_s:  Math.floor(ms / 1000),
      epoch_ms: Math.round(ms),
      epoch_us: Math.round(ms * 1000),
      epoch_ns: Math.round(ms * 1e6),
      iso_utc:  d.toISOString(),
      iso_local: new Date(ms - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19) + offTxt,
      rfc_utc:  d.toUTCString(),
      local:    d.toLocaleString('pt-BR'),
      no_fuso:  noFuso,
      fuso,
      dia_da_semana: d.toLocaleDateString('pt-BR', { weekday: 'long' }),
      relativo: TimestampUtils.toRelative(Math.floor(ms / 1000)),
      ano_bissexto: (y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)(d.getFullYear()),
      dia_do_ano: Math.floor((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 0))) / 86400000),
    };
  }

  static toRelative(unixSeconds, locale = 'pt-BR') {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - unixSeconds;
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (Math.abs(diff) < 60)      return rtf.format(-diff, 'second');
    if (Math.abs(diff) < 3600)    return rtf.format(-Math.floor(diff/60), 'minute');
    if (Math.abs(diff) < 86400)   return rtf.format(-Math.floor(diff/3600), 'hour');
    if (Math.abs(diff) < 604800)  return rtf.format(-Math.floor(diff/86400), 'day');
    if (Math.abs(diff) < 2592000) return rtf.format(-Math.floor(diff/604800), 'week');
    if (Math.abs(diff) < 31536000) return rtf.format(-Math.floor(diff/2592000), 'month');
    return rtf.format(-Math.floor(diff/31536000), 'year');
  }
}

class TimezoneUtils {
  static COMMON_ZONES = [
    'UTC','America/Sao_Paulo','America/New_York','America/Los_Angeles',
    'America/Mexico_City','America/Buenos_Aires','America/Lima',
    'Europe/London','Europe/Paris','Europe/Berlin','Europe/Moscow',
    'Asia/Tokyo','Asia/Shanghai','Asia/Dubai','Asia/Kolkata',
    'Australia/Sydney','Pacific/Auckland'
  ];

  /* Quanto o fuso está adiantado em relação ao UTC NAQUELE instante, em ms.
   * Tem de ser por instante, não fixo: o mesmo fuso muda com horário de verão. */
  static _deslocamento(instante, zona) {
    const p = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: zona, year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false,
    }).formatToParts(new Date(instante)).forEach(x => p[x.type] = x.value);
    const comoUTC = Date.UTC(+p.year, +p.month - 1, +p.day,
                             +p.hour % 24, +p.minute, +p.second);
    /* As partes têm precisão de segundo e o instante tem milissegundos, então
     * a subtração crua vaza a fração — e o deslocamento saía como
     * "-03:0.01176…". Fuso real é sempre minuto inteiro; arredondar é correto
     * e não esconde nada. */
    return Math.round((comoUTC - instante) / 60000) * 60000;
  }

  /* Texto de hora de parede SEM fuso ("2024-01-15T10:30") vira instante,
   * interpretando os dígitos como hora local da zona informada. */
  static _instanteDeParede(texto, zona) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(texto.trim());
    if (!m) return null;
    const [, A, M, D, h, mi, se = '0'] = m;
    const palpite = Date.UTC(+A, +M - 1, +D, +h, +mi, +se);
    /* Duas passadas: a primeira usa o deslocamento no palpite, que pode cair do
     * lado errado de uma virada de horário de verão; a segunda corrige. */
    let inst = palpite - TimezoneUtils._deslocamento(palpite, zona);
    inst = palpite - TimezoneUtils._deslocamento(inst, zona);
    return inst;
  }

  /**
   * Converte para outro fuso.
   *
   * A versão anterior tinha um defeito de 3 horas no Brasil: ela lia a hora de
   * parede na zona de origem e reinterpretava esses dígitos como UTC, o que
   * DESLOCA o instante. Convertendo um fuso para ele mesmo, o resultado mudava
   * — que é o teste que denuncia o problema.
   *
   * A regra certa: epoch e ISO com Z ou deslocamento já são instantes
   * absolutos, e nesse caso a zona de origem não altera nada; ela só importa
   * quando a entrada é hora de parede sem fuso.
   */
  static convert(entrada, fromZone, toZone) {
    let instante, interpretacao;
    if (typeof entrada === 'number') {
      instante = entrada < 1e11 ? entrada * 1000 : entrada;
      interpretacao = 'epoch (instante absoluto; o fuso de origem não se aplica)';
    } else {
      const txt = String(entrada).trim();
      const daParede = TimezoneUtils._instanteDeParede(txt, fromZone);
      if (daParede !== null) {
        instante = daParede;
        interpretacao = `hora de parede lida em ${fromZone}`;
      } else {
        const d = new Date(txt);
        if (isNaN(d)) throw new Error(`não reconheci "${txt}" como data`);
        instante = d.getTime();
        interpretacao = 'instante absoluto (o texto já trazia fuso); a origem não se aplica';
      }
    }
    const fmt = (zona) => new Intl.DateTimeFormat('sv-SE', {   // sv-SE dá aaaa-mm-dd hh:mm:ss
      timeZone: zona, year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false,
    }).format(new Date(instante)).replace(' ', 'T');
    const desloc = (zona) => {
      const min = TimezoneUtils._deslocamento(instante, zona) / 60000;
      const s = min >= 0 ? '+' : '-';
      return `${s}${String(Math.floor(Math.abs(min)/60)).padStart(2,'0')}:${String(Math.abs(min)%60).padStart(2,'0')}`;
    };
    return {
      interpretacao,
      from: fromZone, to: toZone,
      epoch_s: Math.floor(instante / 1000),
      original: new Date(instante).toISOString(),
      na_origem: `${fmt(fromZone)}${desloc(fromZone)}`,
      converted: fmt(toZone),
      formatted: new Intl.DateTimeFormat('pt-BR', {
        timeZone: toZone, dateStyle: 'full', timeStyle: 'long' }).format(new Date(instante)),
      offset: desloc(toZone),
      diferenca_horas: (TimezoneUtils._deslocamento(instante, toZone)
                      - TimezoneUtils._deslocamento(instante, fromZone)) / 3600000,
    };
  }

  /* Deslocamento do fuso, sempre com dois dígitos e sinal.
   * A versão anterior lia o texto do Intl com /GMT([+-]\d{1,2}:?\d{2})?/, que
   * exige três dígitos depois do sinal. Mas shortOffset devolve "GMT-3", não
   * "GMT-03:00" — então TODO fuso de hora cheia caía no ramo opcional e virava
   * "+00:00". São Paulo, Tóquio e Lisboa saíam todos como UTC. */
  static getOffset(date, zone) {
    const min = -TimezoneUtils._deslocamento(+date, zone) / 60000;
    const sinal = min <= 0 ? '+' : '-';
    const a = Math.abs(min);
    return `${sinal}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
  }

  static listZones() { return this.COMMON_ZONES; }

  static nowInZone(zone) {
    return new Date().toLocaleString('pt-BR', { timeZone: zone, dateStyle:'full', timeStyle:'long' });
  }

  static businessHours(isoOrUnix, zone, workStart = 9, workEnd = 18) {
    const d = typeof isoOrUnix === 'number'
      ? new Date(isoOrUnix < 1e11 ? isoOrUnix * 1000 : isoOrUnix) : new Date(isoOrUnix);
    if (isNaN(d)) throw new Error('data inválida');
    /* hour12:false devolve 24 para meia-noite em vez de 0 — um caso conhecido
     * do Intl. Sem o % 24, meia-noite vira "hora 24" e qualquer comparação de
     * expediente passa a mentir. */
    const hora = parseInt(d.toLocaleString('en-US',
      { timeZone: zone, hour: 'numeric', hour12: false }), 10) % 24;
    const dia = d.toLocaleString('en-US', { timeZone: zone, weekday: 'short' });
    const fimDeSemana = ['Sat', 'Sun'].includes(dia);
    return {
      isBusinessHour: !fimDeSemana && hora >= workStart && hora < workEnd,
      hour: hora, day: dia, isWeekend: fimDeSemana, workStart, workEnd,
      local: d.toLocaleString('pt-BR', { timeZone: zone }),
    };
  }
}
