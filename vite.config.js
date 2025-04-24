/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
    plugins: []
  },
  test: {
    globals: true,
    environment: 'jsdom',
    // setupFiles: './src/setupTests.js', // Optional: if you need setup files
    // Include both test/ and src/ directories
    include: ['test/**/*.{test,spec}.{js,jsx}', 'src/**/*.{test,spec}.{js,jsx}'], 
  },
});
