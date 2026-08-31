import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

/**
 * Encrypted-blob wire format:
 *
 *   v1:<ivBase64>:<authTagBase64>:<ciphertextBase64>
 *
 * - `v1`          format/version marker (rejects anything else on decrypt)
 * - ivBase64      12 random bytes, unique per encryption (AES-GCM nonce)
 * - authTagBase64 16-byte GCM authentication tag
 * - ciphertextBase64  AES-256-GCM ciphertext of the UTF-8 plaintext
 *   (empty for the encryption of an empty-string plaintext)
 */
const BLOB_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export const ENCRYPTION_KEY_ENV = 'APP_ENCRYPTION_KEY';

/**
 * Thrown when `APP_ENCRYPTION_KEY` is missing, not valid Base64, or does not
 * decode to exactly 32 bytes. This is a fatal misconfiguration.
 */
export class CryptoConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoConfigError';
  }
}

/**
 * Thrown when a blob cannot be decrypted: malformed structure, unknown
 * version, non-Base64 segments, or a failed GCM authentication check
 * (tampered data or wrong key). Never recovered from silently.
 */
export class CryptoDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoDecryptionError';
  }
}

/**
 * AES-256-GCM encryption for integration credentials and other secrets
 * at rest.
 *
 * The key is read from the `APP_ENCRYPTION_KEY` environment variable as a
 * Base64 string. It is decoded and validated lazily on first use and then
 * cached on the instance, so simply importing `CryptoModule` never affects
 * application boot; the first `encrypt` / `decrypt` call fails fast with a
 * clear {@link CryptoConfigError} if the key is absent or malformed. There
 * is no insecure fallback and no deterministic mode.
 *
 * This service never logs plaintext, keys, or ciphertext.
 */
@Injectable()
export class CryptoService {
  private cachedKey: Buffer | null = null;

  /**
   * Encrypt a UTF-8 string. Returns a `v1:<iv>:<tag>:<ciphertext>` blob.
   * A fresh random IV is generated on every call, so encrypting the same
   * plaintext twice yields different blobs.
   */
  encrypt(plaintext: string): string {
    if (typeof plaintext !== 'string') {
      throw new TypeError('CryptoService.encrypt expects a string plaintext');
    }

    const key = this.getKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      BLOB_VERSION,
      iv.toString('base64'),
      authTag.toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  /**
   * Decrypt a blob produced by {@link encrypt}. Throws
   * {@link CryptoDecryptionError} on any structural problem or when GCM
   * authentication fails (tampered ciphertext/tag/iv, or a different key).
   */
  decrypt(blob: string): string {
    if (typeof blob !== 'string' || blob.length === 0) {
      throw new CryptoDecryptionError(
        'Encrypted blob must be a non-empty string',
      );
    }

    const segments = blob.split(':');
    if (segments.length !== 4) {
      throw new CryptoDecryptionError(
        'Malformed encrypted blob: expected 4 colon-separated segments',
      );
    }

    const [version, ivB64, authTagB64, ciphertextB64] = segments;

    if (version !== BLOB_VERSION) {
      throw new CryptoDecryptionError(
        `Unsupported encrypted blob version: "${version}"`,
      );
    }

    const iv = this.decodeSegment(ivB64, 'IV');
    const authTag = this.decodeSegment(authTagB64, 'auth tag');
    // An empty ciphertext segment is valid: it is the encryption of an
    // empty-string plaintext (GCM still yields a 16-byte auth tag).
    const ciphertext =
      ciphertextB64 === ''
        ? Buffer.alloc(0)
        : this.decodeSegment(ciphertextB64, 'ciphertext');

    if (iv.length !== IV_BYTES) {
      throw new CryptoDecryptionError(
        'Malformed encrypted blob: invalid IV length',
      );
    }
    if (authTag.length !== AUTH_TAG_BYTES) {
      throw new CryptoDecryptionError(
        'Malformed encrypted blob: invalid auth tag length',
      );
    }

    const key = this.getKey();
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    try {
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // GCM authentication failed: tampered data or a different key.
      throw new CryptoDecryptionError(
        'Failed to decrypt: authentication check failed (tampered data or wrong key)',
      );
    }
  }

  private decodeSegment(value: string, label: string): Buffer {
    if (!value || !CryptoService.isBase64(value)) {
      throw new CryptoDecryptionError(
        `Malformed encrypted blob: ${label} is not valid Base64`,
      );
    }
    return Buffer.from(value, 'base64');
  }

  private static isBase64(value: string): boolean {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
      return false;
    }
    // Reject strings that are not canonical Base64 (e.g. bad padding).
    const reencoded = Buffer.from(value, 'base64').toString('base64');
    return reencoded.replace(/=+$/, '') === value.replace(/=+$/, '');
  }

  private getKey(): Buffer {
    if (this.cachedKey) {
      return this.cachedKey;
    }

    const raw = process.env[ENCRYPTION_KEY_ENV];
    if (raw === undefined || raw === null || raw.trim() === '') {
      throw new CryptoConfigError(
        `${ENCRYPTION_KEY_ENV} is not set. Provide a Base64-encoded 32-byte key ` +
          '(generate one with: openssl rand -base64 32).',
      );
    }

    const normalized = raw.trim();
    if (!CryptoService.isBase64(normalized)) {
      throw new CryptoConfigError(
        `${ENCRYPTION_KEY_ENV} is not valid Base64 ` +
          '(generate one with: openssl rand -base64 32).',
      );
    }

    const decoded = Buffer.from(normalized, 'base64');
    if (decoded.length !== KEY_BYTES) {
      throw new CryptoConfigError(
        `${ENCRYPTION_KEY_ENV} must decode to exactly ${KEY_BYTES} bytes, ` +
          `got ${decoded.length} (generate one with: openssl rand -base64 32).`,
      );
    }

    this.cachedKey = decoded;
    return this.cachedKey;
  }
}
