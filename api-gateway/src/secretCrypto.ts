import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

export interface EncryptedSecretEnvelope {
  algorithm: 'aes-256-gcm';
  kdf: 'scrypt';
  saltB64: string;
  ivB64: string;
  authTagB64: string;
  ciphertextB64: string;
}

function getMasterPassphrase(): string {
  const value = process.env.SECRET_STORE_PASSPHRASE || process.env.POSTGRES_SECRET_PASSPHRASE;
  if (!value) {
    throw new Error('SECRET_STORE_PASSPHRASE is not configured.');
  }

  return value;
}

function deriveKey(passphrase: string, salt: Buffer) {
  return scryptSync(passphrase, salt, 32);
}

export function isPostgresSecretStoreEnabled() {
  return Boolean(process.env.SECRET_STORE_PASSPHRASE || process.env.POSTGRES_SECRET_PASSPHRASE);
}

export function encryptSecret(plaintext: string): EncryptedSecretEnvelope {
  const passphrase = getMasterPassphrase();
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);

  return {
    algorithm: 'aes-256-gcm',
    kdf: 'scrypt',
    saltB64: salt.toString('base64'),
    ivB64: iv.toString('base64'),
    authTagB64: cipher.getAuthTag().toString('base64'),
    ciphertextB64: ciphertext.toString('base64')
  };
}

export function decryptSecret(envelope: EncryptedSecretEnvelope): string {
  const passphrase = getMasterPassphrase();
  if (envelope.algorithm !== 'aes-256-gcm' || envelope.kdf !== 'scrypt') {
    throw new Error('Unsupported secret envelope format.');
  }

  const salt = Buffer.from(envelope.saltB64, 'base64');
  const iv = Buffer.from(envelope.ivB64, 'base64');
  const authTag = Buffer.from(envelope.authTagB64, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertextB64, 'base64');
  const key = deriveKey(passphrase, salt);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);
  return plaintext.toString('utf8');
}
