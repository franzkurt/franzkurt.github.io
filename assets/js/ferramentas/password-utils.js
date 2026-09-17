/**
 * PasswordUtils — Cryptographically secure password and passphrase generation.
 * PasswordStrength — Password strength scoring with entropy estimation.
 * No CDN required.
 */
class PasswordUtils {
  static CHARS = {
    uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lowercase: 'abcdefghijklmnopqrstuvwxyz',
    numbers: '0123456789',
    symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?'
  };

  static generate(opts = {}) {
    const {
      length = 16,
      uppercase = true, lowercase = true,
      numbers = true, symbols = true,
      excludeSimilar = false, excludeAmbiguous = false
    } = opts;
    let pool = '';
    if (uppercase) pool += this.CHARS.uppercase;
    if (lowercase) pool += this.CHARS.lowercase;
    if (numbers)   pool += this.CHARS.numbers;
    if (symbols)   pool += this.CHARS.symbols;
    if (excludeSimilar)   pool = pool.replace(/[0O1lI]/g, '');
    if (excludeAmbiguous) pool = pool.replace(/[{}\[\]()/\\|'`~^;:.,<>]/g, '');
    if (!pool) throw new Error('No character pool selected');

    const array = new Uint32Array(length);
    crypto.getRandomValues(array);
    let password = '';
    for (let i = 0; i < length; i++) password += pool[array[i] % pool.length];

    const required = [];
    if (uppercase) required.push(this.CHARS.uppercase[array[0] % this.CHARS.uppercase.length]);
    if (lowercase) required.push(this.CHARS.lowercase[array[1] % this.CHARS.lowercase.length]);
    if (numbers)   required.push(this.CHARS.numbers[array[2] % this.CHARS.numbers.length]);
    if (symbols)   required.push(this.CHARS.symbols[array[3] % this.CHARS.symbols.length]);

    password = password.split('');
    for (let i = 0; i < required.length; i++) password[i] = required[i];
    for (let i = password.length - 1; i > 0; i--) {
      const j = array[i] % (i + 1);
      [password[i], password[j]] = [password[j], password[i]];
    }
    return password.join('');
  }

  static generateBulk(count = 5, opts = {}) {
    return Array.from({ length: count }, () => this.generate(opts));
  }

  static passphrase(opts = {}) {
    const { words = 4, separator = '-', capitalize = true, includeNumber = true } = opts;
    const wordList = [
      'alpha','bravo','charlie','delta','echo','foxtrot','golf','hotel','india',
      'juliet','kilo','lima','mike','november','oscar','papa','quebec','romeo',
      'sierra','tango','uniform','victor','whiskey','xray','yankee','zulu',
      'apple','banana','cherry','dragon','eagle','falcon','grape','honey',
      'ice','jungle','king','lemon','mango','night','ocean','pearl','queen',
      'rose','sun','tiger','unicorn','violet','wolf','yellow','zen'
    ];
    const arr = new Uint32Array(words + 1);
    crypto.getRandomValues(arr);
    const parts = [];
    for (let i = 0; i < words; i++) {
      let w = wordList[arr[i] % wordList.length];
      if (capitalize) w = w[0].toUpperCase() + w.slice(1);
      parts.push(w);
    }
    if (includeNumber) parts.push(arr[words] % 100);
    return parts.join(separator);
  }
}

class PasswordStrength {
  static check(password) {
    const s = String(password);
    let score = 0, feedback = [];

    if (s.length >= 8)  score += 1;
    if (s.length >= 12) score += 1;
    if (s.length >= 16) score += 1;
    if (s.length < 8)   feedback.push('Muito curto (mínimo 8 caracteres)');

    if (/[A-Z]/.test(s)) score += 1; else feedback.push('Adicione letras maiúsculas');
    if (/[a-z]/.test(s)) score += 1; else feedback.push('Adicione letras minúsculas');
    if (/\d/.test(s))    score += 1; else feedback.push('Adicione números');
    if (/[^A-Za-z0-9]/.test(s)) score += 1; else feedback.push('Adicione símbolos');

    if (/(.+)\1{2,}/.test(s)) { score -= 1; feedback.push('Evite repetições (aaa, 111)'); }
    if (/^(.)\1+$/.test(s))   { score = 0;  feedback.push('Caracteres todos iguais'); }
    if (/^(123|abc|qwerty|password|senha|admin)/i.test(s)) { score -= 2; feedback.push('Padrão comum detectado'); }

    let pool = 0;
    if (/[a-z]/.test(s)) pool += 26;
    if (/[A-Z]/.test(s)) pool += 26;
    if (/\d/.test(s))    pool += 10;
    if (/[^A-Za-z0-9]/.test(s)) pool += 32;
    const entropy = pool ? Math.round(s.length * Math.log2(pool)) : 0;

    const seconds = pool ? Math.pow(pool, s.length) / 1e10 : 0;
    let crackTime = 'instantâneo';
    if (seconds >= 3153600000) crackTime = 'séculos';
    else if (seconds >= 31536000) crackTime = `${Math.round(seconds/31536000)} anos`;
    else if (seconds >= 86400)    crackTime = `${Math.round(seconds/86400)} dias`;
    else if (seconds >= 3600)     crackTime = `${Math.round(seconds/3600)} horas`;
    else if (seconds >= 60)       crackTime = `${Math.round(seconds/60)} minutos`;
    else if (seconds >= 1)        crackTime = `${Math.round(seconds)} segundos`;

    const levels = ['Muito Fraca','Fraca','Razoável','Boa','Forte','Muito Forte'];
    const clamped = Math.max(0, Math.min(5, score));
    return {
      score: clamped, label: levels[clamped], entropy, crackTime,
      feedback: feedback.length ? feedback : ['Senha excelente!'],
      length: s.length,
      hasUpper: /[A-Z]/.test(s), hasLower: /[a-z]/.test(s),
      hasNumber: /\d/.test(s), hasSymbol: /[^A-Za-z0-9]/.test(s)
    };
  }

  static isCommon(password) {
    const common = ['123456','password','12345678','qwerty','12345','123456789','letmein',
      '1234567','football','iloveyou','admin','welcome','monkey','login','abc123',
      'senha','brasil','123123','password1','1234','master','sunshine','princess'];
    return common.includes(String(password).toLowerCase());
  }
}
