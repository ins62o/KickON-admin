import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAuthorizedAdmin, signInAdmin, type AdminAuthPort } from '../src/auth/policy.ts';

function fixture({ user = { id: 'verified-user', email: 'admin@example.com' } as { id: string; email: string | null } | null, membership = { role: 'super_admin', is_active: true, display_name: ' 운영자 ' } as unknown, failUser = false } = {}) {
  const calls = { membership: 0, signOut: 0, email: '', password: '' };
  const port: AdminAuthPort = {
    async verifyUser() { if (failUser) throw Error('unverified'); return user; },
    async readMembership(id) { calls.membership++; assert.equal(id, 'verified-user'); return membership; },
    async passwordSignIn(email, password) { calls.email = email; calls.password = password; },
    async signOut() { calls.signOut++; },
  };
  return { port, calls };
}

test('active verified administrators can enter', async () => {
  const { port } = fixture();
  assert.deepEqual(await readAuthorizedAdmin(port), { userId: 'verified-user', email: 'admin@example.com', displayName: '운영자', role: 'super_admin' });
});
test('a missing or unverified user never reaches membership lookup', async () => {
  const absent = fixture({ user: null });
  assert.equal(await readAuthorizedAdmin(absent.port), null);
  assert.equal(absent.calls.membership, 0);
  const unverified = fixture({ failUser: true });
  await assert.rejects(readAuthorizedAdmin(unverified.port));
  assert.equal(unverified.calls.membership, 0);
});
test('inactive, missing, unknown and prototype-like roles are rejected', async () => {
  for (const membership of [null, { role: 'super_admin', is_active: false }, { role: 'super_admin', is_active: 'true' }, { role: 'owner', is_active: true }, { role: 'toString', is_active: true }]) {
    assert.equal(await readAuthorizedAdmin(fixture({ membership }).port), null);
  }
});
test('failed authorization clears the newly signed-in session', async () => {
  const { port, calls } = fixture({ membership: null });
  await assert.rejects(signInAdmin(port, ' admin@example.com ', ' password '));
  assert.equal(calls.signOut, 1);
  assert.equal(calls.email, 'admin@example.com');
  assert.equal(calls.password, ' password ');
});
test('authorization lookup failure also clears the signed-in session', async () => {
  const { port, calls } = fixture({ failUser: true });
  await assert.rejects(signInAdmin(port, 'admin@example.com', 'password'));
  assert.equal(calls.signOut, 1);
});
test('empty credentials do not issue network requests', async () => {
  const { port, calls } = fixture();
  await assert.rejects(signInAdmin(port, ' ', ''));
  assert.equal(calls.email, '');
  assert.equal(calls.membership, 0);
});

test('same verified administrator can revalidate without replacing the open workspace', async () => {
  const policy = await import('../src/auth/policy.ts');
  assert.equal(typeof policy.canRevalidateAdminInBackground, 'function');
  const {port,calls}=fixture();
  const admin=await readAuthorizedAdmin(port);
  assert.equal(policy.canRevalidateAdminInBackground(admin,'verified-user'),true);
  assert.equal(policy.canRevalidateAdminInBackground(admin,'different-user'),false);
  assert.equal(policy.canRevalidateAdminInBackground(null,'verified-user'),false);
  assert.equal(policy.canRevalidateAdminInBackground(admin,null),false);
  assert.equal((await readAuthorizedAdmin(port))?.userId,'verified-user');
  assert.equal(calls.membership,2);
});
