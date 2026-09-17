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
