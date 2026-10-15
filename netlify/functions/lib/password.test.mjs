import { describe, it, expect } from 'vitest'
import { isValidUsername, isValidPassword, userKey, hashPassword, verifyPassword } from './password.mjs'

describe('isValidUsername', () => {
  it('godtager bogstaver, tal, _ og - på 3–32 tegn', () => {
    for (const u of ['Jens', 'abc', 'a_b-c9', 'x'.repeat(32)]) expect(isValidUsername(u)).toBe(true)
  })
  it('afviser for kort, for langt, punktum, skråstreg, mellemrum og ikke-strenge', () => {
    for (const u of ['ab', 'x'.repeat(33), 'a.b', 'a/b', 'a b', 'æøå', '', undefined, 123]) {
      expect(isValidUsername(u)).toBe(false)
    }
  })
})

describe('isValidPassword', () => {
  it('kræver 8–200 tegn', () => {
    expect(isValidPassword('12345678')).toBe(true)
    expect(isValidPassword('x'.repeat(200))).toBe(true)
    expect(isValidPassword('1234567')).toBe(false)
    expect(isValidPassword('x'.repeat(201))).toBe(false)
    expect(isValidPassword(undefined)).toBe(false)
  })
})

describe('userKey', () => {
  it('ser bort fra store/små bogstaver', () => {
    expect(userKey('JeNs')).toBe('jens')
  })
})

describe('hashPassword / verifyPassword', () => {
  it('godtager korrekt kode og afviser forkert', async () => {
    const stored = await hashPassword('strikkepind')
    expect(await verifyPassword('strikkepind', stored)).toBe(true)
    expect(await verifyPassword('strikkepinD', stored)).toBe(false)
  })
  it('bruger nyt salt hver gang', async () => {
    const a = await hashPassword('strikkepind')
    const b = await hashPassword('strikkepind')
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
    expect(a.salt).toMatch(/^[0-9a-f]{32}$/)
    expect(a.hash).toMatch(/^[0-9a-f]{128}$/)
  })
  it('afviser beskadiget gemt hash uden at kaste', async () => {
    expect(await verifyPassword('strikkepind', { salt: 'ab', hash: 'abcd' })).toBe(false)
  })
})
