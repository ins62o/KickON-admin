import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePublicAuthConfig } from '../public-auth-config.ts';

test('only selected public auth settings reach the client', () => {
  const result = resolvePublicAuthConfig({ KICKON_ENVIRONMENT: 'production', NEXT_PUBLIC_KICKON_PRODUCTION_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_KICKON_PRODUCTION_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example', SUPABASE_METRICS_SECRET_KEY: 'private', FOOTBALL_SYNC_SECRET: 'private', SUPABASE_MANAGEMENT_ACCESS_TOKEN:'private-management-token' }, 'production');
  assert.deepEqual(result, { environment: 'production', url: 'https://example.supabase.co', publishableKey: 'sb_publishable_example' });
});
test('secret keys and insecure remote addresses are rejected', () => {
  assert.throws(() => resolvePublicAuthConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_never_publish' }, 'production'));
  assert.throws(() => resolvePublicAuthConfig({ VITE_SUPABASE_URL: 'http://example.com', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example' }, 'production'));
});
test('design previews never connect to real authentication', () => {
  assert.equal(resolvePublicAuthConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example' }, 'design-preview'), null);
});
test('deployed private API URLs expose only HTTPS endpoints without embedded credentials',async()=>{
 const {resolveAdminSettings}=await import('../public-auth-config.ts');
 assert.equal(resolveAdminSettings({VITE_ADMIN_API_BASE_URL:'https://example.supabase.co/functions/v1/admin-api/'},'production').apiBaseUrl,'https://example.supabase.co/functions/v1/admin-api');
 for(const url of ['http://example.com','https://user:secret@example.com','https://example.com/?token=secret'])assert.throws(()=>resolveAdminSettings({VITE_ADMIN_API_BASE_URL:url},'production'));
});

test('environment selection exposes only explicitly configured public targets', async () => {
  const config = await import('../public-auth-config.ts');
  assert.equal(typeof config.resolveAdminSettings, 'function');
  const result = config.resolveAdminSettings({ KICKON_ENVIRONMENT:'development', NEXT_PUBLIC_KICKON_DEVELOPMENT_SUPABASE_URL:'https://dev.example.com', NEXT_PUBLIC_KICKON_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_dev', NEXT_PUBLIC_KICKON_PRODUCTION_SUPABASE_URL:'https://prod.example.com', NEXT_PUBLIC_KICKON_PRODUCTION_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_prod', SPORTSMONKS_API_ALLOWANCE:'2000', SUPABASE_METRICS_SECRET_KEY:'must-not-escape', SPORTMONKS_API_TOKEN:'provider-token-must-not-escape' }, 'development');
  assert.equal(result.environments.development?.url, 'https://dev.example.com');
  assert.equal(result.environments.production?.url, 'https://prod.example.com');
  assert.equal(result.environments.development?.providerAllowance, 2000);
  assert.ok(!JSON.stringify(result).includes('must-not-escape'));
  assert.ok(!JSON.stringify(result).includes('provider-token-must-not-escape'));
  const single = config.resolveAdminSettings({ VITE_SUPABASE_URL:'https://dev.example.com', VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_dev' }, 'development');
  assert.equal(single.environments.production, undefined);
  assert.deepEqual(config.resolveAdminSettings({}, 'design-preview').environments, {});
});
