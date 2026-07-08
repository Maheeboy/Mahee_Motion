import { describe, expect, it } from "vitest";
import {
  SETTINGS_STORAGE_KEY,
  defaultSettings,
  loadSettingsFromStorage,
  migrateSettings,
  normalizeSettings,
  resetAllSettings,
  resetSettingsSection,
  saveSettingsToStorage,
  settingsToCssVariables,
  shortcutConflicts
} from "./appSettings";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("app settings", () => {
  it("creates complete default settings", () => {
    const settings = defaultSettings();
    expect(settings.version).toBe(1);
    expect(settings.general.autosaveEnabled).toBe(true);
    expect(settings.appearance.theme).toBe("dark");
    expect(settings.keyboardShortcuts.shortcuts.some((shortcut) => shortcut.id === "playPause")).toBe(true);
  });

  it("persists and loads settings from storage", () => {
    const storage = new MemoryStorage();
    const settings = defaultSettings();
    settings.appearance.fontSize = 17;
    saveSettingsToStorage(settings, storage);
    expect(storage.getItem(SETTINGS_STORAGE_KEY)).toContain("\"fontSize\":17");
    expect(loadSettingsFromStorage(storage).appearance.fontSize).toBe(17);
  });

  it("migrates partial settings without losing defaults", () => {
    const migrated = migrateSettings({
      general: { recentProjectCount: 7 },
      appearance: { accentColor: "#14b8a6" }
    });
    expect(migrated.general.recentProjectCount).toBe(7);
    expect(migrated.general.autosaveEnabled).toBe(true);
    expect(migrated.appearance.accentColor).toBe("#14b8a6");
    expect(migrated.timeline.snapToClipEdges).toBe(true);
  });

  it("resets a single section", () => {
    const settings = defaultSettings();
    settings.general.recentProjectCount = 3;
    settings.timeline.defaultZoom = 20;
    const reset = resetSettingsSection(settings, "general");
    expect(reset.general.recentProjectCount).toBe(defaultSettings().general.recentProjectCount);
    expect(reset.timeline.defaultZoom).toBe(20);
  });

  it("resets all settings", () => {
    expect(resetAllSettings()).toEqual(defaultSettings());
  });

  it("clamps invalid values", () => {
    const settings = normalizeSettings({
      general: { recentProjectCount: 500, autosaveIntervalSeconds: -1 },
      appearance: { fontSize: 100, timelineClipCornerRadius: -20, accentColor: "blue" },
      performance: { maxRamGb: -4, backgroundTaskLimit: 99 },
      export: { bitrateMbps: 999 }
    });
    expect(settings.general.recentProjectCount).toBe(50);
    expect(settings.general.autosaveIntervalSeconds).toBe(15);
    expect(settings.appearance.fontSize).toBe(20);
    expect(settings.appearance.timelineClipCornerRadius).toBe(0);
    expect(settings.appearance.accentColor).toBe(defaultSettings().appearance.accentColor);
    expect(settings.performance.maxRamGb).toBe(2);
    expect(settings.performance.backgroundTaskLimit).toBe(8);
    expect(settings.export.bitrateMbps).toBe(200);
  });

  it("exports theme variables for live UI application", () => {
    const settings = defaultSettings();
    settings.appearance.useCustomAccent = true;
    settings.appearance.customAccentColor = "#ef476f";
    settings.appearance.fontSize = 16;
    settings.appearance.timelineClipCornerRadius = 9;
    const vars = settingsToCssVariables(settings);
    expect(vars["--blue"]).toBe("#ef476f");
    expect(vars["--ui-font-size"]).toBe("16px");
    expect(vars["--timeline-clip-radius"]).toBe("9px");
  });

  it("detects shortcut conflicts", () => {
    const settings = defaultSettings();
    const bindings = settings.keyboardShortcuts.shortcuts.map((shortcut) => shortcut.id === "split" ? { ...shortcut, keys: "Space" } : shortcut);
    const conflicts = shortcutConflicts(bindings);
    expect(conflicts).toEqual([{ keys: "Space", ids: ["playPause", "split"] }]);
  });
});
