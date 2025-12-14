import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:5050',
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('proxyRes', (proxyRes, req, res) => {
            // Force no-cache for all API responses
            proxyRes.headers['cache-control'] = 'no-store, no-cache, must-revalidate';
            proxyRes.headers['pragma'] = 'no-cache';
            proxyRes.headers['expires'] = '0';
          });
        },
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Performance optimizations
  build: {
    // Enable minification (use esbuild for faster builds, terser is optional)
    minify: 'esbuild', // Changed from terser to esbuild (faster, built-in)
    // Note: If you need terser-specific options, install terser and use 'terser' minifier
    // Chunk size optimization
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select'],
          'chart-vendor': ['recharts'],
          'query-vendor': ['@tanstack/react-query'],
        },
      },
    },
    // Source maps for production debugging (optional, increases build time)
    sourcemap: false,
    // Improve build performance
    target: 'esnext',
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
    ],
  },
});
