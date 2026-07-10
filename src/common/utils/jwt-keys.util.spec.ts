import {
  assertValidJwtKeyPair,
  generateTestRsaKeyPair,
  isValidJwtKeyPair,
} from './jwt-keys.util';

describe('jwt-keys.util', () => {
  const { privateKey, publicKey } = generateTestRsaKeyPair();

  it('isValidJwtKeyPair returns true for a valid RSA PEM pair', () => {
    expect(isValidJwtKeyPair(privateKey, publicKey)).toBe(true);
  });

  it('isValidJwtKeyPair returns false for empty keys', () => {
    expect(isValidJwtKeyPair('', publicKey)).toBe(false);
    expect(isValidJwtKeyPair(privateKey, '')).toBe(false);
  });

  it('isValidJwtKeyPair returns false for PEM-looking but invalid bodies', () => {
    const fake = `-----BEGIN PUBLIC KEY-----\n${'A'.repeat(80)}\n-----END PUBLIC KEY-----`;
    expect(isValidJwtKeyPair(privateKey, fake)).toBe(false);
  });

  it('assertValidJwtKeyPair throws for invalid keys', () => {
    expect(() => assertValidJwtKeyPair('not-a-key', publicKey)).toThrow();
  });

  it('assertValidJwtKeyPair throws when the public key does not match the private key', () => {
    const other = generateTestRsaKeyPair();
    expect(() => assertValidJwtKeyPair(privateKey, other.publicKey)).toThrow();
  });

  it('isValidJwtKeyPair returns false when the public key does not match the private key', () => {
    const other = generateTestRsaKeyPair();
    expect(isValidJwtKeyPair(privateKey, other.publicKey)).toBe(false);
  });

  it('assertValidJwtKeyPair accepts a correctly matched pair', () => {
    expect(() => assertValidJwtKeyPair(privateKey, publicKey)).not.toThrow();
  });
});
