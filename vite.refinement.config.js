import { defineConfig, mergeConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import normal from './vite.config.js'

const target = fileURLToPath(new URL('./src/backend/supabase/supabaseAuth.js', import.meta.url))
const fixture = fileURLToPath(new URL('./e2e/fixtures/fakeSupabaseAuth.js', import.meta.url))
export default mergeConfig(normal, defineConfig({
  resolve: { alias: { [target]: fixture } },
  plugins: [{ name: 'refinement-fixture-auth', enforce: 'pre', resolveId(source, importer) {
    // The existing adapter import omits .js; compare its resolved absolute path.
    if (importer && source.startsWith('.')) {
      const path = fileURLToPath(new URL(source, `file://${importer}`))
      if (path === target || `${path}.js` === target) return fixture
    }
  } }],
}))
