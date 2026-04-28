import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// `base` se calcula desde la variable de entorno BASE_PATH, que el workflow
// de GitHub Actions setea como `/<nombre-repo>/` (o `/` si el repo es del
// estilo `<usuario>.github.io`). En desarrollo local queda en `/`.
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH ?? '/',
})
