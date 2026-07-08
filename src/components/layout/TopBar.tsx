import { Bell, ChevronDown, Cloud, Download, HelpCircle, Redo2, Settings, Share2, Undo2, Zap } from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { useEditorStore } from "../../store/editorStore";
import { useSettingsStore } from "../../store/settingsStore";
import { createProject } from "../../utils/timeline";

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

  useEffect(() => {
    setDraftProjectName(projectName);
  }, [projectName]);

  const refreshRecentProjects = useCallback(async () => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const recent = await invoke<RecentProject[]>("list_recent_projects");
    setRecentProjects(recent);
  }, []);

  const recordRecentProject = useCallback(async (path: string) => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    await invoke<RecentProject[]>("record_recent_project", {
      path,
      projectId: useEditorStore.getState().project.id,
      projectName: useEditorStore.getState().project.name
    });
  }, []);

  const saveProject = useCallback(async () => {
    const path = currentProjectPath ?? await save({ filters: [{ name: "Mahee Motion Project", extensions: ["mmotion", "json"] }] });
    if (!path) return;
    await invoke("save_project_file", { path, json: projectJson() });
    markManualSave(path);
    await recordRecentProject(path);
    addToast("success", "Project saved.");
  }, [addToast, currentProjectPath, markManualSave, projectJson, recordRecentProject]);

  const openProject = useCallback(async () => {
    const path = await open({ multiple: false, filters: [{ name: "Mahee Motion Project", extensions: ["mmotion", "json"] }] });
    if (typeof path !== "string") return;
    const json = await invoke<string>("load_project_file", { path });
    loadProjectJson(json);
    setCurrentProjectPath(path);
    setSaveStatus("Saved just now");
    await recordRecentProject(path);
    addToast("success", "Project loaded.");
  }, [addToast, loadProjectJson, recordRecentProject, setCurrentProjectPath, setSaveStatus]);

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
