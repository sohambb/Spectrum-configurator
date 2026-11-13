import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfileStorage } from '../src/storage/profileStorage.ts';
import { DEFAULT_PROFILE } from '../src/storage/defaultProfile.ts';

// Setup Mock LocalStorage
class MemoryStorage {
  private store: Map<string, string> = new Map();
  getItem(key: string) { return this.store.get(key) ?? null; }
  setItem(key: string, value: string) { this.store.set(key, String(value)); }
  removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
}

(globalThis as any).localStorage = new MemoryStorage();

test('ProfileStorage - returns DEFAULT_PROFILE when storage is empty', () => {
  localStorage.clear();
  const profiles = ProfileStorage.loadAllProfiles();
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].profile_id, DEFAULT_PROFILE.profile_id);
  assert.equal(profiles[0].name, DEFAULT_PROFILE.name);
});

test('ProfileStorage - saves and retrieves profile', () => {
  localStorage.clear();
  const custom = {
    ...DEFAULT_PROFILE,
    profile_id: 'test-profile-1',
    name: 'Test Profile',
    polling_rate: 500 as const,
  };

  ProfileStorage.saveProfile(custom);
  const active = ProfileStorage.getActiveProfile();
  assert.equal(active.profile_id, 'test-profile-1');
  assert.equal(active.name, 'Test Profile');
  assert.equal(active.polling_rate, 500);

  const all = ProfileStorage.loadAllProfiles();
  assert.equal(all.length, 2); // default + test-profile-1
});

test('ProfileStorage - deleteProfile preserves at least one profile', () => {
  localStorage.clear();
  const all = ProfileStorage.loadAllProfiles();
  assert.equal(all.length, 1);
  const deleted = ProfileStorage.deleteProfile(all[0].profile_id);
  assert.equal(deleted, false, 'Should not delete the last remaining profile');
  assert.equal(ProfileStorage.loadAllProfiles().length, 1);
});

test('ProfileStorage - JSON export and import', () => {
  localStorage.clear();
  const exported = ProfileStorage.exportProfileJson(DEFAULT_PROFILE);
  assert.ok(typeof exported === 'string');
  assert.ok(exported.includes(DEFAULT_PROFILE.name));

  const imported = ProfileStorage.importProfileJson(exported);
  assert.ok(imported.profile_id.startsWith('import-'));
  assert.equal(imported.name, DEFAULT_PROFILE.name);
  assert.equal(imported.polling_rate, 1000);
});
