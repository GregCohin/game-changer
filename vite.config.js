import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Deuxième entrée : l'app parent (src/parent/) doit rester un bundle totalement séparé
      // des 35000 lignes de src/App.jsx (ffmpeg, IndexedDB matchs...) — un parent qui ouvre le
      // portail sur son téléphone en bord de terrain ne doit jamais télécharger le poids de
      // l'interface staff.
      input: {
        main: 'index.html',
        parent: 'parent.html',
      },
    },
  },
})
