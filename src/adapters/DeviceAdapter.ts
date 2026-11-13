import { DeviceAdapter } from '../types/adapter';
import { MockAdapter } from './MockAdapter';
import { SpectrumAdapter } from './SpectrumAdapter';

/** Holds the two adapters and which one the app is using. */
export class AdapterManager {
  private static mock = new MockAdapter();
  private static spectrum = new SpectrumAdapter();
  private static active: DeviceAdapter = AdapterManager.mock;

  public static getActive(): DeviceAdapter {
    return this.active;
  }

  public static getSpectrum(): SpectrumAdapter {
    return this.spectrum;
  }

  public static setActive(id: 'mock' | 'spectrum'): DeviceAdapter {
    this.active = id === 'spectrum' ? this.spectrum : this.mock;
    return this.active;
  }
}
