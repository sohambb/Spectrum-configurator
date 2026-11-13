import test from 'node:test';
import assert from 'node:assert/strict';
import { toVendorLighting, toVendorBrightness, toVendorSpeed } from '../src/protocol/lighting.ts';
import { DEFAULT_PROFILE } from '../src/storage/defaultProfile.ts';

const rgb = (patch: object) => ({ ...DEFAULT_PROFILE.rgb, ...patch });

test('speed and brightness map to the mouse ranges', () => {
  assert.equal(toVendorSpeed(1), 0);
  assert.equal(toVendorSpeed(5), 5);
  assert.equal(toVendorBrightness(100), 0);
  assert.equal(toVendorBrightness(0), 7);
});

test('no effect chosen -> nothing sent; off -> LED Off', () => {
  assert.equal(toVendorLighting(rgb({ mode: undefined })), null);
  assert.equal(toVendorLighting(rgb({ enabled: false }))?.effect, 13);
});

test('direction only where the effect supports it', () => {
  assert.equal(toVendorLighting(rgb({ mode: 3, direction: 'two-way' }))?.direction, 2);
  assert.equal(toVendorLighting(rgb({ mode: 10, direction: 'two-way' }))?.direction, 0);
  assert.equal(toVendorLighting(rgb({ mode: 10, direction: 'counter-clockwise' }))?.direction, 1);
  assert.equal(toVendorLighting(rgb({ mode: 2, direction: 'counter-clockwise' }))?.direction, 0);
});
