// ─── Encrypted Vault: Web Crypto helpers ─────────────────────────────────────

const PBKDF2_ITERATIONS = 600000;
const VERIFIER_PLAINTEXT = 'taskpad-vault-ok';

export function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}

export function toBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function fromBase64(str) {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,   // non-extractable
    ['encrypt', 'decrypt']
  );
}

export async function encryptEntry(key, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(data))
  );
  return { encryptedData: toBase64(ciphertext), iv: toBase64(iv) };
}

export async function decryptEntry(key, encryptedData, iv) {
  const dec = new TextDecoder();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) },
    key,
    fromBase64(encryptedData)
  );
  return JSON.parse(dec.decode(plaintext));
}

export async function createVerifier(key) {
  const { encryptedData, iv } = await encryptEntry(key, VERIFIER_PLAINTEXT);
  return { verifier: encryptedData, verifierIv: iv };
}

export async function checkVerifier(key, verifier, verifierIv) {
  try {
    const result = await decryptEntry(key, verifier, verifierIv);
    return result === VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}
