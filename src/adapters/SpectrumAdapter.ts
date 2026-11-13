import { DeviceAdapter, ApplyResult } from '../types/adapter';
import { MouseConfig, PollingRate } from '../types/config';
import { HidDeviceInfo } from '../types/hid';
import { dpiSendProblems } from '../protocol/dpiSend';
import { VENDOR_EFFECTS, toVendorLighting } from '../protocol/lighting';

/*
 * Talks to the real Cosmic Byte Spectrum through the Rust side of the app.
 *
 * Apply sends the polling rate, the six DPI stages and the lighting effect in one guarded
 * flash write (hid_apply_settings). The Rust side refuses to write while the vendor app is
 * open and checks the mouse's status before and after. Buttons and macros are not sent yet.
 *
 * Needs "withGlobalTauri": true in src-tauri/tauri.conf.json, which exposes
 * window.__TAURI__.core.invoke.
 */

type InvokeOutcome<T> =
  | { available: false }
  | { available: true; ok: true; value: T }
  | { available: true; ok: false; error: string };

type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

function getInvoke(): InvokeFn | null {
  if (typeof window === 'undefined') return null;
  const tauri = (window as unknown as { __TAURI__?: { core?: { invoke?: InvokeFn } } }).__TAURI__;
  return tauri?.core?.invoke ?? null;
}

async function callRust<T>(cmd: string, args?: Record<string, unknown>): Promise<InvokeOutcome<T>> {
  const invoke = getInvoke();
  if (!invoke) return { available: false };
  try {
    return { available: true, ok: true, value: (await invoke(cmd, args)) as T };
  } catch (err) {
    return { available: true, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/*
 * Read-back byte 6 (feature report 0x07, buf[0] is the report ID) carries the
 * polling rate in its top bits, as observed on the real mouse:
 * 0x03 = 1000 Hz, 0x23 = 500 Hz, 0x63 = 250 Hz, 0xE3 = 125 Hz.
 * The same codes (0, 1, 3, 7) are written to flash 0x1E.
 */
const POLLING_FROM_CODE: Record<number, PollingRate> = { 0: 1000, 1: 500, 3: 250, 7: 125 };

export function decodePollingFromReadback(buf: number[]): PollingRate | null {
  if (buf.length < 7 || buf[0] !== 0x07) return null;
  return POLLING_FROM_CODE[(buf[6] >> 5) & 0x07] ?? null;
}

export class SpectrumAdapter implements DeviceAdapter {
  public readonly id = 'spectrum';
  public readonly isMock = false;

  private activeDevice: HidDeviceInfo | null = null;
  private lastDevices: HidDeviceInfo[] = [];

  public async isConnected(): Promise<boolean> {
    const devices = await this.scanDevices();
    return devices.length > 0;
  }

  public async connect(): Promise<boolean> {
    const devices = await this.scanDevices();
    // Settings live on the vendor interface 0xFF01 (feature report 0x07).
    this.activeDevice = devices.find((d) => d.usage_page === 0xff01) ?? devices[0] ?? null;
    return this.activeDevice !== null;
  }

  public async scanDevices(): Promise<HidDeviceInfo[]> {
    const res = await callRust<HidDeviceInfo[]>('hid_scan_devices');
    // "busy" = a write is running right now. Keep the last answer instead of flashing "not connected".
    if (res.available && !res.ok && /busy/i.test(res.error)) return this.lastDevices;
    if (!res.available || !res.ok || !Array.isArray(res.value)) return [];
    // Only the vendor-defined interfaces of VID 0x30FA / PID 0x1440. Never the
    // normal mouse (page 0x01 usage 0x02), keyboard (0x01/0x06) or consumer (0x0C) ones.
    this.lastDevices = res.value.filter((d) => {
      const isTarget = d.vendor_id === 0x30fa && d.product_id === 0x1440;
      const isVendorPage = d.usage_page === 0xff01 || d.usage_page === 0xff00;
      return isTarget && isVendorPage;
    });
    return this.lastDevices;
  }

  public async applyConfig(config: MouseConfig): Promise<ApplyResult> {
    if (!(await this.isConnected())) {
      return {
        success: false,
        status: 'error',
        message: 'The mouse was not found on USB.',
        warnings: ['Plug the mouse in directly, without a USB hub.'],
      };
    }
    if (!this.activeDevice) await this.connect();

    // DPI goes in the same write as polling, but only when the stages fit what the mouse stores.
    const problems = dpiSendProblems(config.dpi_stages, config.active_dpi_stage);
    const sendDpi = problems.length === 0;
    const dpiValues = config.dpi_stages.map((s) => s.dpi);
    const lighting = toVendorLighting(config.rgb);
    const notSent = ['Buttons and macros are not sent yet.'];
    if (!lighting) notSent.unshift("RGB lighting not sent: pick one of the mouse's effects on the Lighting tab.");
    if (!sendDpi) notSent.unshift(`DPI not sent: ${problems[0]}`);
    const combined = sendDpi || lighting !== null;

    // Polling alone: skip the flash write when the mouse already reports this rate.
    // With DPI or lighting we always write, because the mouse cannot report those back.
    if (!combined) {
      const current = await this.readCurrentState();
      if (current.polling_rate === config.polling_rate) {
        return { success: true, status: 'unchanged', message: 'Nothing was sent.', warnings: notSent };
      }
    }

    const res = combined
      ? await callRust<number>('hid_apply_settings', {
          path: this.activeDevice?.path ?? '',
          pollingHz: config.polling_rate,
          dpiValues: sendDpi ? dpiValues : null,
          activeStage: sendDpi ? config.active_dpi_stage : null,
          lighting,
        })
      : await callRust<number>('hid_set_polling_rate', {
          path: this.activeDevice?.path ?? '',
          rateHz: config.polling_rate,
        });

    if (!res.available) {
      return { success: false, status: 'error', message: 'The app could not reach its Rust side.', warnings: notSent };
    }

    if (res.ok) {
      const parts = [`${config.polling_rate} Hz`];
      if (sendDpi) parts.push(`DPI ${dpiValues.join(' / ')} (stage ${config.active_dpi_stage + 1} active)`);
      if (lighting) parts.push(`lighting ${lighting.effect === 13 ? 'off' : VENDOR_EFFECTS[lighting.effect].name}`);
      const what = parts.join(', ');
      return {
        success: true,
        status: 'applied',
        message: `Sent ${what}.`,
        warnings: combined
          ? ['The mouse cannot report DPI or lighting back, so check them on the mouse itself.', ...notSent]
          : notSent,
      };
    }

    const error = res.error;
    // These messages come from checks that run before the first packet is sent.
    if (/^Refusing|drift detected|Pre-send|Invalid|Unsupported|out of range|Exactly 6|device path|not found/i.test(error)) {
      return { success: false, status: 'refused', message: `Nothing was sent: ${error}`, warnings: [] };
    }
    return {
      success: false,
      status: 'error',
      message: `The write failed: ${error}`,
      warnings: ['Do not retry. Open the vendor app and click Apply to restore the mouse, then check its state.'],
    };
  }

  public async readCurrentState(): Promise<Partial<MouseConfig>> {
    if (!this.activeDevice) {
      const devices = await this.scanDevices();
      this.activeDevice = devices.find((d) => d.usage_page === 0xff01) ?? null;
    }
    if (!this.activeDevice) return {};
    const res = await callRust<number[]>('hid_read_report', { path: this.activeDevice.path, reportId: 0x07 });
    if (!res.available || !res.ok || !Array.isArray(res.value)) return {};
    const polling = decodePollingFromReadback(res.value);
    return polling ? { polling_rate: polling } : {};
  }
}
