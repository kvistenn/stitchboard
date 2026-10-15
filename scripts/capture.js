// Midlertidigt testscript: efterligner /api i browseren og tager skærmbilleder af alle hovedskærme.
// Præfikset til filnavnene læses fra page.__prefix (sæt det før kørsel).
async (page) => {
  const prefix = page.__prefix || 'shot'
  const dir = '/Users/jens/Downloads/stitchboard/.playwright-mcp/'
  page.__rb = page.__rb || { store: new Map(), loggedIn: true }
  const S = page.__rb
  await page.context().unrouteAll({ behavior: 'ignoreErrors' })
  await page.context().route('**/api/**', async (route) => {
    const req = route.request()
    const p = req.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0]
    const m = req.method()
    if (p === '/api/me') return S.loggedIn ? route.fulfill({ json: { username: 'test' } }) : route.fulfill({ status: 401, body: '' })
    if (p === '/api/login' || p === '/api/register') { S.loggedIn = true; return route.fulfill({ status: 204, body: '' }) }
    if (p === '/api/logout') { S.loggedIn = false; return route.fulfill({ status: 204, body: '' }) }
    if (p === '/api/projects') return route.fulfill({ json: [...S.store.keys()] })
    const id = decodeURIComponent(p.split('/').pop())
    if (m === 'PUT') { S.store.set(id, JSON.parse(req.postData())); return route.fulfill({ status: 204, body: '' }) }
    if (m === 'DELETE') { S.store.delete(id); return route.fulfill({ status: 204, body: '' }) }
    return route.fulfill({ json: S.store.get(id) })
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  const shot = (n) => page.screenshot({ path: `${dir}${prefix}-${n}.png` })

  S.loggedIn = false
  await page.goto('http://localhost:5173/')
  await page.waitForTimeout(1200)
  await shot('login')

  S.loggedIn = true
  await page.reload()
  await page.waitForTimeout(1200)
  if (S.store.size === 0) {
    await page.locator('.create-card .input').first().fill('Hjerte-sok')
    await page.locator('.create-card .btn.primary').first().click()
    await page.waitForTimeout(1200)
    await page.locator('.topbar .icon-btn').first().click()
    await page.waitForTimeout(1200)
  }
  await shot('home')

  await page.locator('.project-thumb').first().click()
  await page.waitForTimeout(1200)
  await shot('template')
  await page.locator('.mode-tab', { hasText: 'Mønster' }).click()
  await page.waitForTimeout(800)
  // mal et par felter så der er farve på lærredet
  const box = await page.locator('canvas').first().boundingBox()
  if (box) {
    await page.mouse.move(box.x + 60, box.y + 60)
    await page.mouse.down()
    await page.mouse.move(box.x + 300, box.y + 120, { steps: 12 })
    await page.mouse.up()
  }
  await page.waitForTimeout(500)
  await shot('pattern')
  await page.locator('.mode-tab', { hasText: 'Strik' }).click()
  await page.waitForTimeout(800)
  await shot('knit')
  return `ok: ${prefix}`
}
