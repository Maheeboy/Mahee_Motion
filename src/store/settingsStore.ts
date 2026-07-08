import { create } from "zustand";
import type { MaheeSettings, SettingsSectionId, ShortcutBinding } from "../types/settings";
import {
  applySettingsToDocument,
  defaultSettings,
  loadSettingsFromStorage,
  normalizeSettings,
  resetAllSettings,
  resetSettingsSection,
  saveSettingsToStorage,
  shortcutFromKeyboardEvent
} from "../utils/appSettings";

interface SettingsStore {
  settings: MaheeSettings;
  activeSection: SettingsSectionId;
  search: string;
  recordingShortcutId?: string;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  setActiveSection: (section: SettingsSectionId) => void;
  setSearch: (search: string) => void;
  updateSection: <T extends SettingsSectionId>(section: T, patch: Partial<MaheeSettings[T]>) => void;
  resetSection: (section: SettingsSectionId) => void;
  resetAll: () => void;
  saveCurrentWorkspace: () => void;
  resetWorkspace: () => void;
  startShortcutRecording: (shortcutId: string) => void;
  recordShortcut: (event: KeyboardEvent) => void;
  resetShortcut: (shortcutId: string) => void;
  resetShortcuts: () => void;
  importShortcutProfile: (shortcuts: ShortcutBinding[]) => void;
}

function persist(settings: MaheeSettings): MaheeSettings {
  const normalized = normalizeSettings(settings);
  saveSettingsToStorage(normalized);
  applySettingsToDocument(normalized);
  return normalized;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: persist(loadSettingsFromStorage()),
  activeSection: "general",
  search: "",
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, recordingShortcutId: undefined }),
  setActiveSection: (activeSection) => set({ activeSection }),
  setSearch: (search) => set({ search }),
  updateSection: (section, patch) => set((state) => ({
    settings: persist({
      ...state.settings,
      [section]: {
        ...state.settings[section],
        ...patch
      }
    })
  })),
  resetSection: (section) => set((state) => ({ settings: persist(resetSettingsSection(state.settings, section)) })),
  resetAll: () => set({ settings: persist(resetAllSettings()), activeSection: "general", recordingShortcutId: undefined }),
  saveCurrentWorkspace: () => set((state) => ({ settings: persist({ ...state.settings, workspace: { ...state.settings.workspace, rememberPanelSizes: true, rememberCollapsedSections: true } }) })),
  resetWorkspace: () => set((state) => ({ settings: persist(resetSettingsSection(state.settings, "workspace")) })),
  startShortcutRecording: (recordingShortcutId) => set({ recordingShortcutId }),
  recordShortcut: (event) => {
    const recordingShortcutId = get().recordingShortcutId;
    if (!recordingShortcutId) return;
    event.preventDefault();
    const shortcut = shortcutFromKeyboardEvent(event);
    if (!shortcut) return;
    set((state) => ({
      recordingShortcutId: undefined,
      settings: persist({
        ...state.settings,
        keyboardShortcuts: {
          shortcuts: state.settings.keyboardShortcuts.shortcuts.map((binding) => binding.id === recordingShortcutId ? { ...binding, keys: shortcut } : binding)
        }
      })
    }));
  },
  resetShortcut: (shortcutId) => set((state) => ({
    settings: persist({
      ...state.settings,
      keyboardShortcuts: {
        shortcuts: state.settings.keyboardShortcuts.shortcuts.map((binding) => binding.id === shortcutId ? { ...binding, keys: binding.defaultKeys } : binding)
      }
    })
  })),
  resetShortcuts: () => set((state) => ({ settings: persist({ ...state.settings, keyboardShortcuts: defaultSettings().keyboardShortcuts }) })),
  importShortcutProfile: (shortcuts) => set((state) => ({ settings: persist({ ...state.settings, keyboardShortcuts: { shortcuts } }) }))
}));
