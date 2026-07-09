/* global Blob, File, URL */
import { Bell, ChevronDown, Cloud, Download, HelpCircle, Redo2, Settings, Share2, Undo2, Zap } from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { useEditorStore } from "../../store/editorStore";
import { useSettingsStore } from "../../store/settingsStore";
import { createProject } from "../../utils/timeline";
import { isTauriRuntime } from "../../utils/runtime";

interface RecentProject {
  path: string;
  projectId: string;
  projectName: string;
  updatedAt: string;
}

interface TopBarProps {
  recoveryCount?: number;
  onOpenRecoveries?: () => void;
}

export function TopBar({ recoveryCount = 0, onOpenRecoveries }: TopBarProps) {
  const projectName = useEditorStore((state) => state.project.name);
  const project = useEditorStore((state) => state.project);
  const projectJson = useEditorStore((state) => state.projectJson);
  const loadProjectJson = useEditorStore((state) => state.loadProjectJson);
  const setProject = useEditorStore((state) => state.setProject);
  const currentProjectPath = useEditorStore((state) => state.currentProjectPath);
  const setCurrentProjectPath = useEditorStore((state) => state.setCurrentProjectPath);
  const markManualSave = useEditorStore((state) => state.markManualSave);
  const setSaveStatus = useEditorStore((state) => state.setSaveStatus);
  const updateProjectName = useEditorStore((state) => state.updateProjectName);
  const saveStatus = useEditorStore((state) => state.saveStatus);
  const addToast = useEditorStore((state) => state.addToast);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const openSettings = useSettingsStore((state) => state.open);
  const [recentOpen, setRecentOpen] = useState(false);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [draftProjectName, setDraftProjectName] = useState(projectName);
  const [webProjectInput, setWebProjectInput] = useState<HTMLInputElement | null>(null);
  const isTauri = isTauriRuntime();

  useEffect(() => {
    setDraftProjectName(projectName);
  }, [projectName]);

  const refreshRecentProjects = useCallback(async () => {
    if (!isTauri) return;
    const recent = await invoke<RecentProject[]>("list_recent_projects");
    setRecentProjects(recent);
  }, [isTauri]);

  const recordRecentProject = useCallback(async (path: string) => {
    if (!isTauri) return;
    await invoke<RecentProject[]>("record_recent_project", {
      path,
      projectId: useEditorStore.getState().project.id,
      projectName: useEditorStore.getState().project.name
    });
  }, [isTauri]);

  const saveProject = useCallback(async () => {
    if (!isTauri) {
      const blob = new Blob([projectJson()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${(project.name.trim() || "Unknown").replace(/[\\/:*?"<>|]+/g, "-")}.mmotion`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      markManualSave(anchor.download);
      addToast("success", "Project downloaded as a .mmotion file.");
      return;
    }
    const path = currentProjectPath ?? await save({ filters: [{ name: "Mahee Motion Project", extensions: ["mmotion", "json"] }] });
    if (!path) return;
    await invoke("save_project_file", { path, json: projectJson() });
    markManualSave(path);
    await recordRecentProject(path);
    addToast("success", "Project saved.");
  }, [addToast, currentProjectPath, isTauri, markManualSave, project.name, projectJson, recordRecentProject]);

  const openProject = useCallback(async () => {
    if (!isTauri) {
      webProjectInput?.click();
      return;
    }
    const path = await open({ multiple: false, filters: [{ name: "Mahee Motion Project", extensions: ["mmotion", "json"] }] });
    if (typeof path !== "string") return;
    const json = await invoke<string>("load_project_file", { path });
    loadProjectJson(json);
    setCurrentProjectPath(path);
    setSaveStatus("Saved just now");
    await recordRecentProject(path);
    addToast("success", "Project loaded.");
  }, [addToast, isTauri, loadProjectJson, recordRecentProject, setCurrentProjectPath, setSaveStatus, webProjectInput]);

  const openWebProjectFile = useCallback(async (file: File) => {
    try {
      const json = await file.text();
      loadProjectJson(json);
      setCurrentProjectPath(file.name);
      setSaveStatus("Saved just now");
      setRecentOpen(false);
      addToast("success", "Project loaded from your computer.");
    } catch (error) {
      addToast("error", `Could not open project: ${String(error)}`);
    }
  }, [addToast, loadProjectJson, setCurrentProjectPath, setSaveStatus]);

  const openRecentProject = useCallback(async (path: string) => {
    const json = await invoke<string>("load_project_file", { path });
    loadProjectJson(json);
    setCurrentProjectPath(path);
    setSaveStatus("Saved just now");
    await recordRecentProject(path);
    setRecentOpen(false);
    addToast("success", "Recent project loaded.");
  }, [addToast, loadProjectJson, recordRecentProject, setCurrentProjectPath, setSaveStatus]);

  const removeRecentProject = useCallback(async (path: string) => {
    const recent = await invoke<RecentProject[]>("remove_recent_project", { path });
    setRecentProjects(recent);
  }, []);

  const newProject = useCallback(() => {
    setProject(createProject("Unknown"));
    setCurrentProjectPath(undefined);
    setSaveStatus("Unsaved changes");
    setRecentOpen(false);
    addToast("success", "New project created.");
  }, [addToast, setCurrentProjectPath, setProject, setSaveStatus]);

  useEffect(() => {
    const saveListener = () => void saveProject();
    const openListener = () => void openProject();
    window.addEventListener("save-project", saveListener);
    window.addEventListener("open-project", openListener);
    return () => {
      window.removeEventListener("save-project", saveListener);
      window.removeEventListener("open-project", openListener);
    };
  }, [openProject, saveProject]);

  useEffect(() => {
    if (recentOpen) void refreshRecentProjects();
  }, [recentOpen, refreshRecentProjects]);

  return (
    <header className="top-bar">
      <input
        ref={setWebProjectInput}
        className="project-file-input"
        type="file"
        accept=".mmotion,.json,application/json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void openWebProjectFile(file);
        }}
      />
      <div className="brand">
        <Zap size={27} fill="#0ea5ff" strokeWidth={2.4} />
        <span>Mahee Motion</span>
      </div>
      <button className="project-switcher" onClick={() => setRecentOpen((open) => !open)} title="Open recent projects">
        <span>Project</span>
        <strong>{projectName}</strong>
        <ChevronDown size={16} />
      </button>
      <div className="top-actions center">
        <button onClick={undo} title="Undo (Ctrl+Z)"><Undo2 size={19} /></button>
        <button onClick={redo} title="Redo (Ctrl+Y)"><Redo2 size={19} /></button>
        <span className="divider" />
        <Cloud size={18} />
        <span className="save-status">{saveStatus}</span>
      </div>
      <div className="top-actions right">
        <button className="notification-button" title="Notifications" onClick={onOpenRecoveries}>
          <Bell size={18} />
          {recoveryCount > 0 && <span>{recoveryCount}</span>}
        </button>
        <button title="Help"><HelpCircle size={18} /></button>
        <button title="Settings" onClick={openSettings}><Settings size={18} /></button>
        <button className="secondary" onClick={openProject}>Open</button>
        <button className="secondary" onClick={saveProject}><Share2 size={16} /> Save</button>
        <button className="primary" onClick={() => window.dispatchEvent(new Event("open-export-dialog"))}>
          <Download size={16} /> Export <ChevronDown size={15} />
        </button>
      </div>
      {recentOpen && (
        <div className="recent-projects-popover">
          <header>
            <strong>Project</strong>
            <div className="project-menu-actions">
              <button onClick={newProject}>New Project</button>
              <button onClick={openProject}>Open File</button>
            </div>
          </header>
          <label className="project-rename-field">
            <span>Project name</span>
            <input
              value={draftProjectName}
              onChange={(event) => setDraftProjectName(event.target.value)}
              onBlur={() => updateProjectName(draftProjectName)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  updateProjectName(draftProjectName);
                  event.currentTarget.blur();
                }
              }}
            />
          </label>
          {recentProjects.length ? recentProjects.map((item) => (
            <div className="recent-project-row" key={item.path}>
              <button onClick={() => void openRecentProject(item.path)}>
                <strong>{item.projectName || project.name}</strong>
                <span>{item.path}</span>
              </button>
              <button title="Remove recent project" onClick={() => void removeRecentProject(item.path)}>Remove</button>
            </div>
          )) : (
            <p>No recent projects yet.</p>
          )}
        </div>
      )}
    </header>
  );
}
