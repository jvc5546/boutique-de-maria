// Run: node --test lambdas/auth-gate/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHandler, NOT_INVITED } from '../src/index.mjs';

const users = {
  'jona@example.com': { name: 'Jona', role: 'admin', tier: 'preferred', status: 'active' },
  'old@example.com': { name: 'Old', role: 'distributor', tier: 'standard', status: 'removed' },
};
const handler = makeHandler(async (email) => users[email] ?? null);

const event = (triggerSource, userAttributes) => ({
  triggerSource,
  request: { userAttributes },
  response: {},
});

test('invited Google user can sign up (email is case-insensitive)', async () => {
  const e = event('PreSignUp_ExternalProvider', { email: ' Jona@Example.com ', email_verified: 'true' });
  assert.equal(await handler(e), e);
});

test('stranger is refused', async () => {
  const e = event('PreSignUp_ExternalProvider', { email: 'x@example.com', email_verified: 'true' });
  await assert.rejects(handler(e), new RegExp(NOT_INVITED));
});

test('removed user is refused', async () => {
  const e = event('TokenGeneration_RefreshTokens', { email: 'old@example.com' });
  await assert.rejects(handler(e), new RegExp(NOT_INVITED));
});

test('unverified email is refused', async () => {
  const e = event('PreSignUp_ExternalProvider', { email: 'jona@example.com', email_verified: 'false' });
  await assert.rejects(handler(e), new RegExp(NOT_INVITED));
});

test('missing email is refused', async () => {
  await assert.rejects(handler(event('PreSignUp_ExternalProvider', {})), new RegExp(NOT_INVITED));
});

test('password sign-up and admin-created users are refused', async () => {
  for (const src of ['PreSignUp_SignUp', 'PreSignUp_AdminCreateUser']) {
    const e = event(src, { email: 'jona@example.com' });
    await assert.rejects(handler(e), new RegExp(NOT_INVITED));
  }
});

test('tokens carry role, tier and name', async () => {
  const e = event('TokenGeneration_HostedAuth', { email: 'jona@example.com', email_verified: 'true' });
  const out = await handler(e);
  assert.deepEqual(out.response.claimsOverrideDetails.claimsToAddOrOverride, {
    bdm_role: 'admin',
    bdm_tier: 'preferred',
    bdm_name: 'Jona',
  });
});
