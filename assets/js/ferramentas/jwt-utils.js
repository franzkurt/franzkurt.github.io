/**
 * JWTUtils — Decode and verify JWT tokens (browser-side, HS256 only for verification).
 * JWTInspector — Deep inspection with expiry analysis and custom claims.
 * No CDN required.
 */
class JWTUtils {
  static decode(token) {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT format');
    const decodeBase64 = (str) => {
      const pad = '='.repeat((4 - str.length % 4) % 4);
      const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
      return JSON.parse(atob(base64));
    };
    return {
      header: decodeBase64(parts[0]),
      payload: decodeBase64(parts[1]),
      signature: parts[2]
    };
  }

  static isExpired(token) {
    try {
      const { payload } = this.decode(token);
      return payload.exp ? payload.exp * 1000 < Date.now() : false;
    } catch { return true; }
  }

  /* HS256 only — RS256 requires a private key unavailable in browser */
  static async verify(token, secret) {
    const { header, payload, signature } = this.decode(token);
    if (header.alg !== 'HS256') throw new Error('Only HS256 verification supported in browser');
    const data = token.split('.').slice(0, 2).join('.');
    const k = new TextEncoder().encode(secret);
    const cryptoKey = await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return signature === expected;
  }
}

class JWTInspector {
  static inspect(token) {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT');
    const decode = (str) => {
      const pad = '='.repeat((4 - str.length % 4) % 4);
      return JSON.parse(atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad));
    };
    const header = decode(parts[0]);
    const payload = decode(parts[1]);
    const now = Math.floor(Date.now() / 1000);
    return {
      header,
      payload,
      signature: parts[2],
      analysis: {
        algorithm: header.alg,
        type: header.typ || 'JWT',
        issuer: payload.iss || null,
        subject: payload.sub || null,
        audience: payload.aud || null,
        issuedAt: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
        expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
        notBefore: payload.nbf ? new Date(payload.nbf * 1000).toISOString() : null,
        isExpired: payload.exp ? payload.exp < now : null,
        timeToExpiry: payload.exp ? payload.exp - now : null,
        claims: Object.keys(payload).filter(k => !['iss','sub','aud','exp','iat','nbf','jti'].includes(k))
      }
    };
  }

  static prettyPrint(token) {
    return JSON.stringify(this.inspect(token), null, 2);
  }
}
