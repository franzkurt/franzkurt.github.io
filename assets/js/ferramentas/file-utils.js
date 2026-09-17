/**
 * FileUtils — FileReader wrappers and byte formatting.
 * UUIDUtils — UUID v4 generation, validation, and parsing.
 * No CDN required.
 */
class FileUtils {
  static readAsText(file, encoding = 'UTF-8') {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = e => resolve(e.target.result);
      r.onerror = reject;
      r.readAsText(file, encoding);
    });
  }

  static readAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = e => resolve(e.target.result);
      r.onerror = reject;
      r.readAsArrayBuffer(file);
    });
  }

  static readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = e => resolve(e.target.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  static formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 B';
    const k = 1024, dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
}

class UUIDUtils {
  static generate() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID)
      return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  static generateBulk(count = 10) {
    return Array.from({ length: count }, () => this.generate());
  }

  static validate(uuid) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(uuid));
  }

  static parse(uuid) {
    const hex = uuid.replace(/-/g, '');
    return {
      timeLow: hex.slice(0, 8),
      timeMid: hex.slice(8, 12),
      timeHighAndVersion: hex.slice(12, 16),
      clockSeq: hex.slice(16, 20),
      node: hex.slice(20, 32),
      variant: (parseInt(hex[16], 16) & 0b1100) >> 2,
      version: parseInt(hex[12], 16)
    };
  }
}
