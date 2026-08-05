import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randSegment(len) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function generateLicense(prefix = 'AX') {
  return `${prefix}-${randSegment(5)}-${randSegment(5)}-${randSegment(5)}-${randSegment(5)}`;
}

export function generateDownloadToken() {
  return crypto.randomBytes(32).toString('base64url');
}
