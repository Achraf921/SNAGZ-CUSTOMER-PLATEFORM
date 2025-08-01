import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const isDevelopment = mode === 'development';
  const isProduction = mode === 'production';
  const isAnalyze = mode === 'analyze';

  return {
  plugins: [
    react({
      // Enable Fast Refresh for development
      fastRefresh: isDevelopment,
      // Optimize JSX for production
      jsxRuntime: 'automatic',
    }),
    // Add progress plugin for debugging build hangs
    ...(isProduction ? [{
      name: 'build-progress',
      buildStart() {
        console.log('🚀 Build started...');
      },
      generateBundle(options, bundle) {
        console.log('📦 Generating bundle with', Object.keys(bundle).length, 'files');
      },
      writeBundle() {
        console.log('✅ Bundle written successfully');
      }
    }] : [])
  ],
  define: {
    'process.env.NODE_ENV': JSON.stringify('development'),
    'process.env.REACT_APP_RECAPTCHA_SITE_KEY': JSON.stringify('6LcDoJMrAAAAAA-mQl-L1TYgUXYM5LYz1Y4oJO4u'),
    'process.env.REACT_APP_SUPPORT_EMAIL': JSON.stringify('achraf.bayi@sna-gz.com'),
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'build',
    // Increase chunk size warning limit to handle large vendors
    chunkSizeWarningLimit: 1000,
    // Enable source maps for production debugging (optional)
    sourcemap: false,
    // Performance optimizations to prevent hanging
    target: 'esnext',
    reportCompressedSize: false,
    // Disable all minification to prevent hoisting issues
    minify: false,
    // Prevent hanging on asset processing
    assetsInlineLimit: 0,
    // Reduce memory pressure
    emptyOutDir: true,
    // Optimize for faster builds
    cssCodeSplit: true,
            rollupOptions: {
          // Optimize for faster builds
          maxParallelFileOps: 2,
          output: {
                      // Simplified chunk splitting to prevent dependency issues
          manualChunks: {
            // React core
            'react-vendor': ['react', 'react-dom'],
            // All node_modules in one vendor chunk to avoid circular deps
            'vendor': ['react-google-recaptcha'],
          },
        
        // Optimize chunk names for better caching
        chunkFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId ? chunkInfo.facadeModuleId.split('/').pop().replace('.jsx', '').replace('.js', '') : 'chunk';
          return `js/${facadeModuleId}-[hash].js`;
        },
        
        // Optimize asset names
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          if (/\.(css)$/.test(assetInfo.name)) {
            return `css/[name]-[hash].${ext}`;
          }
          if (/\.(png|jpe?g|svg|gif|tiff|bmp|ico)$/i.test(assetInfo.name)) {
            return `images/[name]-[hash].${ext}`;
          }
          return `assets/[name]-[hash].${ext}`;
        },
        
        // Entry point name
        entryFileNames: 'js/[name]-[hash].js',
      },
    },
    

  },
  
  // Minimal dependency optimization to prevent issues
  optimizeDeps: {
    include: [],
    exclude: [],
    force: false,
  },
  
  // Performance optimizations
  esbuild: {
    // Minimal safe optimizations only
    treeShaking: false,
    keepNames: true,
    minifyIdentifiers: false,
    minifySyntax: false,
    minifyWhitespace: false,
  },
};
}); 