import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)
const KEY_LEN = 64

const USERNAME_RE = /^[A-Za-z0-9_-]{3,32}$/

export const isValidUsername = (u) => typeof u === 'string' && USERNAME_RE.test(u)
// øvre grænse, så ingen kan få scrypt til at tygge på megabyte-store koder
export const isValidPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 200
export const userKey = (u) => u.toLowerCase()

export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = (await scryptAsync(password, salt, KEY_LEN)).toString('hex')
  return { salt, hash }
}

export async function verifyPassword(password, stored) {
  const { hash } = await hashPassword(password, stored.salt)
  const got = Buffer.from(hash, 'hex')
  const expected = Buffer.from(stored.hash, 'hex')
  return got.length === expected.length && timingSafeEqual(got, expected)
}
