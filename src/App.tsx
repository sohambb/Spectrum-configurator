import React, { useCallback, useEffect, useState } from 'react';
import { MouseConfig, PollingRate, validateConfig } from './types/config';
import { ApplyResult, DeviceAdapter } from './types/adapter';
import { ProfileStorage } from './storage/profileStorage';
import { AdapterManager } from './adapters/DeviceAdapter';
import { Sidebar, SectionId } from './ui/Sidebar';
import { AppMenu } from './ui/AppMenu';
import { ProfileMenu } from './ui/ProfileMenu';
import { DpiSection } from './ui/sections/DpiSection';
import { PollingSection } from './ui/sections/PollingSection';
import { LightingSection } from './ui/sections/LightingSection';
import { ButtonsSection } from './ui/sections/ButtonsSection';

type Toast = { message: string; detail?: string; tone: 'ok' | 'info' | 'warn' | 'bad' };

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const THEME_KEY = 'cb_spectrum_theme';

export const App: React.FC = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });
  const [section, setSection] = useState<SectionId>('dpi');
  const [adapter, setAdapter] = useState<DeviceAdapter>(AdapterManager.getActive());
  const [devicePolling, setDevicePolling] = useState<PollingRate | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const [profiles, setProfiles] = useState<MouseConfig[]>([]);
  const [saved, setSaved] = useState<MouseConfig>(() => ProfileStorage.getActiveProfile());
  const [staged, setStaged] = useState<MouseConfig>(() => clone(ProfileStorage.getActiveProfile()));

  const demo = adapter.isMock;
  const dirty = JSON.stringify(saved) !== JSON.stringify(staged);

  const showToast = useCallback((t: Toast, ms = 5000) => {
    setToast(t);
    window.setTimeout(() => setToast((cur) => (cur === t ? null : cur)), ms);
  }, []);

  const reloadProfiles = useCallback(() => {
    setProfiles(ProfileStorage.loadAllProfiles());
    const active = ProfileStorage.getActiveProfile();
    setSaved(active);
    setStaged(clone(active));
  }, []);

  useEffect(() => {
    reloadProfiles();
  }, [reloadProfiles]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* storage unavailable: theme just won't be remembered */
    }
  }, [theme]);

  const readMouse = useCallback(async () => {
    if (adapter.isMock) return;
    const state = await adapter.readCurrentState();
    setDevicePolling(state.polling_rate ?? null);
  }, [adapter]);

  // Watch the USB port. The app uses the real mouse whenever one is plugged in and falls back
  // to the demo mouse when it is not. Scanning only reads.
  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (busy) return;
      const spectrum = AdapterManager.getSpectrum();
      let found = false;
      try {
        found = await spectrum.isConnected();
      } catch {
        found = false;
      }
      if (!alive) return;
      if (found && adapter.isMock) {
        await spectrum.connect();
        const state = await spectrum.readCurrentState();
        if (!alive) return;
        setDevicePolling(state.polling_rate ?? null);
        setAdapter(AdapterManager.setActive('spectrum'));
      } else if (!found && !adapter.isMock) {
        setDevicePolling(null);
        setAdapter(AdapterManager.setActive('mock'));
      }
    };
    check();
    const timer = window.setInterval(check, 2000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [adapter, busy]);

  const save = () => {
    ProfileStorage.saveProfile(staged);
    reloadProfiles();
    showToast({ tone: 'ok', message: `Saved "${staged.name}".` });
  };

  const discard = () => {
    setStaged(clone(saved));
    showToast({ tone: 'info', message: 'Changes reverted.' });
  };

  const apply = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res: ApplyResult = await adapter.applyConfig(staged);
      if (adapter.isMock) {
        showToast({ tone: 'ok', message: 'Applied to the demo mouse.', detail: 'Plug in your mouse to change the real one.' });
        return;
      }
      const detail = res.warnings[0];
      switch (res.status) {
        case 'applied':
          showToast({ tone: 'ok', message: res.message, detail }, 6000);
          break;
        case 'unchanged':
          showToast({ tone: 'info', message: res.message, detail }, 6000);
          break;
        case 'refused':
          showToast({ tone: 'warn', message: res.message, detail }, 9000);
          break;
        default:
          showToast({ tone: 'bad', message: res.message, detail }, 15000);
      }
      await readMouse();
    } catch (err) {
      showToast({ tone: 'bad', message: `The write failed: ${err instanceof Error ? err.message : String(err)}` }, 15000);
    } finally {
      setBusy(false);
    }
  };

  const selectProfile = (id: string) => {
    if (dirty && !window.confirm('Switch profiles and lose unsaved changes?')) return;
    ProfileStorage.setActiveProfileId(id);
    reloadProfiles();
  };

  const createProfile = () => {
    const fresh = clone(staged);
    fresh.profile_id = 'profile-' + Date.now();
    fresh.name = `Profile ${profiles.length + 1}`;
    ProfileStorage.saveProfile(fresh);
    reloadProfiles();
    showToast({ tone: 'ok', message: `Created "${fresh.name}" from the current settings.` });
  };

  const renameProfile = (id: string, name: string) => {
    const target = id === staged.profile_id ? { ...saved, name } : profiles.find((p) => p.profile_id === id);
    if (!target) return;
    ProfileStorage.saveProfile({ ...target, name });
    const keep = id === staged.profile_id ? { ...staged, name } : null;
    reloadProfiles();
    if (keep) setStaged(keep);
  };

  const deleteProfile = (id: string) => {
    if (ProfileStorage.deleteProfile(id)) reloadProfiles();
  };

  const exportProfile = () => {
    const url = URL.createObjectURL(new Blob([ProfileStorage.exportProfileJson(staged)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${staged.name.replace(/[^\w-]+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importProfile = (json: string) => {
    try {
      validateConfig(JSON.parse(json));
      const imported = ProfileStorage.importProfileJson(json);
      reloadProfiles();
      showToast({ tone: 'ok', message: `Imported "${imported.name}".` });
    } catch (err) {
      showToast({ tone: 'bad', message: 'That file is not a valid profile.', detail: err instanceof Error ? err.message : undefined });
    }
  };

  // Ctrl+S saves, Ctrl+Enter applies.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 's') {
        e.preventDefault();
        save();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        apply();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const status = busy ? 'Applying…' : demo ? 'Demo mode: no mouse detected' : dirty ? 'Unsaved changes' : '';

  return (
    <div
      className="shell"
      style={
        {
          '--ambient-a': `color-mix(in srgb, ${staged.rgb.enabled && staged.rgb.effect !== 'off' ? staged.rgb.color : '#007aff'} 22%, transparent)`,
        } as React.CSSProperties
      }
    >
      <Sidebar
        config={staged}
        section={section}
        onSection={setSection}
        demo={demo}
        devicePolling={devicePolling}
      />

      <div className="content">
        <header className="toolbar" data-tauri-drag-region>
          <span className="toolbar-spacer" />
          <ProfileMenu
            profiles={profiles}
            activeId={staged.profile_id}
            activeName={staged.name}
            onSelect={selectProfile}
            onCreate={createProfile}
            onRename={renameProfile}
            onDelete={deleteProfile}
            onExport={exportProfile}
            onImport={importProfile}
          />
          <AppMenu theme={theme} onTheme={setTheme} />
        </header>

        <main className="pane" id="main">
          {section === 'dpi' && (
            <DpiSection
              stages={staged.dpi_stages}
              active={staged.active_dpi_stage}
              onStages={(dpi_stages) => setStaged({ ...staged, dpi_stages })}
              onActive={(active_dpi_stage) => setStaged({ ...staged, active_dpi_stage })}
            />
          )}
          {section === 'polling' && (
            <PollingSection
              rate={staged.polling_rate}
              onRate={(polling_rate) => setStaged({ ...staged, polling_rate })}
              devicePolling={devicePolling}
            />
          )}
          {section === 'lighting' && (
            <LightingSection
              rgb={staged.rgb}
              onChange={(rgb) => setStaged({ ...staged, rgb })}
            />
          )}
          {section === 'buttons' && <ButtonsSection />}
        </main>

        <footer className="actionbar">
          <span className={`actionbar-status ${dirty ? 'is-dirty' : ''}`} role="status">
            {status}
          </span>
          <button type="button" className="btn" onClick={discard} disabled={!dirty || busy}>
            Revert
          </button>
          <button type="button" className="btn" onClick={save} disabled={busy}>
            Save profile
          </button>
          <button type="button" className="btn btn-primary" onClick={apply} disabled={busy}>
            Apply
          </button>
        </footer>
      </div>

      {toast && (
        <aside className={`toast toast-${toast.tone}`} role={toast.tone === 'bad' ? 'alert' : 'status'}>
          <div>
            <p>{toast.message}</p>
            {toast.detail && <p className="toast-detail">{toast.detail}</p>}
          </div>
          <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => setToast(null)}>
            ×
          </button>
        </aside>
      )}
    </div>
  );
};
