import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'crypto';

export function assertValidJwtKeyPair(privateKey: string, publicKey: string): void {
  createPrivateKey({ key: privateKey });
  createPublicKey({ key: publicKey });
}

export function isValidJwtKeyPair(privateKey: string, publicKey: string): boolean {
  if (!privateKey?.trim() || !publicKey?.trim()) {
    return false;
  }

  try {
    assertValidJwtKeyPair(privateKey, publicKey);
    return true;
  } catch {
    return false;
  }
}

/** Generates a throwaway RSA key pair for tests. */
export function generateTestRsaKeyPair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return { privateKey, publicKey };
}
