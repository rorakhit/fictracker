import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Builds the library page that ships inside the extension
// (extension/build.mjs calls this). `base: './'` keeps asset URLs relative,
// because extension pages live at chrome-extension://<id>/app/.
export default defineConfig({
  root: 'src',
  base: './',
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: '../extension/dist/stage/app',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
  },
})
