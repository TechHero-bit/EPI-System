import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secretEquals, secretHash, token, unitItems } from './security.js';

test('rejeita quantidade diferente de um e fixa um no resultado', () => {
  assert.equal(unitItems([{ variantId: 'v', lotId: 'l' }])[0]?.quantity,1);
  assert.throws(() => unitItems([{ variantId: 'v', lotId: 'l', quantity: 2 }]),/1/);
});

test('gera token aleatorio e confere hash secreto', () => {
  const pepper = 'x'.repeat(32);
  const value = token();
  assert.ok(value.length > 32);
  assert.equal(secretEquals(value, secretHash(value, pepper), pepper),true);
  assert.equal(secretEquals('outro', secretHash(value, pepper), pepper),false);
});
