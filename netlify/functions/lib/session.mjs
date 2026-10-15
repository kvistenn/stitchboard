import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const COOKIE_NAME = 'sb_session'
export const SESSION_MAX_AGE_S = 365 * 24 * 60 * 60

const hmac = (secret, data) => createHmac('sha256', secret).update(data).digest('hex')
const digest = (s) => createHash('sha256').update(s).digest()

// Sammenligner hashes så tidsforbruget ikke afslører længde eller indhold
export function safeEqual(expected, given) {
  if (typeof given !== 'string' || given === '') return false
  return timingSafeEqual(digest(expected), digest(given))
}

// brugernavne kan ikke indeholde punktum, så formatet er entydigt
export function signSession(secret, user, expiresAt) {
  const data = `${user}.${expiresAt}`
  return `${data}.${hmac(secret, data)}`
}

// giver brugernøglen ved gyldig session, ellers null
export function verifySession(secret, value, now) {
  if (typeof value !== 'string') return null
  const parts = value.split('.')
  if (parts.length !== 3) return null
  const [user, exp, sig] = parts
  if (!user || !/^\d+$/.test(exp) || Number(exp) <= now) return null
  const expected = Buffer.from(hmac(secret, `${user}.${exp}`))
  const got = Buffer.from(sig)
  return got.length === expected.length && timingSafeEqual(got, expected) ? user : null
}

export function readCookie(header, name) {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return undefined
}

const FLAGS = 'HttpOnly; Secure; SameSite=Strict; Path=/'

export const sessionCookie = (value) => `${COOKIE_NAME}=${value}; ${FLAGS}; Max-Age=${SESSION_MAX_AGE_S}`
export const clearedCookie = () => `${COOKIE_NAME}=; ${FLAGS}; Max-Age=0`
