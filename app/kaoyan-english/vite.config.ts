import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/*
 * 本地开发用「/」，部署到 GitHub Pages 时用「/kaoyan-english/」。
 * 用环境变量切换而不是写死：同一份源码两种用途，
 * 也不会出现「本地跑得好、线上资源 404」这种最常见的事故。
 */
const base = process.env.APP_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5273,
  },
  build: {
    // 产物目录可通过环境变量指定，方便直接输出到站点仓库
    outDir: process.env.APP_OUT_DIR ?? 'dist',
    emptyOutDir: true,
  },
})
