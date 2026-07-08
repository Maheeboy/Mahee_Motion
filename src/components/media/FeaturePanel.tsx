import { FolderCog, Import, MonitorDot, Plus, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "../../store/editorStore";
import { effectCategories } from "../../utils/effects";
import { animatedStickerPresets, staticStickerPresets } from "../../utils/stickers";
import { colorFilterPresets } from "../../utils/filters";
import { textStylePresets } from "../../utils/textStylePresets";
import { nearestTransitionDropZone, transitionDefinition, transitionDefinitions } from "../../utils/transitions";
import { beginTimelinePointerDrag } from "../../utils/timelineDomDrop";

const copy: Record<string, { title: string; detail: string; action?: string }> = {
  Audio: { title: "Audio tools", detail: "Import audio from the Media panel, then place it on any layer for music and SFX." },
  Text: { title: "Text and Captions", detail: "Add editable text clips to any layer and adjust them in the inspector.", action: "Add text clip" },
  Stickers: { title: "Stickers", detail: "Static stickers are ready to add directly to the timeline." },
  Effects: { title: "Effects", detail: "Select a video or image clip, then add non-destructive effects." },
  Transitions: { title: "Transitions", detail: "Drag a transition onto a visual cut or clip edge." },
  Filters: { title: "Filters", detail: "Add color correction looks as timeline layers above clips." },
  "Screen Recorder": { title: "Screen recorder", detail: "Record the screen, save it to your chosen folder, then import the clip into this project.", action: "Open recorder" }
};

const recorderPathKey = "mahee-motion-recorder-output-dir";

export function FeaturePanel() {
  const activePanel = useEditorStore((state) => state.activePanel);
  const addTextStylePresetToTimeline = useEditorStore((state) => state.addTextStylePresetToTimeline);
  const addStickerToTimeline = useEditorStore((state) => state.addStickerToTimeline);
  const addEffectPresetToSelected = useEditorStore((state) => state.addEffectPresetToSelected);
  const applyColorFilterPresetToSelected = useEditorStore((state) => state.applyColorFilterPresetToSelected);
  const addTransitionToTimeline = useEditorStore((state) => state.addTransitionToTimeline);
  const addToast = useEditorStore((state) => state.addToast);
  const project = useEditorStore((state) => state.project);
  const panel = copy[activePanel] ?? copy.Audio;
  const isText = activePanel === "Text";
  const isStickers = activePanel === "Stickers";
  const isEffects = activePanel === "Effects";
  const isTransitions = activePanel === "Transitions";
  const isFilters = activePanel === "Filters";
  const isRecorder = activePanel === "Screen Recorder";
  const [stickerCategory, setStickerCategory] = useState<"static" | "animated">("static");
  const suppressClickRef = useRef(false);
  const [recorderPath, setRecorderPath] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(recorderPathKey) ?? "";
  });

  useEffect(() => {
    const onPathUpdated = (event: Event) => {
      setRecorderPath((event as Event & { detail?: string }).detail ?? "");
    };
    window.addEventListener("screen-recorder-path-updated", onPathUpdated);
    return () => window.removeEventListener("screen-recorder-path-updated", onPathUpdated);
  }, []);

  const addTransitionAtPlayhead = (transitionId: string) => {
    const definition = transitionDefinition(transitionId);
    const zone = nearestTransitionDropZone(project.timeline, project.timeline.playhead, definition.defaultDuration);
    if (!zone.valid || !zone.trackId) {
      addToast("error", zone.reason ?? "Move the playhead near a visual cut or clip edge.");
      return;
    }
    addTransitionToTimeline(transitionId, zone.trackId, zone.time);
  };

  const dragState = (dragging: boolean) => {
    if (dragging) suppressClickRef.current = true;
    else setTimeout(() => { suppressClickRef.current = false; }, 0);
  };

  return (
    <aside className={`feature-panel media-panel ${isText || isStickers || isEffects || isTransitions || isFilters || isRecorder ? "text-feature-panel" : ""} ${isStickers ? "stickers-feature-panel" : ""} ${isEffects ? "effects-feature-panel" : ""} ${isTransitions ? "transitions-feature-panel" : ""} ${isFilters ? "filters-feature-panel" : ""} ${isRecorder ? "screen-recorder-feature-panel" : ""}`}>
      {!isText && !isStickers && !isEffects && !isTransitions && !isFilters && !isRecorder && (
        <div className="feature-panel-header">
          <span>{activePanel}</span>
        </div>
      )}
      <div className={`feature-panel-body ${isText || isStickers || isEffects || isTransitions || isFilters ? "text-feature-body" : ""} ${isStickers ? "stickers-feature-body" : ""} ${isEffects ? "effects-feature-body" : ""} ${isTransitions ? "transitions-feature-body" : ""} ${isFilters ? "filters-feature-body" : ""}`}>
        {!isText && !isStickers && !isEffects && !isTransitions && !isFilters && !isRecorder && (
          <div className="feature-icon">
            {activePanel === "Audio" ? <Import size={30} /> : <Sparkles size={30} />}
          </div>
        )}
        {!isRecorder && !isTransitions && <h2>{panel.title}</h2>}
        {!isText && !isStickers && !isEffects && !isTransitions && !isFilters && !isRecorder && <p>{panel.detail}</p>}
        {isText ? (
          <div className="text-browser">
            <section>
              <h3>Text presets</h3>
              <div className="text-style-grid">
                {textStylePresets.map((preset) => (
                  <button
                    className={`text-style-card text-style-${preset.id}`}
                    key={preset.id}
                    onPointerDown={(event) => beginTimelinePointerDrag(
                      event,
                      preset.name,
                      (drop) => addTextStylePresetToTimeline(preset.id, drop.time, drop.trackId),
                      () => addToast("error", "Drop text onto a timeline layer."),
                      dragState
                    )}
                    onClick={(event) => {
                      if (suppressClickRef.current) {
                        event.preventDefault();
                        return;
                      }
                      addTextStylePresetToTimeline(preset.id);
                    }}
                    title={`Add ${preset.name} text preset`}
                  >
                    <span>{preset.sample}</span>
                    <strong>{preset.name}</strong>
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : isStickers ? (
          <div className="stickers-panel">
            <div className="sticker-category-tabs" role="tablist" aria-label="Sticker categories">
              <button className={stickerCategory === "static" ? "active" : ""} type="button" role="tab" aria-selected={stickerCategory === "static"} onClick={() => setStickerCategory("static")}>Static</button>
              <button className={stickerCategory === "animated" ? "active" : ""} type="button" role="tab" aria-selected={stickerCategory === "animated"} onClick={() => setStickerCategory("animated")}>Animated</button>
            </div>
            <div className="sticker-grid">
              {(stickerCategory === "static" ? staticStickerPresets : animatedStickerPresets).map((sticker) => (
                <button
                  className={`sticker-card ${sticker.animation ? `animated-sticker-card sticker-loop-${sticker.animation}` : ""}`}
                  aria-label={`Add ${sticker.label} sticker to the timeline`}
                  key={sticker.id}
                  title={`Add ${sticker.label} sticker to the timeline`}
                  onPointerDown={(event) => beginTimelinePointerDrag(
                    event,
                    sticker.label,
                    (drop) => addStickerToTimeline(sticker, drop.time, drop.trackId),
                    () => addToast("error", "Drop stickers onto a timeline layer."),
                    dragState
                  )}
                  onClick={(event) => {
                    if (suppressClickRef.current) {
                      event.preventDefault();
                      return;
                    }
                    addStickerToTimeline(sticker);
                  }}
                >
                  <span className="sticker-premium-mark" aria-hidden="true" />
                  <span className="sticker-thumb">
                    <img src={sticker.path} alt="" />
                    <i aria-hidden="true"><Plus size={13} /></i>
                  </span>
                  <strong>{sticker.label}</strong>
                </button>
              ))}
            </div>
          </div>
        ) : isEffects ? (
          <div className="effects-reference-grid">
            {effectCategories.map((category) => {
              const preset = category.presets[0];
              return (
                <button
                  className={`effect-reference-card effect-${category.type}`}
                  key={category.type}
                  title={`Add ${category.name} to the timeline`}
                  onPointerDown={(event) => beginTimelinePointerDrag(
                    event,
                    category.name,
                    (drop) => addEffectPresetToSelected(preset.id, drop.time, drop.trackId),
                    () => addToast("error", "Drop effects onto a timeline layer."),
                    dragState
                  )}
                  onClick={(event) => {
                    if (suppressClickRef.current) {
                      event.preventDefault();
                      return;
                    }
                    addEffectPresetToSelected(preset.id);
                  }}
                >
                  <span className="effect-reference-thumb">
                    <img src={`/effects/${category.type}.png`} alt="" />
                    <i aria-hidden="true">+</i>
                  </span>
                  <strong>{category.name.replace(" / Bloom", "").replace(" / Retro Tape", "")}</strong>
                </button>
              );
            })}
          </div>
        ) : isTransitions ? (
          <div className="transitions-browser">
            <h2>Transitions</h2>
            <div className="transition-reference-grid">
              {transitionDefinitions.map((transition) => (
                <button
                  className="transition-reference-card"
                  draggable
                  key={transition.id}
                  title={`Drag ${transition.name} between two adjacent visual clips, or click + to add near the playhead`}
                  onPointerDown={(event) => beginTimelinePointerDrag(
                    event,
                    transition.name,
                    (drop) => addTransitionToTimeline(transition.id, drop.trackId, drop.time),
                    () => addToast("error", "Drop transitions onto a cut or edge on a visual layer."),
                    dragState
                  )}
                  onClick={(event) => {
                    if (suppressClickRef.current) {
                      event.preventDefault();
                      return;
                    }
                    addTransitionAtPlayhead(transition.id);
                  }}
                  onDragStart={(event) => {
                    event.dataTransfer.clearData();
                    event.dataTransfer.setData("application/x-mahee-transition", transition.id);
                    event.dataTransfer.setData("text/plain", `mahee-transition:${transition.id}`);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                >
                  <span className="transition-reference-thumb">
                    <img src={transition.previewPath} alt="" draggable={false} />
                    <i aria-hidden="true">+</i>
                  </span>
                  <strong>{transition.name}</strong>
                </button>
              ))}
            </div>
          </div>
        ) : isFilters ? (
          <div className="filters-reference-grid">
            {colorFilterPresets.map((filter) => (
              <button
                className="filter-reference-card"
                key={filter.id}
                title={`Add ${filter.name} as a filter layer`}
                onPointerDown={(event) => beginTimelinePointerDrag(
                  event,
                  filter.name,
                  (drop) => applyColorFilterPresetToSelected(filter.id, drop.time, drop.trackId),
                  () => addToast("error", "Drop filters onto a timeline layer."),
                  dragState
                )}
                onClick={(event) => {
                  if (suppressClickRef.current) {
                    event.preventDefault();
                    return;
                  }
                  applyColorFilterPresetToSelected(filter.id);
                }}
              >
                <span className="filter-reference-thumb">
                  <img src={filter.previewPath} alt="" />
                </span>
                <strong>{filter.name}</strong>
              </button>
            ))}
          </div>
        ) : isRecorder ? (
          <div className="screen-recorder-panel">
            <div className="screen-recorder-hero">
              <MonitorDot size={30} />
              <div>
                <span>Screen Recorder</span>
                <strong>Capture your screen, then bring it straight into the edit.</strong>
              </div>
            </div>
            <div className="recorder-steps">
              <span>1. Choose the folder where every recording should be saved.</span>
              <span>2. Open the recorder and use its Start / Stop controls.</span>
              <span>3. When a recording finishes, Mahee will ask whether to add it to the timeline.</span>
            </div>
            <div className="recorder-path-card">
              <small>Save folder</small>
              <strong title={recorderPath || "No folder selected"}>{recorderPath || "No folder selected"}</strong>
            </div>
            <div className="recorder-actions">
              <button onClick={() => window.dispatchEvent(new Event("configure-screen-recorder-path"))}>
                <FolderCog size={16} /> Configure path
              </button>
              <button className="primary" onClick={() => window.dispatchEvent(new Event("open-screen-recorder"))}>
                <MonitorDot size={16} /> Open recorder
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => {
              addToast("info", `${activePanel} panel is wired and ready for the next feature pass.`);
            }}
          >
            {panel.action ?? "Acknowledge"}
          </button>
        )}
      </div>
    </aside>
  );
}
