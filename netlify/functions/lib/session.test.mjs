import { describe, it, expect } from 'vitest'
import {
  COOKIE_NAME,
  safeEqual,
  signSession,
  verifySession,
  readCookie,
  sessionCookie,
  clearedCookie,
} from './session.mjs'

describe('safeEqual', () => {
  it('godtager ens strenge', () => {
    expect(safeEqual('hemmelig', 'hemmelig')).toBe(true)
  })
  it('afviser forskellige, også med anden længde', () => {
    expect(safeEqual('hemmelig', 'hemmeli')).toBe(false)
    expect(safeEqual('hemmelig', 'hemmeligX')).toBe(false)
  })
  it('afviser tom eller manglende værdi', () => {
    expect(safeEqual('hemmelig', '')).toBe(false)
    expect(safeEqual('hemmelig', undefined)).toBe(false)
    expect(safeEqual('hemmelig', 123)).toBe(false)
  })
})

describe('session', () => {
  const secret = 's3cret'
  it('giver brugeren tilbage før udløb', () => {
    expect(verifySession(secret, signSession(secret, 'jens', 2000), 1000)).toBe('jens')
  })
  it('afviser udløbet session', () => {
    expect(verifySession(secret, signSession(secret, 'jens', 2000), 2000)).toBeNull()
  })
  it('afviser anden hemmelighed', () => {
    expect(verifySession('andet', signSession(secret, 'jens', 2000), 1000)).toBeNull()
  })
  it('afviser manipuleret bruger eller udløb', () => {
    const sig = signSession(secret, 'jens', 2000).split('.')[2]
    expect(verifySession(secret, `anna.2000.${sig}`, 1000)).toBeNull()
    expect(verifySession(secret, `jens.999999.${sig}`, 1000)).toBeNull()
  })
  it('afviser cookien fra før brugerkonti', () => {
    // gammelt format: <udløb>.<hmac af udløb>
    expect(verifySession(secret, signSession(secret, 'jens', 2000).split('.').slice(1).join('.'), 1000)).toBeNull()
  })
  it('afviser skrald', () => {
    for (const v of [undefined, '', 'abc', '.', '..', 'jens.2000.', 'jens..ab', '.2000.ab', 'jens.x.ab', 'jens.-5.ab', 'a.b.2000.ab']) {
      expect(verifySession(secret, v, 1000)).toBeNull()
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
