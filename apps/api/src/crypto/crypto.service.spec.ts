import { randomBytes } from 'node:crypto';

import {
  CryptoConfigError,
  CryptoDecryptionError,
  CryptoService,
  ENCRYPTION_KEY_ENV,
} from './crypto.service';

/** A valid 32-byte key, Base64 encoded. */
function makeKey(): string {
  return randomBytes(32).toString('base64');
}

const BLOB_SHAPE =
  /^v1:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]*={0,2}$/;

const KEY_A = makeKey();
const KEY_B = makeKey();

/** Build a service instance bound to `key` (via the env var). */
function serviceWithKey(key: string | undefined): CryptoService {
  if (key === undefined) {
    delete process.env[ENCRYPTION_KEY_ENV];
  } else {
    process.env[ENCRYPTION_KEY_ENV] = key;
  }
  return new CryptoService();
}

describe('CryptoService', () => {
  let savedKey: string | undefined;

  beforeEach(() => {
    savedKey = process.env[ENCRYPTION_KEY_ENV];
    process.env[ENCRYPTION_KEY_ENV] = KEY_A;
  });

  afterEach(() => {
    if (savedKey === undefined) {
      delete process.env[ENCRYPTION_KEY_ENV];
    } else {
      process.env[ENCRYPTION_KEY_ENV] = savedKey;
    }
  });

  describe('encrypt / decrypt round trip', () => {
    it('decrypts back to the original plaintext', () => {
      const svc = new CryptoService();
      const plaintext = 'xoxb-super-secret-slack-bot-token';

      const blob = svc.encrypt(plaintext);

      expect(svc.decrypt(blob)).toBe(plaintext);
    });

    it('round trips unicode and empty strings', () => {
      const svc = new CryptoService();

      expect(svc.decrypt(svc.encrypt(''))).toBe('');
      expect(svc.decrypt(svc.encrypt('pÄ$$wörd — 秘密 🔐'))).toBe(
        'pÄ$$wörd — 秘密 🔐',
      );
    });

    it('round trips a large JSON payload', () => {
      const svc = new CryptoService();
      const payload = JSON.stringify({
        host: 'db.internal',
        password: 'a'.repeat(4096),
      });

      expect(svc.decrypt(svc.encrypt(payload))).toBe(payload);
    });
  });

  describe('blob format', () => {
    it('produces a v1:<iv>:<tag>:<ciphertext> Base64 blob', () => {
      const svc = new CryptoService();

      const blob = svc.encrypt('value');
      const segments = blob.split(':');

      expect(blob).toMatch(BLOB_SHAPE);
      expect(segments).toHaveLength(4);
      expect(segments[0]).toBe('v1');
      expect(Buffer.from(segments[1], 'base64')).toHaveLength(12); // IV
      expect(Buffer.from(segments[2], 'base64')).toHaveLength(16); // auth tag
      expect(Buffer.from(segments[3], 'base64').length).toBeGreaterThan(0);
    });

    it('never returns the plaintext as (or inside) the ciphertext', () => {
      const svc = new CryptoService();
      const plaintext = 'DISTINCTIVE_PLAINTEXT_MARKER_1234567890';

      const blob = svc.encrypt(plaintext);
      const ciphertext = blob.split(':')[3];

      expect(blob).not.toContain(plaintext);
      expect(ciphertext).not.toBe(
        Buffer.from(plaintext, 'utf8').toString('base64'),
      );
      expect(Buffer.from(ciphertext, 'base64').toString('utf8')).not.toBe(
        plaintext,
      );
    });
  });

  describe('non-deterministic encryption (random IV)', () => {
    it('produces a different blob each time for the same plaintext', () => {
      const svc = new CryptoService();

      const first = svc.encrypt('same-input');
      const second = svc.encrypt('same-input');

      expect(first).not.toBe(second);
      expect(svc.decrypt(first)).toBe('same-input');
      expect(svc.decrypt(second)).toBe('same-input');
    });

    it('uses a fresh random IV on every encryption', () => {
      const svc = new CryptoService();

      const ivs = new Set(
        Array.from({ length: 25 }, () => svc.encrypt('x').split(':')[1]),
      );

      expect(ivs.size).toBe(25);
    });
  });

  describe('tamper detection', () => {
    it('throws when the ciphertext is modified', () => {
      const svc = new CryptoService();
      const [version, iv, tag, ciphertextB64] = svc
        .encrypt('authentic')
        .split(':');

      const bytes = Buffer.from(ciphertextB64, 'base64');
      bytes[0] ^= 0xff;
      const tampered = [version, iv, tag, bytes.toString('base64')].join(':');

      expect(() => svc.decrypt(tampered)).toThrow(CryptoDecryptionError);
    });

    it('throws when the auth tag is modified', () => {
      const svc = new CryptoService();
      const [version, iv, tagB64, ciphertext] = svc
        .encrypt('authentic')
        .split(':');

      const bytes = Buffer.from(tagB64, 'base64');
      bytes[0] ^= 0xff;
      const tampered = [version, iv, bytes.toString('base64'), ciphertext].join(
        ':',
      );

      expect(() => svc.decrypt(tampered)).toThrow(CryptoDecryptionError);
    });

    it('throws when the IV is modified', () => {
      const svc = new CryptoService();
      const [version, ivB64, tag, ciphertext] = svc
        .encrypt('authentic')
        .split(':');

      const bytes = Buffer.from(ivB64, 'base64');
      bytes[0] ^= 0xff;
      const tampered = [version, bytes.toString('base64'), tag, ciphertext].join(
        ':',
      );

      expect(() => svc.decrypt(tampered)).toThrow(CryptoDecryptionError);
    });
  });

  describe('wrong key', () => {
    it('cannot decrypt a blob produced with a different key', () => {
      const blob = serviceWithKey(KEY_A).encrypt('cross-key');

      expect(() => serviceWithKey(KEY_B).decrypt(blob)).toThrow(
        CryptoDecryptionError,
      );
    });
  });

  describe('malformed blobs', () => {
    it.each([
      ['not-a-blob'],
      ['v1:only:three'],
      ['v1:a:b:c:d:e'],
      ['v2:aaaa:bbbb:cccc'],
      ['v1:!!!!:@@@@:####'],
      ['v1:::'],
      [''],
    ])('throws CryptoDecryptionError for %p', (blob) => {
      const svc = new CryptoService();
      expect(() => svc.decrypt(blob)).toThrow(CryptoDecryptionError);
    });

    it('throws when the IV segment decodes to the wrong length', () => {
      const svc = new CryptoService();
      const [, , tag, ciphertext] = svc.encrypt('x').split(':');
      const shortIv = Buffer.alloc(4).toString('base64');

      expect(() =>
        svc.decrypt(['v1', shortIv, tag, ciphertext].join(':')),
      ).toThrow(CryptoDecryptionError);
    });
  });

  describe('key validation', () => {
    it('throws CryptoConfigError when the key is missing', () => {
      const svc = serviceWithKey(undefined);
      expect(() => svc.encrypt('x')).toThrow(CryptoConfigError);
    });

    it('throws CryptoConfigError when the key is an empty / blank string', () => {
      expect(() => serviceWithKey('').encrypt('x')).toThrow(CryptoConfigError);
      expect(() => serviceWithKey('   ').encrypt('x')).toThrow(
        CryptoConfigError,
      );
    });

    it('throws CryptoConfigError when the key is not valid Base64', () => {
      expect(() => serviceWithKey('not valid base64 !!!').encrypt('x')).toThrow(
        CryptoConfigError,
      );
    });

    it('throws CryptoConfigError when the key is not exactly 32 bytes', () => {
      const tooShort = randomBytes(16).toString('base64');
      const tooLong = randomBytes(48).toString('base64');

      expect(() => serviceWithKey(tooShort).encrypt('x')).toThrow(
        CryptoConfigError,
      );
      expect(() => serviceWithKey(tooLong).encrypt('x')).toThrow(
        CryptoConfigError,
      );
    });

    it('reads the key from APP_ENCRYPTION_KEY on first use', () => {
      const svc = serviceWithKey(KEY_A);
      expect(svc.decrypt(svc.encrypt('from-env'))).toBe('from-env');
    });
  });
});
