import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import fs from 'node:fs'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const isProd = mode === 'production'
  const target = env.VITE_APP_BASE_URL || 'http://127.0.0.1:8080'

  // 仅开发服务用：安全入口路径（后端规则 /[a-zA-Z0-9]{8,18}）也代理到 Go，
  // 这样 Go 写下的 session cookie 落在 Vite 的同一个 origin，后续 /api 才会带上。
  // 不需要事先知道具体路径。
  const secureEntryProxy = {
    '^/[a-zA-Z0-9]{8,18}$': { target, changeOrigin: true },
  }

  return {
    base: isProd ? '/secure/' : './',
    server: {
      open: false,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
        },
        ...secureEntryProxy,
      },
      allowedHosts: ['.localhost'],
    },
    plugins: [
      react(),
      tailwindcss(),
      // 构建产物 index.html 重命名为 secure.html（后端 app/router/static.go 只解析 secure/secure.html）
      {
        name: 'rename-index',
        closeBundle() {
          const indexPath = path.join(__dirname, 'dist/index.html')
          const securePath = path.join(__dirname, 'dist/secure.html')
          if (fs.existsSync(indexPath)) {
            fs.renameSync(indexPath, securePath)
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
    },
  }
})
