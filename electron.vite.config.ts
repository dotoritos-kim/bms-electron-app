import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import type { Plugin } from 'vite';

// When source aliases point to sibling packages (../bms-editor/src/*, etc.),
// Vite resolves their imports from that directory's node_modules which may not
// exist. This plugin falls back to our own node_modules.
function resolveFromRoot(): Plugin {
  const rootNodeModules = resolve(__dirname, 'node_modules');
  return {
    name: 'resolve-from-root',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !source.startsWith('.') && !source.startsWith('/') && !source.startsWith('\0')) {
        // Bare specifier from an external source file — try resolving from root
        if (importer && !importer.includes('node_modules')) {
          const resolved = await this.resolve(source, resolve(rootNodeModules, '_virtual.js'), {
            ...options,
            skipSelf: true,
          });
          if (resolved) return resolved;
        }
      }
      return null;
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      lib: {
        entry: resolve(__dirname, 'src/main/index.ts'),
        formats: ['cjs'],
        fileName: () => 'index.js',
      },
      rollupOptions: {
        output: {
          format: 'cjs',
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    plugins: [tailwindcss(), resolveFromRoot()],
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'three', '@react-three/fiber', 'zustand', 'lucide-react'],
      alias: {
        // Dev: resolve file: deps to source so HMR picks up changes without rebuild
        '@rhythm-archive/bms-core': resolve(__dirname, '../bms-core/src/index.ts'),
        '@rhythm-archive/bms-player': resolve(__dirname, '../bms-player/src/index.ts'),
        '@rhythm-archive/bms-editor': resolve(__dirname, '../bms-editor/src/index.ts'),
      },
    },
    optimizeDeps: {
      // Prevent Vite from pre-bundling file: deps (stale cache issue)
      exclude: ['@rhythm-archive/bms-core', '@rhythm-archive/bms-player', '@rhythm-archive/bms-editor'],
      // Force pre-bundling CJS packages so they're served as ESM.
      // Needed because the excluded @rhythm-archive/* aliases bypass Vite's
      // automatic dep discovery, leaving their transitive CJS deps un-bundled.
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'scheduler',
        'three',
        'zustand',
        'zustand/traditional',
        'suspend-react',
        '@react-three/fiber',
        '@react-three/drei',
        'lucide-react',
        'lodash',
        'use-sync-external-store/shim/with-selector.js',
      ],
    },
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
  },
});
