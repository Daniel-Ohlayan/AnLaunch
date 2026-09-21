import { useCallback, useEffect, useMemo, useState } from "react";
import { api, isElectron, launcherVersion } from "./lib/api";
import type { AuthState, InitData, LauncherConfig, McVersionMeta, Profile } from "./lib/types";
import { Sidebar, type Tab } from "./components/Sidebar";
import { ModsView } from "./views/ModsView";
import { ProfilesView } from "./views/ProfilesView";
import { SettingsView } from "./views/SettingsView";
import { Button, Spinner } from "./components/ui";

export interface Ctx {
  version: string;
  platform: string;
  config: LauncherConfig;
  profiles: Profile[];
  activeProfile: Profile | null;
  versions: McVersionMeta[];
  auth: AuthState;
  setProfiles: (p: Profile[]) => void;
  setActive: (id: string | null) => Promise<void>;
  saveConfig: (patch: Partial<LauncherConfig>) => Promise<void>;
  refreshVersions: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  reload: () => Promise<void>;
}

function LoadingScreen({ error }: { error: string | null }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <img src="icon.png" alt="AnLauncher" className="h-16 w-16 rounded-2xl" />
      <div className="text-lg font-semibold">AnLauncher</div>
      {error ? (
        <div className="max-w-sm text-center text-sm text-danger">{error}</div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Загрузка…
        </div>
      )}
      <div className="text-xs text-muted/60">v{launcherVersion}</div>
    </div>
  );
}

export default function App() {
  const [init, setInit] = useState<InitData | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("mods");

  const load = useCallback(async () => {
    try {
      const data = await api.getInit();
      setInit(data);
    } catch (e) {
      setInitError(String((e as Error).message || e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // подписка на смену авторизации
  useEffect(() => {
    const off = api.onAuth((a) => {
      setInit((prev) => (prev ? { ...prev, auth: a } : prev));
    });
    return () => {
      off();
    };
  }, []);

  const ctx: Ctx | null = useMemo(() => {
    if (!init) return null;
    const activeProfile = init.profiles.find((p) => p.id === init.activeProfileId) || null;
    return {
      version: init.version,
      platform: init.platform,
      config: init.config,
      profiles: init.profiles,
      activeProfile,
      versions: init.versions,
      auth: init.auth,
      setProfiles: (profiles) => setInit((prev) => (prev ? { ...prev, profiles, activeProfileId: prev.activeProfileId } : prev)),
      setActive: async (id) => {
        const newId = await api.setActiveProfile(id);
        setInit((prev) => (prev ? { ...prev, activeProfileId: newId } : prev));
      },
      saveConfig: async (patch) => {
        const nextCfg = await api.saveSettings(patch);
        setInit((prev) => (prev ? { ...prev, config: nextCfg } : prev));
      },
      refreshVersions: async () => {
        const v = await api.refreshVersions();
        setInit((prev) => (prev ? { ...prev, versions: v } : prev));
      },
      refreshAuth: async () => {
        const a = await api.getAuthState();
        setInit((prev) => (prev ? { ...prev, auth: a } : prev));
      },
      reload: load,
    };
  }, [init, load]);

  if (!init) {
    return (
      <div className="h-full">
        <LoadingScreen error={initError} />
        {initError && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
            <Button variant="outline" onClick={load}>
              Повторить
            </Button>
          </div>
        )}
      </div>
    );
  }
  if (!ctx) return <LoadingScreen error={null} />;

  return (
    <div className="flex h-full">
      <Sidebar
        tab={tab}
        onTab={setTab}
        version={launcherVersion}
        demo={!isElectron}
        activeProfile={ctx.activeProfile}
        auth={ctx.auth}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        {tab === "mods" && <ModsView ctx={ctx} />}
        {tab === "profiles" && <ProfilesView ctx={ctx} />}
        {tab === "settings" && <SettingsView ctx={ctx} />}
      </main>
    </div>
  );
}
