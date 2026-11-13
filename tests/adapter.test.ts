import test from 'node:test';
import assert from 'node:assert/strict';
import { MockAdapter } from '../src/adapters/MockAdapter.ts';
import { SpectrumAdapter, decodePollingFromReadback } from '../src/adapters/SpectrumAdapter.ts';
import { DEFAULT_PROFILE } from '../src/storage/defaultProfile.ts';

type Call = { cmd: string; args?: Record<string, unknown> };

/** Stands in for the Tauri bridge: records every call and answers like the Rust side. */
function fakeTauri(answer: (cmd: string, args?: Record<string, unknown>) => unknown) {
  const calls: Call[] = [];
  const g = globalThis as { window?: unknown };
  const original = g.window;
  g.window = {
    __TAURI__: {
      core: {
        invoke: async (cmd: string, args?: Record<string, unknown>) => {
          calls.push({ cmd, args });
          return answer(cmd, args);
        },
      },
    },
  };
  return { calls, restore: () => (g.window = original) };
}

const MOUSE = { path: 'p', vendor_id: 0x30fa, product_id: 0x1440, usage_page: 0xff01, usage: 1 };

test('demo mouse keeps what was applied', async () => {
  const demo = new MockAdapter();
  assert.equal(await demo.isConnected(), true);
  const res = await demo.applyConfig({ ...DEFAULT_PROFILE, polling_rate: 500 });
  assert.equal(res.status, 'applied');
  assert.equal((await demo.readCurrentState()).polling_rate, 500);
});

test('real mouse is not found when the Rust side is missing', async () => {
  const mouse = new SpectrumAdapter();
  assert.equal(await mouse.isConnected(), false);
  const res = await mouse.applyConfig(DEFAULT_PROFILE);
  assert.equal(res.success, false);
});

test('polling, DPI and lighting go out together in one hid_apply_settings call', async () => {
  const bridge = fakeTauri((cmd) => (cmd === 'hid_scan_devices' ? [MOUSE] : cmd === 'hid_apply_settings' ? 1117 : null));
  try {
    const mouse = new SpectrumAdapter();
    await mouse.connect();
    const dpis = [400, 800, 1600, 3200, 6400, 12800];
    const res = await mouse.applyConfig({
      ...DEFAULT_PROFILE,
      polling_rate: 250,
      active_dpi_stage: 2,
      dpi_stages: dpis.map((dpi, i) => ({ id: i + 1, dpi })),
      rgb: { ...DEFAULT_PROFILE.rgb, mode: 3, direction: 'counter-clockwise' },
    });
    assert.equal(res.status, 'applied');
    const writes = bridge.calls.filter((c) => c.cmd === 'hid_apply_settings');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].args?.pollingHz, 250);
    assert.deepEqual(writes[0].args?.dpiValues, dpis);
    assert.equal(writes[0].args?.activeStage, 2);
    assert.deepEqual(writes[0].args?.lighting, { effect: 3, speed: 3, brightness: 0, direction: 1 });
  } finally {
    bridge.restore();
  }
});

test('a safety refusal from Rust is reported as refused, not as a failed write', async () => {
  const bridge = fakeTauri((cmd) => {
    if (cmd === 'hid_scan_devices') return [MOUSE];
    if (cmd === 'hid_apply_settings') throw new Error('Refusing: the vendor app is running');
    return null;
  });
  try {
    const mouse = new SpectrumAdapter();
    await mouse.connect();
    const res = await mouse.applyConfig(DEFAULT_PROFILE);
    assert.equal(res.status, 'refused');
  } finally {
    bridge.restore();
  }
});

test('polling rate is read back from status byte 6', () => {
  assert.equal(decodePollingFromReadback([0x07, 0, 0x68, 0x09, 0, 0, 0x03, 0]), 1000);
  assert.equal(decodePollingFromReadback([0x07, 0, 0x68, 0x09, 0, 0, 0x63, 0]), 250);
  assert.equal(decodePollingFromReadback([0x07, 0, 0x68, 0x09, 0, 0, 0xe3, 0]), 125);
  assert.equal(decodePollingFromReadback([0x01]), null);
});
