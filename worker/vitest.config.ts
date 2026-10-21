import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Tests run inside the Workers runtime against a local D1. AUTH stands in for planary-auth:
// "Bearer test|<id>|<email>|<name>" is that person, anything else is signed out.
export default defineConfig(async () => {
  const migrations = await readD1Migrations('migrations');
  return {
    plugins: [
      cloudflareTest({
        main: 'src/index.ts',
        miniflare: {
          compatibilityDate: '2025-09-01',
          d1Databases: ['DB'],
          bindings: { PUBLIC_APP_URL: 'https://wishlist.test', INTERNAL_KEY: 'test-internal-key', TEST_MIGRATIONS: migrations },
          serviceBindings: {
            AUTH(req: Request) {
              const parts = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '').split('|');
              if (parts.length !== 4 || parts[0] !== 'test') {
                return new Response(JSON.stringify({ error: 'not authenticated' }), { status: 401 });
              }
              return Response.json({ user: { id: parts[1], email: parts[2], name: parts[3] } });
            },
          },
        },
      }),
    ],
    test: { setupFiles: ['test/setup.ts'] },
  };
});
