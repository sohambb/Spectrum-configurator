import { MouseConfig } from './config';

/**
 * applied     the mouse accepted the write and the read-back matched
 * unchanged   the mouse already had this setting, so nothing was sent
 * refused     a safety check stopped the write before anything was sent
 * error       the write failed part-way or the mouse could not be reached
 */
export type ApplyStatus = 'applied' | 'unchanged' | 'refused' | 'error';

export interface ApplyResult {
  success: boolean;
  status: ApplyStatus;
  message: string;
  warnings: string[];
}

/** Something the app can send settings to: the real mouse or the demo mouse. */
export interface DeviceAdapter {
  readonly id: 'spectrum' | 'mock';
  readonly isMock: boolean;

  isConnected(): Promise<boolean>;
  connect(): Promise<boolean>;
  applyConfig(config: MouseConfig): Promise<ApplyResult>;
  readCurrentState(): Promise<Partial<MouseConfig>>;
}
