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

  static add(unixSeconds, opts = {}) {
    const { days = 0, hours = 0, minutes = 0, seconds = 0 } = opts;
    const total = unixSeconds + (days * 86400) + (hours * 3600) + (minutes * 60) + seconds;
    return this.fromUnix(total);
  }

  static diff(unixA, unixB) {
    const diff = Math.abs(unixA - unixB);
    return {
      seconds: diff, minutes: Math.floor(diff/60), hours: Math.floor(diff/3600),
      days: Math.floor(diff/86400), weeks: Math.floor(diff/604800),
      months: Math.floor(diff/2592000), years: Math.floor(diff/31536000)
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

  static convert(isoOrUnix, fromZone, toZone) {
    const input = typeof isoOrUnix === 'number' ? new Date(isoOrUnix * 1000) : new Date(isoOrUnix);
    if (isNaN(input)) throw new Error('Invalid input');
    const fmtParts = (date, zone) => {
      const parts = {};
      new Intl.DateTimeFormat('en-US', {
        timeZone: zone, year:'numeric', month:'2-digit', day:'2-digit',
        hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: false
      }).formatToParts(date).forEach(pt => parts[pt.type] = pt.value);
      return parts;
    };
    const p = fmtParts(input, fromZone);
    const utcDate = new Date(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    const d = fmtParts(utcDate, toZone);
    return {
      from: fromZone, to: toZone, original: input.toISOString(),
      converted: `${d.year}-${d.month}-${d.day}T${d.hour}:${d.minute}:${d.second}`,
      formatted: new Intl.DateTimeFormat('pt-BR', { timeZone: toZone, dateStyle:'full', timeStyle:'long' }).format(utcDate),
      offset: this.getOffset(utcDate, toZone)
    };
  }

  static getOffset(date, zone) {
    const str = date.toLocaleString('en-US', { timeZone: zone, timeZoneName: 'shortOffset' });
    const match = str.match(/GMT([+-]\d{1,2}:?\d{2})?/);
    return match ? match[1] || '+00:00' : 'unknown';
  }

  static listZones() { return this.COMMON_ZONES; }

  static nowInZone(zone) {
    return new Date().toLocaleString('pt-BR', { timeZone: zone, dateStyle:'full', timeStyle:'long' });
  }

  static businessHours(isoOrUnix, zone, workStart = 9, workEnd = 18) {
    const d = typeof isoOrUnix === 'number' ? new Date(isoOrUnix * 1000) : new Date(isoOrUnix);
    const hour = parseInt(d.toLocaleString('en-US', { timeZone: zone, hour:'numeric', hour12:false }));
    const day = d.toLocaleString('en-US', { timeZone: zone, weekday:'short' });
    const isWeekend = ['Sat','Sun'].includes(day);
    return { isBusinessHour: !isWeekend && hour >= workStart && hour < workEnd, hour, day, isWeekend, workStart, workEnd };
  }
}
