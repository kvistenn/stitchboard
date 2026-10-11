import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const COOKIE_NAME = 'sb_session'
export const SESSION_MAX_AGE_S = 365 * 24 * 60 * 60

const hmac = (secret, data) => createHmac('sha256', secret).update(data).digest('hex')
const digest = (s) => createHash('sha256').update(s).digest()

// Sammenligner hashes så tidsforbruget ikke afslører kodens længde eller indhold
export function checkPassword(expected, given) {
  if (typeof given !== 'string' || given === '') return false
  return timingSafeEqual(digest(expected), digest(given))
}

export function signSession(secret, expiresAt) {
  return `${expiresAt}.${hmac(secret, String(expiresAt))}`
}

export function verifySession(secret, value, now) {
  if (typeof value !== 'string') return false
  const dot = value.indexOf('.')
  if (dot < 1) return false
  const exp = value.slice(0, dot)
  if (!/^\d+$/.test(exp) || Number(exp) <= now) return false
  const expected = Buffer.from(hmac(secret, exp))
  const got = Buffer.from(value.slice(dot + 1))
  return got.length === expected.length && timingSafeEqual(got, expected)
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
