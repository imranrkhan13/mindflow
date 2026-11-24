import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { DEFAULT_BACKEND_ORIGIN, normalizeBackendOrigin } from './src/lib/apiConfig.js'

// Per-request backend switch for local gateways: the browser sends
// x-backend-override when the page URL carries ?api=origin, and this proxy
// honours that header per request. Everything else goes to the default backend.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      {
        name: 'backend-gateway-proxy',
        configureServer(server) {
          server.middlewares.use('/api', async (req, res) => {
            const override = req.headers['x-backend-override']
            const origin = String(override || env.API_PROXY_TARGET || env.VITE_API_URL || DEFAULT_BACKEND_ORIGIN).trim()
            const url = `${origin.replace(/\/+$/, '')}${req.originalUrl}`
            try {
              const response = await fetch(url, {
                method: req.method,
                headers: { ...(req.headers['content-type'] ? { 'content-type': req.headers['content-type'] } : {}), accept: req.headers.accept || '*/*' },
                body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
                duplex: 'half',
              })
              res.statusCode = response.status
              for (const name of ['content-type', 'content-disposition', 'cache-control', 'x-accel-buffering']) {
                const value = response.headers.get(name)
                if (value) res.setHeader(name, value)
              }
              if (response.body) {
                const reader = response.body.getReader()
                const push = async () => {
                  for (;;) {
                    const { done, value } = await reader.read()
                    if (done) break
                    if (!res.write(value)) await new Promise((resolve) => res.once('drain', resolve))
                  }
                  res.end()
                }
                push()
              } else {
                res.end()
              }
            } catch (error) {
              res.statusCode = 502
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify({ detail: `Backend ${origin} unreachable: ${error.message}` }))
            }
          })
        },
      },
    ],
    build: {
      // Keep the heavy graph/motion libraries in cacheable vendor chunks so the
      // landing page does not pay to re-parse them on every deploy.
      modulePreload: {
        // React Flow is only needed once an answer map appears. Do not let the
        // preload scanner download it on the landing page.
        resolveDependencies: (_filename, deps) =>
          deps.filter((dep) => !dep.includes("/flow-")),
      },
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            flow: ['reactflow'],
            motion: ['framer-motion'],
            icons: ['lucide-react'],
          },
        },
      },
    },
  }
})
