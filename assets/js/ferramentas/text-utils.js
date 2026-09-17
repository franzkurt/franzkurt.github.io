/**
 * SlugUtils — URL-safe slug generation with accent stripping and uniqueness support.
 * No CDN required.
 */
class SlugUtils {
  static generate(text, opts = {}) {
    const { separator = '-', lowercase = true, maxLength = null, strict = false } = opts;
    let slug = String(text)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\w\s-]/g, strict ? '' : ' ')
      .trim()
      .replace(/\s+/g, separator)
      .replace(/-+/g, separator);
    if (lowercase) slug = slug.toLowerCase();
    if (maxLength && slug.length > maxLength) slug = slug.substring(0, maxLength).replace(/-+$/, '');
    return slug;
  }

  static generateUnique(text, existing = [], opts = {}) {
    let slug = this.generate(text, opts);
    let counter = 1, base = slug;
    while (existing.includes(slug)) {
      slug = `${base}${opts.separator || '-'}${counter}`;
      counter++;
    }
    return slug;
  }
}
