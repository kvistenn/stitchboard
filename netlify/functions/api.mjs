import { getStore } from '@netlify/blobs'
import { createHandler } from './lib/handler.mjs'

export default async function api(req) {
  const userBlobs = getStore({ name: 'users', consistency: 'strong' })
  const projectBlobs = getStore({ name: 'projects', consistency: 'strong' })
  const handle = createHandler({
    env: process.env,
    users: {
      get: (key) => userBlobs.get(key, { type: 'json' }),
      // onlyIfNew: to samtidige tilmeldinger med samme navn kan ikke overskrive hinanden
      create: async (key, value) => (await userBlobs.setJSON(key, value, { onlyIfNew: true })).modified,
    },
    projects: {
      get: (key) => projectBlobs.get(key, { type: 'json' }),
      set: (key, value) => projectBlobs.setJSON(key, value),
      delete: (key) => projectBlobs.delete(key),
      list: async (prefix) => (await projectBlobs.list({ prefix })).blobs.map((b) => b.key),
    },
  })
  try {
    return await handle(req)
  } catch (e) {
    console.error('Stitchboard API-fejl', e)
    return new Response(null, { status: 500 })
  }
}

export const config = { path: '/api/*' }
