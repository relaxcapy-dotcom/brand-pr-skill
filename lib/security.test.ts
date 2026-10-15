import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertSameOrigin, configuredAppOrigin, HttpError, readJson } from './http'

afterEach(() => vi.unstubAllEnvs())

describe('API request boundaries', () => {
  it('rejects cross-origin and missing-origin mutations', () => {
    vi.stubEnv('APP_URL', 'https://brand.example.com')
    expect(() => assertSameOrigin(new Request('https://brand.example.com/api/chat', {
      method: 'POST', headers: { Origin: 'https://attacker.example.com' }
    }))).toThrow(HttpError)
    expect(() => assertSameOrigin(new Request('https://brand.example.com/api/chat', {
      method: 'POST'
    }))).toThrow(HttpError)
    expect(() => assertSameOrigin(new Request('https://brand.example.com/api/chat', {
      method: 'POST', headers: { Origin: 'https://brand.example.com' }
    }))).not.toThrow()
  })

  it('rejects oversized or non-JSON request bodies before parsing', async () => {
    await expect(readJson(new Request('https://brand.example.com/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}'
    }))).rejects.toMatchObject({ status: 415 })
    await expect(readJson(new Request('https://brand.example.com/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'x'.repeat(200) })
    }), 100)).rejects.toMatchObject({ status: 413 })
  })

  it('uses only a configured HTTPS or local development origin', () => {
    vi.stubEnv('APP_URL', 'http://brand.example.com')
    expect(() => configuredAppOrigin()).toThrow(HttpError)
    vi.stubEnv('APP_URL', 'https://attacker.example.com@brand.example.com')
    expect(() => configuredAppOrigin()).toThrow(HttpError)
    vi.stubEnv('APP_URL', 'http://localhost:3000/dashboard')
    expect(configuredAppOrigin()).toBe('http://localhost:3000')
  })
})
