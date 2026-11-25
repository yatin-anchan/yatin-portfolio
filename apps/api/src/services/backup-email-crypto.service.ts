
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

const FORMAT_VERSION = 'v1';

function deriveKey(salt: Buffer): Buffer {
  return scryptSync(
    env.BACKUP_EMAIL_ENCRYPTION_KEY,
    salt,
    KEY_LENGTH,
  );
}

/**
 * Encrypt a backup email address.
 *
 * Format:
 * v1:salt:iv:authTag:ciphertext
 */
export function encryptBackupEmail(email: string): string {
  const normalizedEmail = email.trim().toLowerCase();

  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(salt);

  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(normalizedEmail, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    FORMAT_VERSION,
    salt.toString('hex'),
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

/**
 * Decrypt a previously encrypted backup email address.
 */
export function decryptBackupEmail(
  encryptedValue: string,
): string {
  const parts = encryptedValue.split(':');

  if (parts.length !== 5 || parts[0] !== FORMAT_VERSION) {
    throw new Error('Invalid encrypted backup email format.');
  }

  const [, saltHex, ivHex, authTagHex, ciphertextHex] = parts;

  if (
    typeof saltHex !== 'string' ||
    typeof ivHex !== 'string' ||
    typeof authTagHex !== 'string' ||
    typeof ciphertextHex !== 'string' ||
    !/^[a-f0-9]{32}$/i.test(saltHex) ||
    !/^[a-f0-9]{24}$/i.test(ivHex) ||
    !/^[a-f0-9]{32}$/i.test(authTagHex) ||
    !/^(?:[a-f0-9]{2})+$/i.test(ciphertextHex)
  ) {
    throw new Error('Invalid encrypted backup email data.');
  }

  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const key = deriveKey(salt);

  const decipher = createDecipheriv(ALGORITHM, key, iv);

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  const email = decrypted.toString('utf8').trim().toLowerCase();

  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error('Decrypted backup email is invalid.');
  }

  return email;
}
