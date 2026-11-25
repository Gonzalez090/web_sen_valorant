/// <reference types="node" />
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('vercel.json Content-Security-Policy', () => {
  const vercel = JSON.parse(read('vercel.json')) as { headers: { headers: { key: string; value: string }[] }[] }
  const csp = vercel.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')?.value ?? ''

  it('allows every inline script in index.html by hash', () => {
    const html = read('index.html').replace(/\r\n/g, '\n')
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
    expect(inline.length).toBeGreaterThan(0)
    for (const body of inline) {
      const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`
      expect(csp, 'index.html inline script changed: update its hash in vercel.json').toContain(hash)
    }
  })

  it('never allows arbitrary inline or eval scripts', () => {
    const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src')) ?? ''
    expect(scriptSrc).not.toMatch(/'unsafe-inline'|'unsafe-eval'/)
    expect(csp).toContain("frame-ancestors 'none'")
  })
})
