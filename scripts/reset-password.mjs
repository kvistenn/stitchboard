// Brug: node scripts/reset-password.mjs <brugernavn> <ny-adgangskode>
// Udskriver en netlify-kommando der overskriver brugeren med en ny adgangskode.
import { isValidUsername, isValidPassword, userKey, hashPassword } from '../netlify/functions/lib/password.mjs'

const [username, password] = process.argv.slice(2)
if (!isValidUsername(username) || !isValidPassword(password)) {
  console.error('Brug: node scripts/reset-password.mjs <brugernavn> <ny-adgangskode (8–200 tegn)>')
  process.exit(1)
}

const record = { username, ...(await hashPassword(password)), createdAt: Date.now() }
// JSON'en indeholder kun hex og brugernavnets tilladte tegn, så enkelt-citater er sikre
console.log(`npx netlify-cli blobs:set users ${userKey(username)} '${JSON.stringify(record)}'`)
