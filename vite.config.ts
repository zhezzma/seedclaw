import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from '@tailwindcss/vite'
import path, { resolve } from 'node:path'

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    vue(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './'),
      '@': path.resolve(__dirname, './src')
    },
  },
  // monaco-editor 是重依赖（解压后 ~30MB），esbuild 预打包会在内存受限环境
  // 扊出峰值。exclude 后 vite 直接服务 ESM 原件，按需加载，首次加载稍慢但不会 OOM。
  // workers 是动态 import，必须交给 vite 处理（?worker 语法需要 vite 打包）。
  optimizeDeps: {
    exclude: ['monaco-editor'],
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 18081,
    strictPort: true,
    host: host || false,
    allowedHosts: [
      'testclaw.godgodgame.com'
    ],
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 18082,
      }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
