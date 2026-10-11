import { describe, it, expect } from 'vitest'
import {
  COOKIE_NAME,
  checkPassword,
  signSession,
  verifySession,
  readCookie,
  sessionCookie,
  clearedCookie,
} from './session.mjs'

describe('checkPassword', () => {
  it('godtager korrekt kode', () => {
    expect(checkPassword('hemmelig', 'hemmelig')).toBe(true)
  })
  it('afviser forkert kode, også med anden længde', () => {
    expect(checkPassword('hemmelig', 'hemmeli')).toBe(false)
    expect(checkPassword('hemmelig', 'hemmeligX')).toBe(false)
  })
  it('afviser tom eller manglende kode', () => {
    expect(checkPassword('hemmelig', '')).toBe(false)
    expect(checkPassword('hemmelig', undefined)).toBe(false)
    expect(checkPassword('hemmelig', 123)).toBe(false)
  })
})

describe('session', () => {
  const secret = 's3cret'
  it('godtager egen signatur før udløb', () => {
    expect(verifySession(secret, signSession(secret, 2000), 1000)).toBe(true)
  })
  it('afviser udløbet session', () => {
    expect(verifySession(secret, signSession(secret, 2000), 2000)).toBe(false)
  })
  it('afviser anden hemmelighed', () => {
    expect(verifySession('andet', signSession(secret, 2000), 1000)).toBe(false)
  })
  it('afviser manipuleret udløb', () => {
    const sig = signSession(secret, 2000).split('.')[1]
    expect(verifySession(secret, `999999.${sig}`, 1000)).toBe(false)
  })
  it('afviser skrald', () => {
    for (const v of [undefined, '', 'abc', '.', '2000.', 'x.y', '2000.zz', '-5.ab']) {
      expect(verifySession(secret, v, 1000)).toBe(false)
    }
  })
})

describe('cookies', () => {
  it('læser den navngivne cookie', () => {
    expect(readCookie('a=1; sb_session=abc.def; b=2', 'sb_session')).toBe('abc.def')
  })
  it('giver undefined når den mangler', () => {
    expect(readCookie(null, 'sb_session')).toBeUndefined()
    expect(readCookie('a=1', 'sb_session')).toBeUndefined()
  })
  it('sætter sikre flag', () => {
    const c = sessionCookie('v')
    expect(c.startsWith(`${COOKIE_NAME}=v;`)).toBe(true)
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=31536000']) {
      expect(c).toContain(flag)
    }
  })
  it('rydder cookien', () => {
    expect(clearedCookie()).toContain('Max-Age=0')
  })
})
