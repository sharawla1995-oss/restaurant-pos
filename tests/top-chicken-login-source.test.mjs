// Run: node --test tests/top-chicken-login-source.test.mjs
// Source-contract tests for the isolated Top Chicken beta candidate.
// These do not exercise live Auth, database RLS or the Windows installer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const provision=readFileSync(new URL('../scripts/top-chicken-first-admin-beta.mjs',import.meta.url),'utf8');

test('login field permits username without at-sign',()=>{
  assert.match(html,/id="email" type="text"/);
  assert.match(html,/اسم المستخدم أو البريد الإلكتروني/);
});
test('username path uses server-side login and preserves email fallback',()=>{
  assert.match(app,/usernameLogin\(email,password\)/);
  assert.match(app,/action:'login',username,password/);
  assert.match(app,/email\.includes\('@'\)/);
  assert.match(app,/auth\/v1\/token\?grant_type=password/);
});
test('username function request omits unsupported tenant headers',()=>{
  const block=app.split('async function usernameLogin(username,password){')[1]?.split('async function signIn(')[0];
  assert.ok(block,'usernameLogin function missing');
  assert.match(block,/headers:\{'Content-Type':'application\/json',apikey:cfg\.key\}/);
  assert.doesNotMatch(block,/tenantIdentityHeaders\(/);
});
test('session is checked against canonical tenant before it is cached',()=>{
  const block=app.split('async function signIn(email,password){')[1]?.split('async function logout(')[0];
  assert.ok(block);
  assert.match(block,/activeTenantBusinessId\(\)/);
  assert.match(block,/auth_user_id=eq\./);
  assert.match(block,/business_id=eq\./);
  assert.match(block,/active=eq\.true/);
  assert.ok(block.indexOf('if(!Array.isArray(check)')<block.indexOf('localStorage.setItem(\'sbResumeSession\''),'tenant check must precede cache');
});
test('operator-only first-admin script is beta-pinned and opt-in',()=>{
  assert.match(provision,/xihcxydjnzemflhedzor\.supabase\.co/);
  assert.match(provision,/process\.argv\.includes\('--apply'\)/);
  assert.match(provision,/if\(!APPLY\)/);
  assert.match(provision,/Device binding mismatch/);
  assert.match(provision,/business_auth_memberships/);
  assert.doesNotMatch(provision,/123456/);
});

test('offline login verifier is bound to canonical tenant',()=>{
  assert.match(app,/business_id:activeTenantBusinessId\(\)/);
  assert.match(app,/v\.business_id!==activeTenantBusinessId\(\)/);
});
