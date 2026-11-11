import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Dev-only: serve the Vercel functions in /api through the Vite dev server, so
 * `npm run dev` exercises the real claim endpoint without `vercel dev`.
 * Production is unaffected (Vercel runs /api itself).
 */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const name = req.url?.match(/^\/api\/([\w-]+)(?:\?|$)/)?.[1]
        if (!name) return next()
        let handler: (req: unknown, res: unknown) => unknown
        try { handler = (await server.ssrLoadModule(`/api/${name}.ts`)).default } catch { return next() }

        const decoder = new TextDecoder()
        let raw = ''
        for await (const chunk of req) raw += decoder.decode(chunk as Uint8Array, { stream: true })
        raw += decoder.decode()
        let body: unknown = raw
        try { body = raw ? JSON.parse(raw) : {} } catch { /* leave as text */ }

        const vres = Object.assign(res, {
          status(code: number) { res.statusCode = code; return vres },
          json(obj: unknown) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return vres },
          send(data: unknown) { res.end(typeof data === 'string' ? data : JSON.stringify(data)); return vres },
        })
        try {
          await handler(Object.assign(req, { body }), vres)
        } catch (err) {
          server.config.logger.error(`[dev-api] /api/${name}: ${String(err)}`)
          if (!res.headersSent) { res.statusCode = 500; res.end(JSON.stringify({ error: 'Server error' })) }
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Make server-side env (SUPABASE_SERVICE_KEY etc.) visible to the dev API handlers
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return { plugins: [react(), devApi()] }
})
