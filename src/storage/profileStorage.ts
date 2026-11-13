import { MouseConfig, validateConfig } from '../types/config';
import { DEFAULT_PROFILE } from './defaultProfile';

const STORAGE_KEY_PROFILES = 'cb_spectrum_profiles_v1';
const STORAGE_KEY_ACTIVE = 'cb_spectrum_active_profile_id_v1';

export class ProfileStorage {
  public static loadAllProfiles(): MouseConfig[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PROFILES);
      if (!raw) {
        this.saveProfile(DEFAULT_PROFILE);
        return [DEFAULT_PROFILE];
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        this.saveProfile(DEFAULT_PROFILE);
        return [DEFAULT_PROFILE];
      }
      return parsed.map((item) => validateConfig(item));
    } catch {
      return [DEFAULT_PROFILE];
    }
  }

  public static getActiveProfile(): MouseConfig {
    const profiles = this.loadAllProfiles();
    const activeId = localStorage.getItem(STORAGE_KEY_ACTIVE);
    const found = profiles.find((p) => p.profile_id === activeId);
    return found ?? profiles[0] ?? DEFAULT_PROFILE;
  }

  public static setActiveProfileId(id: string): void {
    localStorage.setItem(STORAGE_KEY_ACTIVE, id);
  }

  public static saveProfile(config: MouseConfig): void {
    const validated = validateConfig({
      ...config,
      last_modified: new Date().toISOString(),
    });
    const profiles = this.loadAllProfiles();
    const index = profiles.findIndex((p) => p.profile_id === validated.profile_id);
    if (index >= 0) {
      profiles[index] = validated;
    } else {
      profiles.push(validated);
    }
    localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(profiles));
    this.setActiveProfileId(validated.profile_id);
  }

  public static deleteProfile(profileId: string): boolean {
    const profiles = this.loadAllProfiles();
    if (profiles.length <= 1) {
      return false; // Preserve at least one profile
    }
    const filtered = profiles.filter((p) => p.profile_id !== profileId);
    localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(filtered));
    if (localStorage.getItem(STORAGE_KEY_ACTIVE) === profileId) {
      this.setActiveProfileId(filtered[0].profile_id);
    }
    return true;
  }

  public static exportProfileJson(config: MouseConfig): string {
    return JSON.stringify(validateConfig(config), null, 2);
  }

  public static importProfileJson(jsonStr: string): MouseConfig {
    const parsed = JSON.parse(jsonStr);
    const validated = validateConfig(parsed);
    // Assign a unique ID on import to avoid collision
    validated.profile_id = 'import-' + Date.now();
    this.saveProfile(validated);
    return validated;
  }
}
