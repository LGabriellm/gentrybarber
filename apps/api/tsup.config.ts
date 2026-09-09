import { defineConfig } from 'tsup';
export default defineConfig({ entry: ['src/main.ts'], format: ['esm'], target: 'node24', noExternal: [/^@platform\//], banner: { js: "import { createRequire as __platformCreateRequire } from 'node:module'; const require = __platformCreateRequire(import.meta.url);" }, sourcemap: true, clean: true });
