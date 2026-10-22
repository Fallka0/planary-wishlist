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
            // Stands in for planary-org: a user id "team.<org>.<org>.<uuid>" is on those teams.
            // org_tournament doesn't use Wishlist; org_small has room for one wishlist.
            ORG(req: Request) {
              const m = /^\/internal\/people\/([^/]+)\/orgs$/.exec(new URL(req.url).pathname);
              if (!m || req.headers.get('x-internal-key') !== 'test-internal-key') return new Response('{}', { status: 404 });
              const id = decodeURIComponent(m[1]);
              const ids = id.startsWith('team.') ? id.split('.').slice(1, -1) : [];
              return Response.json({
                orgs: ids.map((o) => ({
                  id: o,
                  name: `Club ${o}`,
                  role: 'member',
                  plan: 'gratis',
                  services: o === 'org_tournament' ? ['tournament'] : ['tournament', 'wishlist'],
                  wishlist: { maxLists: o === 'org_small' ? 1 : null },
                })),
              });
            },
          },
        },
      }),
    ],
    test: { setupFiles: ['test/setup.ts'] },
  };
});
