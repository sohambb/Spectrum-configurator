import { ApplyResult, DeviceAdapter } from '../types/adapter';
import { MouseConfig } from '../types/config';
import { DEFAULT_PROFILE } from '../storage/defaultProfile';

/** The demo mouse: keeps the settings in memory so the app can be tried without a mouse. */
export class MockAdapter implements DeviceAdapter {
  public readonly id = 'mock';
  public readonly isMock = true;

  private state: MouseConfig = structuredClone(DEFAULT_PROFILE);

  public async isConnected(): Promise<boolean> {
    return true;
  }

  public async connect(): Promise<boolean> {
    return true;
  }

  public async applyConfig(config: MouseConfig): Promise<ApplyResult> {
    this.state = structuredClone(config);
    return { success: true, status: 'applied', message: 'Applied to the demo mouse.', warnings: [] };
  }

  public async readCurrentState(): Promise<Partial<MouseConfig>> {
    return structuredClone(this.state);
  }
}
