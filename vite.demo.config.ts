import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 演示应用构建配置
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  // 基础路径（如果部署到子目录需要修改）
  base: '/',

  // 构建配置 - 应用模式（非库模式）
  build: {
    outDir: 'dist-demo',
    sourcemap: true,
  },

  // 开发服务器配置
  server: {
    host: '0.0.0.0',
    proxy: {
      // baostock 数据源 (端口 8000)
      '/api/stock': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      // 东财等 AKTools 数据源 (端口 8080)
      '/api/public': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
})
