import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { decryptSecret, encryptSecret } from './crypto'

afterEach(() => vi.unstubAllEnvs())

describe('connector credential encryption', () => {
  it('only decrypts for the original tenant and provider', () => {
    vi.stubEnv('CONNECTOR_ENCRYPTION_KEY', randomBytes(32).toString('base64'))
    const encrypted = encryptSecret('tvly-example-secret', 'tenant-a:tavily')
    expect(encrypted).not.toContain('tvly-example-secret')
    expect(decryptSecret(encrypted, 'tenant-a:tavily')).toBe('tvly-example-secret')
    expect(() => decryptSecret(encrypted, 'tenant-b:tavily')).toThrow()
    expect(() => decryptSecret(encrypted, 'tenant-a:notion')).toThrow()
  })

  it('rejects ciphertext tampering and invalid key size', () => {
    vi.stubEnv('CONNECTOR_ENCRYPTION_KEY', randomBytes(32).toString('base64'))
    const encrypted = encryptSecret('secret', 'tenant-a:tavily')
    const parts = encrypted.split('.')
    parts[3] = Buffer.from('tampered').toString('base64url')
    expect(() => decryptSecret(parts.join('.'), 'tenant-a:tavily')).toThrow()
    vi.stubEnv('CONNECTOR_ENCRYPTION_KEY', randomBytes(16).toString('base64'))
    expect(() => encryptSecret('secret', 'tenant-a:tavily')).toThrow()
  })
})
