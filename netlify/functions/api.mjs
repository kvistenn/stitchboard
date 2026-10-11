import { getStore } from '@netlify/blobs'
import { createHandler } from './lib/handler.mjs'

export default async function api(req) {
  const blobs = getStore({ name: 'projects', consistency: 'strong' })
  const handle = createHandler({
    env: process.env,
    store: {
      get: (key) => blobs.get(key, { type: 'json' }),
      set: (key, value) => blobs.setJSON(key, value),
      delete: (key) => blobs.delete(key),
      list: async () => (await blobs.list()).blobs.map((b) => b.key),
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
