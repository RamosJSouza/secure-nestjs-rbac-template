import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'crypto';

export function assertValidJwtKeyPair(privateKey: string, publicKey: string): void {
  const priv = createPrivateKey({ key: privateKey });
  const pub = createPublicKey({ key: publicKey });
  const derivedFromPrivate = createPublicKey(priv);
  const providedDer = pub.export({ type: 'spki', format: 'der' });
  const derivedDer = derivedFromPrivate.export({ type: 'spki', format: 'der' });
  if (!providedDer.equals(derivedDer)) {
    throw new Error(
      'JWT RSA key pair mismatch: PUBLIC_KEY does not correspond to PRIVATE_KEY',
    );
  }
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
