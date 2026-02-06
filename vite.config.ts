import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from '@tailwindcss/vite'
import path, { resolve } from 'node:path'
import checker from 'vite-plugin-checker' // 引入插件

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    vue(),
    tailwindcss(),
    checker({
      typescript: true,   // 开启 TS 检查
      vueTsc: true,       // 如果是 vue-tsc 也可以开启
      // overlay: false,  // 如果你想关闭浏览器红色遮罩层，设为 false；默认是 true
      terminal: true   // 是否在终端显示错误，默认 true
    })],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './'),
      '@': path.resolve(__dirname, './src'),
      '~openclaw': path.resolve(__dirname, './src/openclaw'), //还要再tsconfig.json中配置
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 1421,
      }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
