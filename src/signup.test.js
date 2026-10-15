import { describe, it, expect } from 'vitest'
import { validateSignup } from './signup'

const ok = { username: 'Anna', password: 'hæklenål1', repeat: 'hæklenål1', inviteCode: 'kode' }

describe('validateSignup', () => {
  it('godtager gyldige felter', () => {
    expect(validateSignup(ok)).toBeNull()
  })
  it('melder ugyldigt brugernavn', () => {
    for (const username of ['ab', 'a.b', 'æble', 'x'.repeat(33)]) {
      expect(validateSignup({ ...ok, username })).toMatch(/Brugernavn/)
    }
  })
  it('melder for kort eller for lang adgangskode', () => {
    expect(validateSignup({ ...ok, password: 'kort', repeat: 'kort' })).toMatch(/8/)
    const long = 'x'.repeat(201)
    expect(validateSignup({ ...ok, password: long, repeat: long })).toMatch(/200/)
  })
  it('melder forskellige adgangskoder', () => {
    expect(validateSignup({ ...ok, repeat: 'noget-andet' })).toMatch(/ens/)
  })
  it('melder manglende invitationskode', () => {
    expect(validateSignup({ ...ok, inviteCode: '' })).toMatch(/invitationskode/)
  })
})
