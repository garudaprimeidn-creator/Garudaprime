import { defineConfig, loadEnv } from 'vite'
import fs from 'node:fs'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const DEFAULT_APP_ORIGIN = 'https://app.garudaprime.id'

function readAssetVersion(): string {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, 'public/app-version.json'), 'utf8')
    const parsed = JSON.parse(raw) as { version?: string }
    return parsed.version || String(Date.now())
  } catch {
    return String(Date.now())
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const appOrigin = (env.VITE_APP_ORIGIN || DEFAULT_APP_ORIGIN).replace(/\/+$/, '')
  const assetVersion = readAssetVersion()

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'garuda-html-meta',
        transformIndexHtml(html: string) {
          return html
            .replace(/%VITE_APP_ORIGIN%/g, appOrigin)
            .replace(/%GP_ASSET_VERSION%/g, assetVersion)
            .replace(
              /<title>Garuda Prime Fintech App<\/title>/,
              '<title>Garuda Prime</title>',
            )
        },
      },
    ],
    define: {
      global: 'globalThis',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        buffer: 'buffer/',
      },
    },
    assetsInclude: ['**/*.svg', '**/*.csv'],

    optimizeDeps: {
      include: ['buffer'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('@walletconnect') || id.includes('@reown')) return 'walletconnect';
            if (id.includes('firebase')) return 'firebase';
            if (id.includes('recharts') || id.includes('d3-')) return 'charts';
            if (
              id.includes('viem')
              || id.includes('@noble')
              || id.includes('@scure')
              || id.includes('/ox/')
            ) {
              return 'viem';
            }
            if (id.includes('motion/') || id.includes('framer-motion')) return 'motion';
            if (id.includes('@mediapipe/tasks-vision')) return 'mediapipe';
            if (id.includes('lucide-react')) return 'icons';
          },
        },
      },
      chunkSizeWarningLimit: 1200,
    },
  }
})
