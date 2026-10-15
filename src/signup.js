// Samme regler som serveren (netlify/functions/lib/password.mjs), så brugeren
// får en forståelig besked før der sendes noget
const USERNAME_RE = /^[A-Za-z0-9_-]{3,32}$/

export function validateSignup({ username, password, repeat, inviteCode }) {
  if (!USERNAME_RE.test(username)) return 'Brugernavn skal være 3–32 tegn: bogstaver a–z, tal, _ eller -'
  if (password.length < 8) return 'Adgangskoden skal være mindst 8 tegn'
  if (password.length > 200) return 'Adgangskoden må højst være 200 tegn'
  if (password !== repeat) return 'De to adgangskoder er ikke ens'
  if (!inviteCode) return 'Skriv den invitationskode du har fået'
  return null
}
