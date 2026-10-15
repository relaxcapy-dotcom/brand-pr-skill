import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'

const VERSION = 'v1'

function encryptionKey(): Buffer {
  const encoded = process.env.CONNECTOR_ENCRYPTION_KEY
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
    throw new Error('CONNECTOR_ENCRYPTION_KEY must be 32 random bytes encoded as base64')
  }
  const key = Buffer.from(encoded, 'base64')
  if (key.length !== 32) throw new Error('CONNECTOR_ENCRYPTION_KEY must be 32 random bytes')
  return key
}

/** Encrypt a credential with tenant/provider-bound authenticated encryption. */
export function encryptSecret(plaintext: string, context: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  cipher.setAAD(Buffer.from(context, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.')
}

export function decryptSecret(value: string, context: string): string {
  const [version, encodedIv, encodedTag, encodedCiphertext, extra] = value.split('.')
  if (version !== VERSION || !encodedIv || !encodedTag || !encodedCiphertext || extra) {
    throw new Error('Invalid encrypted credential')
  }
  const iv = Buffer.from(encodedIv, 'base64url')
  const tag = Buffer.from(encodedTag, 'base64url')
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid encrypted credential')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv)
  decipher.setAAD(Buffer.from(context, 'utf8'))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(Buffer.from(encodedCiphertext, 'base64url')), decipher.final()]).toString('utf8')
}

export function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8')
  const b = Buffer.from(right, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}
