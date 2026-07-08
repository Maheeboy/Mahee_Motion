import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Blend,
  ClipboardPaste,
  Copy,
  Crop,
  Diamond,
  Gauge,
  Hexagon,
  Layers,
  Palette,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Type,
  Volume2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useEditorStore } from "../../store/editorStore";
import type { AudioKeyframe, BackgroundRemovalSettings, BlendMode, ColorGrade, ColorKeyframe, CurvePoint, EffectInstance, EffectParamValue, HslRangeName, MaskInstance, MaskKeyframe, MaskType, SpeedKeyframe, TextAnimation, TextAnimationSide, TextSettings, TransformKeyframe, TransitionDirection, TransitionEasing, TransitionInstance, VideoAnimationSide, VideoClipAnimation } from "../../types/editor";
import { defaultAudioSettings, defaultColorSettings, defaultTextSettings, defaultTransform, evaluateAudioAtTime, evaluateColorAtTime, evaluateSpeedAtTime, evaluateTransformAtTime, findClip } from "../../utils/timeline";
import { formatTimecode } from "../../utils/time";
import { textFontOptions } from "../../utils/textFonts";
import { builtInColorPresets, normalizeColorSettings } from "../../utils/colorGrade";
import { effectDisplayName, normalizeEffects } from "../../utils/effects";
import { bezierBounds, evaluateMaskAtTime, maskTypes, normalizeMasks } from "../../utils/masks";
import { inTextAnimationPresets, normalizeTextClipAnimations, outTextAnimationPresets } from "../../utils/textAnimations";
import { inVideoAnimationPresets, normalizeVideoClipAnimations, outVideoAnimationPresets } from "../../utils/videoAnimations";
import { applyModeDefaults, backgroundRemovalModes, defaultBackgroundRemovalSettings, normalizeBackgroundRemovalSettings } from "../../utils/backgroundRemoval";
import { transitionDefinition, transitionDefinitions } from "../../utils/transitions";

export function InspectorPanel() {
  const [visualTab, setVisualTab] = useState<"basic" | "color" | "mask" | "animation">("basic");
  const [colorTab, setColorTab] = useState<"basic" | "lut" | "hsl" | "curves">("basic");
  const [hslRange, setHslRange] = useState<HslRangeName>("red");
  const [curveChannel, setCurveChannel] = useState<"master" | "red" | "green" | "blue">("master");
  const [textAnimationSide, setTextAnimationSide] = useState<TextAnimationSide>("in");
  const [videoAnimationSide, setVideoAnimationSide] = useState<VideoAnimationSide>("in");
  const [selectedMaskId, setSelectedMaskId] = useState<string>();
  const project = useEditorStore((state) => state.project);
  const updateTransform = useEditorStore((state) => state.updateSelectedTransform);
  const updateCrop = useEditorStore((state) => state.updateSelectedCrop);
  const updateAudio = useEditorStore((state) => state.updateSelectedAudio);
  const updateColor = useEditorStore((state) => state.updateSelectedColor);
  const addTransformKeyframe = useEditorStore((state) => state.addSelectedTransformKeyframe);
  const addAudioKeyframe = useEditorStore((state) => state.addSelectedAudioKeyframe);
  const addSpeedKeyframe = useEditorStore((state) => state.addSelectedSpeedKeyframe);
  const addColorKeyframe = useEditorStore((state) => state.addSelectedColorKeyframe);
  const removeKeyframe = useEditorStore((state) => state.removeSelectedKeyframe);
  const updateSpeed = useEditorStore((state) => state.updateSelectedSpeed);
  const updateText = useEditorStore((state) => state.updateSelectedText);
  const updateTextAnimation = useEditorStore((state) => state.updateSelectedTextAnimation);
  const applyTextAnimationPreset = useEditorStore((state) => state.applySelectedTextAnimationPreset);
  const resetTextAnimation = useEditorStore((state) => state.resetSelectedTextAnimation);
  const updateVideoAnimation = useEditorStore((state) => state.updateSelectedVideoAnimation);
  const applyVideoAnimationPreset = useEditorStore((state) => state.applySelectedVideoAnimationPreset);
  const resetVideoAnimation = useEditorStore((state) => state.resetSelectedVideoAnimation);
  const updateProjectSettings = useEditorStore((state) => state.updateProjectSettings);
  const copySelectedClipProperties = useEditorStore((state) => state.copySelectedClipProperties);
  const pasteClipProperties = useEditorStore((state) => state.pasteClipProperties);
  const applyTransformAction = useEditorStore((state) => state.applyTransformAction);
  const applySpeedPreset = useEditorStore((state) => state.applySpeedPreset);
  const removeEffect = useEditorStore((state) => state.removeSelectedEffect);
  const toggleEffect = useEditorStore((state) => state.toggleSelectedEffect);
  const resetEffect = useEditorStore((state) => state.resetSelectedEffect);
  const updateEffect = useEditorStore((state) => state.updateSelectedEffect);
  const moveEffect = useEditorStore((state) => state.moveSelectedEffect);
  const copyEffects = useEditorStore((state) => state.copySelectedEffects);
  const pasteEffects = useEditorStore((state) => state.pasteEffectsToSelected);
  const addMask = useEditorStore((state) => state.addMaskToSelected);
  const updateMask = useEditorStore((state) => state.updateSelectedMask);
  const removeMask = useEditorStore((state) => state.removeSelectedMask);
  const duplicateMask = useEditorStore((state) => state.duplicateSelectedMask);
  const moveMask = useEditorStore((state) => state.moveSelectedMask);
  const copyMasks = useEditorStore((state) => state.copySelectedMasks);
  const pasteMasks = useEditorStore((state) => state.pasteMasksToSelected);
  const addMaskKeyframe = useEditorStore((state) => state.addSelectedMaskKeyframe);
  const removeMaskKeyframe = useEditorStore((state) => state.removeSelectedMaskKeyframe);
  const updateBackgroundRemoval = useEditorStore((state) => state.updateSelectedBackgroundRemoval);
  const updateSelectedTransition = useEditorStore((state) => state.updateSelectedTransition);
  const removeSelectedTransition = useEditorStore((state) => state.removeSelectedTransition);
  const replaceSelectedTransition = useEditorStore((state) => state.replaceSelectedTransition);
  const copySelectedTransition = useEditorStore((state) => state.copySelectedTransition);
  const pasteTransitionSettings = useEditorStore((state) => state.pasteTransitionSettings);
  const clip = project.timeline.selectedClipIds[0] ? findClip(project.timeline, project.timeline.selectedClipIds[0]) : undefined;
  const selectedTransition = project.timeline.selectedTransitionId
    ? (project.timeline.transitions ?? []).find((transition) => transition.id === project.timeline.selectedTransitionId)
    : undefined;
  const isEffectClip = clip?.type === "effect";
  const isFilterClip = clip?.type === "filter";
  const isVisual = Boolean(clip && clip.type !== "audio" && clip.type !== "effect" && clip.type !== "filter" && clip.type !== "compound");
  const isColorCapable = clip?.type === "video" || clip?.type === "image" || isFilterClip;
  const isVideoAnimationCapable = clip?.type === "video" || clip?.type === "image";
  const isMaskCapable = isVisual && clip?.type !== "text";
  const isCropCapable = clip?.type === "video" || clip?.type === "image";
  const isAudio = clip?.type === "audio" || clip?.type === "video";
  const showingMaskTab = isMaskCapable && visualTab === "mask";
  const showingTextAnimationTab = clip?.type === "text" && visualTab === "animation";
  const showingVideoAnimationTab = isVideoAnimationCapable && visualTab === "animation";
  const panelTitle = selectedTransition ? "Transition Inspector" : clip ? `${clip.type[0].toUpperCase()}${clip.type.slice(1)} Inspector` : "Project Inspector";
  const centeredTransform = { ...defaultTransform(), x: project.timeline.width / 2, y: project.timeline.height / 2 };
  const currentTransform = clip ? evaluateTransformAtTime(clip, project.timeline.playhead, centeredTransform) : centeredTransform;
  const currentAudio = clip ? evaluateAudioAtTime(clip, project.timeline.playhead) : defaultAudioSettings();
  const currentSpeed = clip ? evaluateSpeedAtTime(clip, project.timeline.playhead) : 1;
  const currentColor = clip ? evaluateColorAtTime(clip, project.timeline.playhead) : normalizeColorSettings(defaultColorSettings());
  const clipEffects = clip ? normalizeEffects(clip.effects, clip.duration) : [];
  const clipMasks = useMemo(() => clip && isVisual ? normalizeMasks(clip.masks, project.timeline) : [], [clip, isVisual, project.timeline]);
  const selectedMask = clip && clipMasks.length ? clipMasks.find((mask) => mask.id === selectedMaskId) ?? clipMasks[0] : undefined;
  const currentMask = clip && selectedMask ? evaluateMaskAtTime(selectedMask, clip, project.timeline.playhead) : undefined;

  useEffect(() => {
    if (!clipMasks.length) setSelectedMaskId(undefined);
    else if (!clipMasks.some((mask) => mask.id === selectedMaskId)) setSelectedMaskId(clipMasks[0].id);
  }, [clip?.id, clipMasks, selectedMaskId]);

  useEffect(() => {
    if (isFilterClip && visualTab !== "color") setVisualTab("color");
    if (visualTab === "color" && !isColorCapable) setVisualTab("basic");
    if (visualTab === "mask" && !isMaskCapable) setVisualTab("basic");
    if (visualTab === "animation" && clip?.type !== "text" && !isVideoAnimationCapable) setVisualTab("basic");
  }, [clip?.type, isColorCapable, isFilterClip, isMaskCapable, isVideoAnimationCapable, visualTab]);

  return (
    <aside className="inspector-panel">
      <header className="inspector-head">
        <div>
          <strong>{panelTitle}</strong>
        </div>
        <em>{selectedTransition ? transitionDefinition(selectedTransition.type).name : clip ? clip.name : formatTimecode(project.timeline.duration, project.timeline.fps)}</em>
      </header>
      {selectedTransition ? (
        <TransitionInspector
          transition={selectedTransition}
          onChange={updateSelectedTransition}
          onCopy={copySelectedTransition}
          onDelete={removeSelectedTransition}
          onPaste={pasteTransitionSettings}
          onReplace={replaceSelectedTransition}
        />
      ) : !clip ? (
        <div className="inspector-scroll">
          <section className="inspector-card">
            <SectionTitle icon={<SlidersHorizontal size={16} />} label="Project Settings" />
            <div className="field-row two">
              <label>Resolution</label>
              <NumberInput value={project.settings.width} min={320} max={7680} onChange={(value) => updateProjectSettings({ width: value })} />
              <NumberInput value={project.settings.height} min={240} max={4320} onChange={(value) => updateProjectSettings({ height: value })} />
            </div>
            <Range label="FPS" value={project.settings.fps} min={24} max={60} step={1} suffix="" onChange={(value) => updateProjectSettings({ fps: value })} />
            <Range label="Sample Rate" value={project.settings.sampleRate} min={32000} max={48000} step={1000} suffix=" Hz" onChange={(value) => updateProjectSettings({ sampleRate: value })} />
          </section>
          <section className="inspector-card">
            <SectionTitle icon={<Gauge size={16} />} label="Timeline Summary" />
            <div className="info-grid">
              <span>Duration</span><strong>{formatTimecode(project.timeline.duration, project.timeline.fps)}</strong>
              <span>Tracks</span><strong>{project.timeline.tracks.length}</strong>
              <span>Assets</span><strong>{Object.keys(project.assets).length}</strong>
            </div>
          </section>
        </div>
      ) : (
        <div className="inspector-scroll">
          {clip.type === "compound" && (
            <section className="inspector-card compound-summary">
              <SectionTitle icon={<Layers size={16} />} label="Compound Clip" />
              <div className="info-grid">
                <span>Contained clips</span><strong>{clip.compound?.clips.length ?? 0}</strong>
                <span>Duration</span><strong>{formatTimecode(clip.duration, project.timeline.fps)}</strong>
                <span>Editing</span><strong>Non-destructive</strong>
              </div>
            </section>
          )}
          {isVisual && (
            <div className={`inspector-tabs ${isMaskCapable && isColorCapable && (clip.type === "text" || isVideoAnimationCapable) ? "four" : "three"}`} role="tablist" aria-label="Visual inspector sections">
              <button className={visualTab === "basic" ? "active" : ""} onClick={() => setVisualTab("basic")}>Basic</button>
              {isColorCapable && <button className={visualTab === "color" ? "active" : ""} onClick={() => setVisualTab("color")}>Color</button>}
              {(clip.type === "text" || isVideoAnimationCapable) && <button className={visualTab === "animation" ? "active" : ""} onClick={() => setVisualTab("animation")}>Animation</button>}
              {isMaskCapable && <button className={visualTab === "mask" ? "active" : ""} onClick={() => setVisualTab("mask")}>Mask</button>}
            </div>
          )}
          {isVisual && !showingMaskTab && !showingTextAnimationTab && !showingVideoAnimationTab && (!isColorCapable || visualTab === "basic") && (
            <section className="inspector-card">
              <SectionTitle
                icon={<SlidersHorizontal size={16} />}
                label="Transform"
                action={
                  <div className="title-actions">
                    <button title="Copy clip properties" onClick={copySelectedClipProperties}><Copy size={14} /></button>
                    <button title="Paste clip properties" onClick={pasteClipProperties}><ClipboardPaste size={14} /></button>
                    <button title="Add or update transform keyframe" onClick={addTransformKeyframe}><Diamond size={14} /></button>
                    <button title="Reset transform" onClick={() => applyTransformAction("reset")}><RotateCcw size={15} /></button>
                  </div>
                }
              />
              <div className="quick-actions">
                <button onClick={() => applyTransformAction("center")}>Center</button>
                <button onClick={() => applyTransformAction("reset")}>Reset</button>
              </div>
              <div className="field-row two">
                <label>Position</label>
                <NumberInput value={Math.round(currentTransform.x)} min={-9999} max={9999} onChange={(value) => updateTransform({ x: value })} />
                <NumberInput value={Math.round(currentTransform.y)} min={-9999} max={9999} onChange={(value) => updateTransform({ y: value })} />
              </div>
              <Range label="Scale" value={currentTransform.scale * 100} min={10} max={300} step={1} suffix="%" onChange={(value) => updateTransform({ scale: value / 100 })} />
              <Range label="Rotation" value={currentTransform.rotation} min={-180} max={180} step={1} suffix=" deg" onChange={(value) => updateTransform({ rotation: value })} />
              <Range label="Opacity" value={currentTransform.opacity * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => updateTransform({ opacity: value / 100 })} />
              <div className="select-row premium-select">
                <span><Blend size={14} /> Blend</span>
                <BlendSelect value={currentTransform.blendMode} onChange={(blendMode) => updateTransform({ blendMode })} />
              </div>
              <TransformKeyframeList keyframes={clip.keyframes?.transform ?? []} onRemove={(id) => removeKeyframe("transform", id)} />
            </section>
          )}
          {(clip.type === "video" || clip.type === "image") && !showingMaskTab && !showingTextAnimationTab && !showingVideoAnimationTab && visualTab === "basic" && (
            <BackgroundRemovalPanel
              settings={normalizeBackgroundRemovalSettings(clip.backgroundRemoval)}
              onChange={updateBackgroundRemoval}
            />
          )}
          {isColorCapable && (visualTab === "color" || isFilterClip) && (
            <section className="inspector-card">
              <SectionTitle
                icon={<Palette size={15} />}
                label="Color"
                action={
                  <div className="title-actions">
                    <button title="Add or update color keyframe" onClick={addColorKeyframe}><Diamond size={14} /></button>
                    <button title="Copy clip properties" onClick={copySelectedClipProperties}><Copy size={14} /></button>
                    <button title="Paste clip properties" onClick={pasteClipProperties}><ClipboardPaste size={14} /></button>
                    <button title="Reset all color grading" onClick={() => updateColor(normalizeColorSettings(defaultColorSettings()))}><RotateCcw size={15} /></button>
                  </div>
                }
              />
              <div className="color-module-tabs">
                {(["basic", "lut", "hsl", "curves"] as const).map((tab) => (
                  <button
                    className={colorTab === tab ? "active" : ""}
                    key={tab}
                    onClick={() => setColorTab(tab)}
                  >
                    {tab[0].toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
              {colorTab === "basic" && (
                <>
                  <div className="color-preset-strip">
                    {builtInColorPresets.map((preset) => (
                      <button key={preset.id} onClick={() => updateColor(preset.grade)}>{preset.name}</button>
                    ))}
                  </div>
                  <div className="color-subsection">
                    <strong>Light</strong>
                    <Range label="Exposure" value={currentColor.basic.exposure} min={-5} max={5} step={0.05} suffix=" stop" onChange={(value) => updateColor({ basic: { ...currentColor.basic, exposure: value } })} />
                    <Range label="Brightness" value={currentColor.basic.brightness} min={-100} max={100} step={1} suffix="" onChange={(value) => updateColor({ basic: { ...currentColor.basic, brightness: value } })} />
                    <Range label="Contrast" value={currentColor.basic.contrast} min={-100} max={100} step={1} suffix="" onChange={(value) => updateColor({ basic: { ...currentColor.basic, contrast: value } })} />
                    <Range label="Highlights" value={currentColor.basic.highlights} min={-100} max={100} step={1} suffix="" onChange={(value) => updateColor({ basic: { ...currentColor.basic, highlights: value } })} />
                    <Range label="Shadows" value={currentColor.basic.shadows} min={-100} max={100} step={1} suffix="" onChange={(value) => updateColor({ basic: { ...currentColor.basic, shadows: value } })} />
                    <Range label="Whites" value={currentColor.basic.whites} min={-100} max={100} step={1} suffix="" onChange={(value) => updateColor({ basic: { ...currentColor.basic, whites: value } })} />
                    <Range label="Blacks" value={currentColor.basic.blacks} min={-100} max={100} step={1} suffix="" onChange={(value) => updateColor({ basic: { ...currentColor.basic, blacks: value } })} />
                    <Range label="Gamma" value={currentColor.basic.gamma} min={0.1} max={3} step={0.01} suffix="" onChange={(value) => updateColor({ basic: { ...currentColor.basic, gamma: value } })} />
                  </div>
                  <div className="color-subsection">
                    <strong>White Balance and Color</strong>
                    <Range label="Temperature" value={currentColor.basic.temperature} min={-100} max={100} step={1} suffix="" onChange={(value) => updateColor({ basic: { ...currentColor.basic, temperature: value } })} />
                    <Range label="Tint" value={currentColor.basic.tint} min={-100} max={100} step={1} suffix="" onChange={(value) => updateColor({ basic: { ...currentColor.basic, tint: value } })} />
                    <Range label="Saturation" value={currentColor.basic.saturation} min={-100} max={100} step={1} suffix="" onChange={(value) => updateColor({ basic: { ...currentColor.basic, saturation: value } })} />
                    <Range label="Vibrance" value={currentColor.basic.vibrance} min={-100} max={100} step={1} suffix="" onChange={(value) => updateColor({ basic: { ...currentColor.basic, vibrance: value } })} />
                    <Range label="Hue" value={currentColor.basic.hue} min={-180} max={180} step={1} suffix=" deg" onChange={(value) => updateColor({ basic: { ...currentColor.basic, hue: value } })} />
                    <div className="quick-actions">
                      <button onClick={() => updateColor({ basic: { ...currentColor.basic, temperature: 0, tint: 0 } })}>Reset WB</button>
                      <button onClick={() => updateColor({ basic: { ...currentColor.basic, temperature: -currentColor.basic.temperature * 0.25, tint: -currentColor.basic.tint * 0.25 } })}>Auto Neutral</button>
                    </div>
                  </div>
                  <div className="color-subsection">
                    <strong>Detail and Finish</strong>
                    <Range label="Sharpness" value={currentColor.basic.sharpness} min={0} max={100} step={1} suffix="" onChange={(value) => updateColor({ basic: { ...currentColor.basic, sharpness: value } })} />
                    <Range label="Clarity" value={currentColor.basic.clarity} min={-100} max={100} step={1} suffix="" onChange={(value) => updateColor({ basic: { ...currentColor.basic, clarity: value } })} />
                    <Range label="Dehaze" value={currentColor.basic.dehaze} min={-100} max={100} step={1} suffix="" onChange={(value) => updateColor({ basic: { ...currentColor.basic, dehaze: value } })} />
                    <Range label="Fade" value={currentColor.basic.fade} min={0} max={100} step={1} suffix="" onChange={(value) => updateColor({ basic: { ...currentColor.basic, fade: value } })} />
                    <Range label="Grain Amount" value={currentColor.basic.grainAmount} min={0} max={100} step={1} suffix="" onChange={(value) => updateColor({ basic: { ...currentColor.basic, grainAmount: value } })} />
                    <Range label="Grain Size" value={currentColor.basic.grainSize} min={0.5} max={4} step={0.1} suffix="" onChange={(value) => updateColor({ basic: { ...currentColor.basic, grainSize: value } })} />
                  </div>
                </>
              )}
              {colorTab === "lut" && <LutPanel grade={currentColor} onChange={updateColor} />}
              {colorTab === "hsl" && <HslPanel grade={currentColor} selected={hslRange} onSelect={setHslRange} onChange={updateColor} />}
              {colorTab === "curves" && <CurvesPanel grade={currentColor} channel={curveChannel} onChannel={setCurveChannel} onChange={updateColor} />}
              <ColorKeyframeList keyframes={clip.keyframes?.color ?? []} onRemove={(id) => removeKeyframe("color", id)} />
            </section>
          )}
          {isEffectClip && (
            <section className="inspector-card effects-inspector-card">
              <SectionTitle
                icon={<Palette size={15} />}
                label="Effects"
                action={
                  <div className="title-actions">
                    <button title="Copy effects" onClick={copyEffects}><Copy size={14} /></button>
                    <button title="Paste effects" onClick={pasteEffects}><ClipboardPaste size={14} /></button>
                  </div>
                }
              />
              {clipEffects.length === 0 ? (
                <div className="empty-effect-stack">
                  <SparkleText />
                  <span>Add presets from the Effects panel.</span>
                </div>
              ) : (
                <div className="effect-stack">
                  {clipEffects.map((effect, index) => (
                    <EffectEditor
                      key={effect.id}
                      effect={effect}
                      clipDuration={clip.duration}
                      maxDuration={clip.type === "effect" ? 60 : clip.duration}
                      isFirst={index === 0}
                      isLast={index === clipEffects.length - 1}
                      onMove={moveEffect}
                      onRemove={removeEffect}
                      onReset={resetEffect}
                      onToggle={toggleEffect}
                      onUpdate={updateEffect}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
          {isMaskCapable && visualTab === "mask" && (
            <section className="inspector-card mask-inspector-card">
              <SectionTitle
                icon={<Hexagon size={15} />}
                label="Mask"
                action={
                  <div className="title-actions">
                    <button title="Copy masks" onClick={copyMasks}><Copy size={14} /></button>
                    <button title="Paste masks" onClick={pasteMasks}><ClipboardPaste size={14} /></button>
                  </div>
                }
              />
              <div className="mask-shape-grid">
                {maskTypes.map((item) => (
                  <button key={item.type} onClick={() => {
                    addMask(item.type);
                    window.setTimeout(() => {
                      const nextClip = useEditorStore.getState().project.timeline.selectedClipIds[0]
                        ? findClip(useEditorStore.getState().project.timeline, useEditorStore.getState().project.timeline.selectedClipIds[0])
                        : undefined;
                      setSelectedMaskId(nextClip?.masks?.at(-1)?.id);
                    }, 0);
                  }}>
                    <span className={`mask-shape-icon ${item.type}`} />
                    <em>{item.label}</em>
                  </button>
                ))}
              </div>
              {clipMasks.length === 0 ? (
                <div className="empty-effect-stack">
                  <strong>No masks yet</strong>
                  <span>Add a shape above to start masking this clip.</span>
                </div>
              ) : (
                <>
                  <div className="mask-list">
                    {clipMasks.map((mask, index) => (
                      <article className={mask.id === currentMask?.id ? "active" : ""} key={mask.id} onClick={() => setSelectedMaskId(mask.id)}>
                        <span>{mask.name}</span>
                        <em>{mask.enabled ? "On" : "Off"} / {mask.blendMode}</em>
                        <div>
                          <button title="Move mask up" disabled={index === 0} onClick={(event) => { event.stopPropagation(); moveMask(mask.id, -1); }}><ArrowUp size={12} /></button>
                          <button title="Move mask down" disabled={index === clipMasks.length - 1} onClick={(event) => { event.stopPropagation(); moveMask(mask.id, 1); }}><ArrowDown size={12} /></button>
                        </div>
                      </article>
                    ))}
                  </div>
                  {currentMask && (
                    <MaskEditor
                      mask={currentMask}
                      projectSize={project.timeline}
                      onUpdate={(patch) => updateMask(currentMask.id, patch)}
                      onRemove={() => removeMask(currentMask.id)}
                      onDuplicate={() => duplicateMask(currentMask.id)}
                      onKeyframe={() => addMaskKeyframe(currentMask.id)}
                      onRemoveKeyframe={(keyframeId) => removeMaskKeyframe(currentMask.id, keyframeId)}
                    />
                  )}
                </>
              )}
              <div className="tracking-disabled" title="Mask tracking needs frame analysis and will be added after the native preview compositor.">
                Tracking controls are disabled: Coming soon
              </div>
            </section>
          )}
          {clip.type === "text" && clip.text && showingTextAnimationTab && (
            <TextAnimationPanel
              animations={normalizeTextClipAnimations(clip.textAnimations)}
              clipDuration={clip.duration}
              playhead={project.timeline.playhead}
              side={textAnimationSide}
              onSide={setTextAnimationSide}
              onPreset={applyTextAnimationPreset}
              onPreview={(side) => {
                const animation = normalizeTextClipAnimations(clip.textAnimations)[side];
                const start = side === "in"
                  ? clip.timelineStart + animation.delay
                  : Math.max(clip.timelineStart, clip.timelineStart + clip.duration - animation.delay - animation.duration);
                useEditorStore.getState().setPlayhead(start);
                useEditorStore.getState().setPlaying(true);
              }}
              onReset={resetTextAnimation}
              onUpdate={updateTextAnimation}
            />
          )}
          {isVideoAnimationCapable && showingVideoAnimationTab && (
            <VideoAnimationPanel
              animations={normalizeVideoClipAnimations(clip.videoAnimations)}
              clipDuration={clip.duration}
              playhead={project.timeline.playhead}
              side={videoAnimationSide}
              onSide={setVideoAnimationSide}
              onPreset={applyVideoAnimationPreset}
              onPreview={(side) => {
                const animation = normalizeVideoClipAnimations(clip.videoAnimations)[side];
                const start = side === "in"
                  ? clip.timelineStart + animation.delay
                  : Math.max(clip.timelineStart, clip.timelineStart + clip.duration - animation.delay - animation.duration);
                useEditorStore.getState().setPlayhead(start);
                useEditorStore.getState().setPlaying(true);
              }}
              onReset={resetVideoAnimation}
              onUpdate={updateVideoAnimation}
            />
          )}
          {clip.type === "text" && clip.text && !showingMaskTab && !showingTextAnimationTab && (
            <section className="inspector-card">
              <SectionTitle
                icon={<Type size={15} />}
                label="Text"
                action={
                  <div className="title-actions">
                    <button title="Copy clip properties" onClick={copySelectedClipProperties}><Copy size={14} /></button>
                    <button title="Paste clip properties" onClick={pasteClipProperties}><ClipboardPaste size={14} /></button>
                    <button title="Reset text style" onClick={() => updateText(defaultTextSettings())}><RotateCcw size={15} /></button>
                  </div>
                }
              />
              <label className="select-row stacked">
                <span>Content</span>
                <input value={clip.text.text} onChange={(event) => updateText({ text: event.target.value })} />
              </label>
              <label className="select-row stacked">
                <span>Font</span>
                <select
                  value={`${clip.text.fontFamily}|${clip.text.fontWeight}`}
                  onChange={(event) => {
                    const [fontFamily, fontWeight] = event.target.value.split("|");
                    updateText({ fontFamily, fontWeight: Number(fontWeight) });
                  }}
                >
                  {textFontOptions.map((font) => (
                    <option key={`${font.family}-${font.weight}-${font.style ?? "normal"}`} value={`${font.style === "italic" ? `${font.family} Italic` : font.family}|${font.weight}`}>
                      {font.label}
                    </option>
                  ))}
                </select>
              </label>
              <Range label="Size" value={clip.text.fontSize} min={16} max={140} step={1} suffix="px" onChange={(value) => updateText({ fontSize: value })} />
              <Range label="Weight" value={clip.text.fontWeight} min={300} max={900} step={100} suffix="" onChange={(value) => updateText({ fontWeight: value })} />
              <div className="color-grid">
                <Color label="Text" value={clip.text.color} onChange={(value) => updateText({ color: value })} />
                <Color label="Back" value={clip.text.background === "transparent" ? "#000000" : clip.text.background} onChange={(value) => updateText({ background: value })} />
              </div>
              <div className="text-style-section">
                <label className="check-row">
                  <input type="checkbox" checked={clip.text!.stroke.enabled} onChange={(event) => updateText({ stroke: { ...clip.text!.stroke, enabled: event.target.checked } })} />
                  <span>Stroke</span>
                </label>
                <div className="color-grid">
                  <Color label="Color" value={clip.text!.stroke.color} onChange={(value) => updateText({ stroke: { ...clip.text!.stroke, color: value } })} />
                </div>
                <Range label="Width" value={clip.text!.stroke.width} min={0} max={12} step={0.5} suffix="px" onChange={(value) => updateText({ stroke: { ...clip.text!.stroke, width: value } })} />
              </div>
              <div className="text-style-section">
                <label className="check-row">
                  <input type="checkbox" checked={clip.text!.glow.enabled} onChange={(event) => updateText({ glow: { ...clip.text!.glow, enabled: event.target.checked } })} />
                  <span>Glow</span>
                </label>
                <div className="color-grid">
                  <Color label="Color" value={clip.text!.glow.color} onChange={(value) => updateText({ glow: { ...clip.text!.glow, color: value } })} />
                </div>
                <Range label="Size" value={clip.text!.glow.size} min={0} max={60} step={1} suffix="px" onChange={(value) => updateText({ glow: { ...clip.text!.glow, size: value } })} />
                <Range label="Opacity" value={clip.text!.glow.opacity * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => updateText({ glow: { ...clip.text!.glow, opacity: value / 100 } })} />
              </div>
              <div className="text-style-section">
                <label className="check-row">
                  <input type="checkbox" checked={clip.text!.shadow.enabled} onChange={(event) => updateText({ shadow: { ...clip.text!.shadow, enabled: event.target.checked } })} />
                  <span>Shadow</span>
                </label>
                <div className="color-grid">
                  <Color label="Color" value={clip.text!.shadow.color} onChange={(value) => updateText({ shadow: { ...clip.text!.shadow, color: value } })} />
                </div>
                <div className="field-row two">
                  <label>Offset</label>
                  <NumberInput value={clip.text!.shadow.x} min={-80} max={80} onChange={(value) => updateText({ shadow: { ...clip.text!.shadow, x: value } })} />
                  <NumberInput value={clip.text!.shadow.y} min={-80} max={80} onChange={(value) => updateText({ shadow: { ...clip.text!.shadow, y: value } })} />
                </div>
                <Range label="Blur" value={clip.text!.shadow.blur} min={0} max={60} step={1} suffix="px" onChange={(value) => updateText({ shadow: { ...clip.text!.shadow, blur: value } })} />
                <Range label="Opacity" value={clip.text!.shadow.opacity * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => updateText({ shadow: { ...clip.text!.shadow, opacity: value / 100 } })} />
              </div>
              <div className="text-style-section">
                <label className="check-row">
                  <input type="checkbox" checked={clip.text!.curve.enabled} onChange={(event) => updateText({ curve: { ...clip.text!.curve, enabled: event.target.checked } })} />
                  <span>Curve</span>
                </label>
                <Range label="Amount" value={clip.text!.curve.amount} min={-100} max={100} step={1} suffix="" onChange={(value) => updateText({ curve: { ...clip.text!.curve, amount: value } })} />
              </div>
              <div className="segmented" aria-label="Text alignment">
                {(["left", "center", "right"] as const).map((align) => (
                  <button className={clip.text?.align === align ? "active" : ""} key={align} onClick={() => updateText({ align })}>
                    {align === "left" ? <AlignLeft size={15} /> : align === "center" ? <AlignCenter size={15} /> : <AlignRight size={15} />}
                  </button>
                ))}
              </div>
            </section>
          )}
          {!showingMaskTab && !showingTextAnimationTab && !showingVideoAnimationTab && (!isColorCapable || visualTab === "basic") && isCropCapable && clip.crop && (
            <section className="inspector-card crop-card">
              <SectionTitle
                icon={<Crop size={15} />}
                label="Crop"
                action={
                  <div className="title-actions">
                    <button title="Reset crop" onClick={() => updateCrop({ left: 0, top: 0, right: 0, bottom: 0 })}><RotateCcw size={15} /></button>
                    <button title="Remove crop" onClick={() => updateCrop(undefined)}>Off</button>
                  </div>
                }
              />
              <div className="crop-frame-preview">
                <div
                  className="crop-frame-inner"
                  style={{
                    left: `${clip.crop.left}%`,
                    top: `${clip.crop.top}%`,
                    right: `${clip.crop.right}%`,
                    bottom: `${clip.crop.bottom}%`
                  }}
                />
              </div>
              <Range label="Left" value={clip.crop.left} min={0} max={45} step={1} suffix="%" onChange={(value) => updateCrop({ left: value })} />
              <Range label="Top" value={clip.crop.top} min={0} max={45} step={1} suffix="%" onChange={(value) => updateCrop({ top: value })} />
              <Range label="Right" value={clip.crop.right} min={0} max={45} step={1} suffix="%" onChange={(value) => updateCrop({ right: value })} />
              <Range label="Bottom" value={clip.crop.bottom} min={0} max={45} step={1} suffix="%" onChange={(value) => updateCrop({ bottom: value })} />
            </section>
          )}
          {!showingMaskTab && !showingTextAnimationTab && !showingVideoAnimationTab && (!isColorCapable || visualTab === "basic") && isAudio && (
            <section className="inspector-card">
              <SectionTitle
                icon={<Volume2 size={15} />}
                label="Audio"
                action={
                  <div className="title-actions">
                    <button title="Copy clip properties" onClick={copySelectedClipProperties}><Copy size={14} /></button>
                    <button title="Paste clip properties" onClick={pasteClipProperties}><ClipboardPaste size={14} /></button>
                    <button title="Add or update volume keyframe" onClick={addAudioKeyframe}><Diamond size={14} /></button>
                    <button title="Reset audio" onClick={() => updateAudio(defaultAudioSettings())}><RotateCcw size={15} /></button>
                  </div>
                }
              />
              <Range label="Volume" value={currentAudio.volume * 100} min={0} max={200} step={1} suffix="%" onChange={(value) => updateAudio({ volume: value / 100 })} />
              <Range label="Fade In" value={clip.audio?.fadeIn ?? 0} min={0} max={5} step={0.1} suffix="s" onChange={(value) => updateAudio({ fadeIn: value })} />
              <Range label="Fade Out" value={clip.audio?.fadeOut ?? 0} min={0} max={5} step={0.1} suffix="s" onChange={(value) => updateAudio({ fadeOut: value })} />
              <label className="check-row">
                <input type="checkbox" checked={clip.audio?.muted ?? false} onChange={(event) => updateAudio({ muted: event.target.checked })} />
                <span>Mute clip audio</span>
              </label>
              <AudioKeyframeList keyframes={clip.keyframes?.audio ?? []} onRemove={(id) => removeKeyframe("audio", id)} />
            </section>
          )}
          {!showingMaskTab && !showingTextAnimationTab && !showingVideoAnimationTab && !isEffectClip && (!isColorCapable || visualTab === "basic") && <section className="inspector-card">
            <SectionTitle
              icon={<Gauge size={15} />}
              label="Speed"
              action={<button title="Add or update speed keyframe" onClick={addSpeedKeyframe}><Diamond size={14} /></button>}
            />
            <Range label="Playback" value={currentSpeed * 100} min={25} max={400} step={1} suffix="%" onChange={(value) => updateSpeed(value / 100)} />
            <div className="quick-actions speed-presets">
              {[0.25, 0.5, 1, 1.5, 2, 4].map((speed) => (
                <button className={currentSpeed === speed ? "active" : ""} key={speed} onClick={() => applySpeedPreset(speed)}>
                  {speed}x
                </button>
              ))}
            </div>
            <SpeedKeyframeList keyframes={clip.keyframes?.speed ?? []} onRemove={(id) => removeKeyframe("speed", id)} />
          </section>}
        </div>
      )}
    </aside>
  );
}

function TransformKeyframeList(props: { keyframes: TransformKeyframe[]; onRemove: (id: string) => void }) {
  if (!props.keyframes.length) return null;
  return (
    <div className="keyframe-list">
      {props.keyframes.map((keyframe) => (
        <div className="keyframe-row" key={keyframe.id}>
          <Diamond size={12} />
          <span>{keyframe.time.toFixed(2)}s</span>
          <em>{Math.round(keyframe.x)}, {Math.round(keyframe.y)} / {Math.round(keyframe.scale * 100)}% / {Math.round(keyframe.opacity * 100)}%</em>
          <button title="Remove keyframe" onClick={() => props.onRemove(keyframe.id)}><Trash2 size={13} /></button>
        </div>
      ))}
    </div>
  );
}

function AudioKeyframeList(props: { keyframes: AudioKeyframe[]; onRemove: (id: string) => void }) {
  if (!props.keyframes.length) return null;
  return (
    <div className="keyframe-list">
      {props.keyframes.map((keyframe) => (
        <div className="keyframe-row" key={keyframe.id}>
          <Diamond size={12} />
          <span>{keyframe.time.toFixed(2)}s</span>
          <em>{Math.round(keyframe.volume * 100)}%</em>
          <button title="Remove keyframe" onClick={() => props.onRemove(keyframe.id)}><Trash2 size={13} /></button>
        </div>
      ))}
    </div>
  );
}

function SpeedKeyframeList(props: { keyframes: SpeedKeyframe[]; onRemove: (id: string) => void }) {
  if (!props.keyframes.length) return null;
  return (
    <div className="keyframe-list">
      {props.keyframes.map((keyframe) => (
        <div className="keyframe-row" key={keyframe.id}>
          <Diamond size={12} />
          <span>{keyframe.time.toFixed(2)}s</span>
          <em>{keyframe.speed.toFixed(2)}x</em>
          <button title="Remove keyframe" onClick={() => props.onRemove(keyframe.id)}><Trash2 size={13} /></button>
        </div>
      ))}
    </div>
  );
}

function ColorKeyframeList(props: { keyframes: ColorKeyframe[]; onRemove: (id: string) => void }) {
  if (!props.keyframes.length) return null;
  return (
    <div className="keyframe-list">
      {props.keyframes.map((keyframe) => (
        <div className="keyframe-row" key={keyframe.id}>
          <Diamond size={12} />
          <span>{keyframe.time.toFixed(2)}s</span>
          <em>C {keyframe.grade.basic.contrast.toFixed(0)} / S {keyframe.grade.basic.saturation.toFixed(0)} / T {keyframe.grade.basic.temperature.toFixed(0)}</em>
          <button title="Remove keyframe" onClick={() => props.onRemove(keyframe.id)}><Trash2 size={13} /></button>
        </div>
      ))}
    </div>
  );
}

function BackgroundRemovalPanel(props: { settings: BackgroundRemovalSettings; onChange: (patch: Partial<BackgroundRemovalSettings>) => void }) {
  const settings = normalizeBackgroundRemovalSettings(props.settings);
  const updateMode = (mode: BackgroundRemovalSettings["mode"]) => props.onChange(applyModeDefaults(settings, mode));
  const sampleWithEyeDropper = async () => {
    const eyeDropper = "EyeDropper" in window ? new (window as typeof window & { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper() : undefined;
    if (!eyeDropper) {
      useEditorStore.getState().addToast("error", "Preview eyedropper is not available in this WebView2 runtime.");
      return;
    }
    try {
      const result = await eyeDropper.open();
      props.onChange({ enabled: true, mode: "custom-color", keyColor: result.sRGBHex });
    } catch {
      // Cancelled eyedropper picks should leave the clip untouched.
    }
  };

  return (
    <section className="inspector-card background-removal-card">
      <SectionTitle
        icon={<Hexagon size={15} />}
        label="Background Removal"
        action={
          <div className="title-actions">
            <button title={settings.enabled ? "Disable background removal" : "Enable background removal"} onClick={() => props.onChange({ enabled: !settings.enabled, mode: settings.enabled ? "off" : settings.mode === "off" ? "green-screen" : settings.mode })}>{settings.enabled ? "On" : "Off"}</button>
            <button title="Reset background removal" onClick={() => props.onChange(defaultBackgroundRemovalSettings())}><RotateCcw size={15} /></button>
          </div>
        }
      />
      <div className="background-mode-grid">
        {backgroundRemovalModes.map((mode) => (
          <button className={settings.mode === mode.id ? "active" : ""} key={mode.id} onClick={() => updateMode(mode.id)} title={mode.note}>
            <strong>{mode.label}</strong>
            <em>{mode.status.replace("-", " ")}</em>
          </button>
        ))}
      </div>
      <div className={`background-status ${settings.exportStatus}`}>Export support: {settings.exportStatus.replace("-", " ")}</div>
      {settings.mode !== "off" && settings.mode !== "luma-key" && settings.mode !== "difference-key" && (
        <>
          <label className="select-row background-color-row">
            <span>Key color</span>
            <input type="color" value={settings.keyColor} onChange={(event) => props.onChange({ enabled: true, keyColor: event.target.value, mode: settings.mode === "off" ? "custom-color" : settings.mode })} />
            <button onClick={sampleWithEyeDropper}>Eyedropper</button>
          </label>
          <Range label="Similarity" value={settings.tolerance * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => props.onChange({ enabled: true, tolerance: value / 100 })} />
          <Range label="Softness" value={settings.softness * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => props.onChange({ enabled: true, softness: value / 100 })} />
          <Range label="Edge Feather" value={settings.feather * 100} min={0} max={50} step={1} suffix="%" onChange={(value) => props.onChange({ enabled: true, feather: value / 100 })} />
          <Range label="Edge Shrink/Grow" value={settings.edgeExpansion * 100} min={-50} max={50} step={1} suffix="%" onChange={(value) => props.onChange({ enabled: true, edgeExpansion: value / 100 })} />
          <Range label="Spill Suppression" value={settings.spillSuppression * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => props.onChange({ enabled: true, spillSuppression: value / 100 })} />
          <Range label="Spill Range" value={settings.spillRange * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => props.onChange({ enabled: true, spillRange: value / 100 })} />
          <Range label="Desaturation" value={settings.desaturation * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => props.onChange({ enabled: true, desaturation: value / 100 })} />
        </>
      )}
      {settings.mode === "luma-key" && (
        <>
          <label className="select-row premium-select">
            <span>Luma target</span>
            <select value={settings.lumaKey} onChange={(event) => props.onChange({ enabled: true, lumaKey: event.target.value as BackgroundRemovalSettings["lumaKey"] })}>
              <option value="bright">Key Bright Areas</option>
              <option value="dark">Key Dark Areas</option>
            </select>
          </label>
          <Range label="Threshold" value={settings.lumaThreshold * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => props.onChange({ enabled: true, lumaThreshold: value / 100 })} />
          <Range label="Softness" value={settings.lumaSoftness * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => props.onChange({ enabled: true, lumaSoftness: value / 100 })} />
          <Range label="Feather" value={settings.feather * 100} min={0} max={50} step={1} suffix="%" onChange={(value) => props.onChange({ enabled: true, feather: value / 100 })} />
        </>
      )}
      {settings.mode === "difference-key" && (
        <div className="difference-key-note">
          <strong>Difference Key</strong>
          <span>Best for static cameras, stable lighting, and clean reference frames. Reference-frame export is intentionally disabled until compositor parity is implemented.</span>
          <Range label="Threshold" value={settings.differenceThreshold * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => props.onChange({ enabled: true, differenceThreshold: value / 100 })} />
          <Range label="Softness" value={settings.differenceSoftness * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => props.onChange({ enabled: true, differenceSoftness: value / 100 })} />
          <Range label="Noise Reduction" value={settings.differenceNoiseReduction * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => props.onChange({ enabled: true, differenceNoiseReduction: value / 100 })} />
        </div>
      )}
      {settings.mode !== "off" && (
        <>
          <Range label="Transparency" value={settings.opacity * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => props.onChange({ enabled: true, opacity: value / 100 })} />
          <div className="quick-actions">
            <button className={settings.invert ? "active" : ""} onClick={() => props.onChange({ enabled: true, invert: !settings.invert })}>Invert Key</button>
            <button className={settings.showMatte ? "active" : ""} onClick={() => props.onChange({ enabled: true, showMatte: !settings.showMatte })}>Show Matte</button>
          </div>
          <label className="select-row premium-select">
            <span>Preview background</span>
            <select value={settings.previewBackground} onChange={(event) => props.onChange({ previewBackground: event.target.value as BackgroundRemovalSettings["previewBackground"] })}>
              <option value="checkerboard">Checkerboard</option>
              <option value="black">Black</option>
              <option value="white">White</option>
              <option value="custom">Custom</option>
              <option value="lower-track">Current lower track</option>
            </select>
          </label>
          {settings.previewBackground === "custom" && (
            <label className="select-row background-color-row">
              <span>Background color</span>
              <input type="color" value={settings.previewCustomColor} onChange={(event) => props.onChange({ previewCustomColor: event.target.value })} />
            </label>
          )}
        </>
      )}
    </section>
  );
}

function MaskEditor(props: {
  mask: MaskInstance;
  projectSize: { width: number; height: number };
  onUpdate: (patch: Partial<MaskInstance>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onKeyframe: () => void;
  onRemoveKeyframe: (keyframeId: string) => void;
}) {
  const updateSize = (patch: Partial<Pick<MaskInstance, "width" | "height">>) => {
    const nextWidth = patch.width ?? props.mask.width;
    const nextHeight = props.mask.aspectRatioLocked ? nextWidth : patch.height ?? props.mask.height;
    props.onUpdate({ ...patch, width: nextWidth, height: nextHeight });
  };
  const updatePoint = (pointId: string, patch: { x?: number; y?: number }) => {
    props.onUpdate({
      points: (props.mask.points ?? []).map((point) => point.id === pointId ? { ...point, ...patch } : point)
    });
  };
  return (
    <article className="mask-editor">
      <header>
        <strong>{props.mask.name}</strong>
        <div className="effect-editor-actions">
          <button title={props.mask.enabled ? "Disable mask" : "Enable mask"} onClick={() => props.onUpdate({ enabled: !props.mask.enabled })}>{props.mask.enabled ? "On" : "Off"}</button>
          <button title="Add or update mask keyframe" onClick={props.onKeyframe}><Diamond size={13} /></button>
          <button title="Duplicate mask" onClick={props.onDuplicate}><Copy size={13} /></button>
          <button title="Reset mask" onClick={() => props.onUpdate(defaultMaskPatch(props.mask.type, props.projectSize))}><RotateCcw size={13} /></button>
          <button title="Delete mask" onClick={props.onRemove}><Trash2 size={13} /></button>
        </div>
      </header>
      <div className="field-row two">
        <label>Position</label>
        <NumberInput value={Math.round(props.mask.position.x)} min={-9999} max={9999} onChange={(x) => props.onUpdate({ position: { ...props.mask.position, x } })} />
        <NumberInput value={Math.round(props.mask.position.y)} min={-9999} max={9999} onChange={(y) => props.onUpdate({ position: { ...props.mask.position, y } })} />
      </div>
      <div className="field-row two">
        <label>Size</label>
        <NumberInput value={Math.round(props.mask.width)} min={4} max={props.projectSize.width * 2} onChange={(width) => updateSize({ width })} />
        <NumberInput value={Math.round(props.mask.height)} min={4} max={props.projectSize.height * 2} onChange={(height) => updateSize({ height })} />
      </div>
      <Range label="Scale" value={props.mask.scale * 100} min={5} max={400} step={1} suffix="%" onChange={(value) => props.onUpdate({ scale: value / 100 })} />
      <Range label="Rotation" value={props.mask.rotation} min={-180} max={180} step={1} suffix=" deg" onChange={(value) => props.onUpdate({ rotation: value })} />
      <Range label="Feather" value={props.mask.feather} min={0} max={200} step={1} suffix="px" onChange={(value) => props.onUpdate({ feather: value })} />
      <Range label="Expansion" value={props.mask.expansion} min={-200} max={200} step={1} suffix="px" onChange={(value) => props.onUpdate({ expansion: value })} />
      <Range label="Opacity" value={props.mask.opacity * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => props.onUpdate({ opacity: value / 100 })} />
      {props.mask.type === "rounded-rectangle" && (
        <Range label="Corner" value={props.mask.cornerRadius ?? 0} min={0} max={300} step={1} suffix="px" onChange={(value) => props.onUpdate({ cornerRadius: value })} />
      )}
      <label className="check-row">
        <input type="checkbox" checked={props.mask.aspectRatioLocked} onChange={(event) => props.onUpdate({ aspectRatioLocked: event.target.checked })} />
        <span>Lock aspect ratio</span>
      </label>
      <label className="check-row">
        <input type="checkbox" checked={props.mask.inverted} onChange={(event) => props.onUpdate({ inverted: event.target.checked })} />
        <span>Invert mask</span>
      </label>
      <label className="select-row stacked">
        <span>Blend mode</span>
        <select value={props.mask.blendMode} onChange={(event) => props.onUpdate({ blendMode: event.target.value as MaskInstance["blendMode"] })}>
          <option value="add">Add</option>
          <option value="subtract">Subtract</option>
          <option value="intersect">Intersect</option>
        </select>
      </label>
      {props.mask.type === "bezier" && (
        <div className="bezier-point-list">
          <p className="mask-draw-hint">
            {props.mask.draft
              ? "Draw on the preview, move points until the shape is right, then accept it to create the mask."
              : "Accepted custom masks can be moved and resized from the preview handles."}
          </p>
          <div className="custom-mask-actions">
            {props.mask.draft && (
              <button
                className="primary-action"
                disabled={(props.mask.points?.length ?? 0) < 3}
                onClick={() => props.onUpdate({ ...bezierBounds(props.mask.points, props.projectSize), draft: false })}
              >
                Accept Shape
              </button>
            )}
            <button onClick={() => props.onUpdate({ points: [...(props.mask.points ?? []), { id: crypto.randomUUID(), x: props.projectSize.width / 2, y: props.projectSize.height / 2 },], draft: true })}>Add Center Point</button>
            <button onClick={() => props.onUpdate({ points: [], draft: true })}>Reset Path</button>
          </div>
          {(props.mask.points ?? []).map((point, index) => (
            <div className="field-row two bezier-row" key={point.id}>
              <label>P{index + 1}</label>
              <NumberInput value={Math.round(point.x)} min={-9999} max={9999} onChange={(x) => updatePoint(point.id, { x })} />
              <NumberInput value={Math.round(point.y)} min={-9999} max={9999} onChange={(y) => updatePoint(point.id, { y })} />
              <button title="Delete point" onClick={() => props.onUpdate({ points: props.mask.points?.filter((item) => item.id !== point.id) })}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
      <MaskKeyframeList keyframes={props.mask.keyframes} onRemove={props.onRemoveKeyframe} />
    </article>
  );
}

function defaultMaskPatch(type: MaskType, projectSize: { width: number; height: number }): Partial<MaskInstance> {
  return {
    position: { x: projectSize.width / 2, y: projectSize.height / 2 },
    width: Math.round(projectSize.width * 0.44),
    height: Math.round(projectSize.height * 0.44),
    scale: 1,
    rotation: 0,
    feather: 0,
    expansion: 0,
    opacity: 1,
    cornerRadius: type === "rounded-rectangle" ? 48 : 0,
    draft: type === "bezier",
    points: type === "bezier" ? [] : undefined,
    keyframes: []
  };
}

function MaskKeyframeList(props: { keyframes: MaskKeyframe[]; onRemove: (id: string) => void }) {
  if (!props.keyframes.length) return null;
  return (
    <div className="keyframe-list">
      {props.keyframes.map((keyframe) => (
        <div className="keyframe-row" key={keyframe.id}>
          <Diamond size={12} />
          <span>{keyframe.time.toFixed(2)}s</span>
          <em>{Math.round(keyframe.position.x)}, {Math.round(keyframe.position.y)} / {Math.round(keyframe.width)}x{Math.round(keyframe.height)}</em>
          <button title="Remove keyframe" onClick={() => props.onRemove(keyframe.id)}><Trash2 size={13} /></button>
        </div>
      ))}
    </div>
  );
}

const hslRanges: HslRangeName[] = ["red", "orange", "yellow", "green", "cyan", "blue", "purple", "magenta"];

function LutPanel(props: { grade: ColorGrade; onChange: (patch: Partial<ColorGrade>) => void }) {
  const looks = [
    ["cinematic", "Cinematic"],
    ["warm-film", "Warm Film"],
    ["cool-clean", "Cool Clean"],
    ["noir", "Noir"],
    ["vintage-print", "Vintage Print"]
  ] as const;
  return (
    <div className="color-subsection">
      <strong>Creative Look</strong>
      <label className="check-row">
        <input type="checkbox" checked={props.grade.lut.enabled} onChange={(event) => props.onChange({ lut: { ...props.grade.lut, enabled: event.target.checked } })} />
        <span>Enable look</span>
      </label>
      <div className="color-look-grid">
        {looks.map(([id, name]) => (
          <button
            className={props.grade.lut.lutId === id ? "active" : ""}
            key={id}
            onClick={() => props.onChange({ lut: { ...props.grade.lut, enabled: true, lutId: id, displayName: name, category: "creative" } })}
          >
            <i className={`look-preview look-${id}`} />
            <span>{name}</span>
          </button>
        ))}
      </div>
      <Range label="Intensity" value={props.grade.lut.intensity * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => props.onChange({ lut: { ...props.grade.lut, intensity: value / 100 } })} />
    </div>
  );
}

function HslPanel(props: { grade: ColorGrade; selected: HslRangeName; onSelect: (range: HslRangeName) => void; onChange: (patch: Partial<ColorGrade>) => void }) {
  const range = props.grade.hsl.ranges[props.selected];
  const updateRange = (patch: Partial<typeof range>) => props.onChange({
    hsl: {
      ...props.grade.hsl,
      enabled: true,
      ranges: { ...props.grade.hsl.ranges, [props.selected]: { ...range, ...patch } }
    }
  });
  return (
    <div className="color-subsection">
      <strong>Hue, Saturation and Luminance</strong>
      <label className="check-row">
        <input type="checkbox" checked={props.grade.hsl.enabled} onChange={(event) => props.onChange({ hsl: { ...props.grade.hsl, enabled: event.target.checked } })} />
        <span>Enable HSL correction</span>
      </label>
      <div className="hsl-range-grid">
        {hslRanges.map((name) => <button className={`${name} ${props.selected === name ? "active" : ""}`} key={name} onClick={() => props.onSelect(name)}>{name}</button>)}
      </div>
      <Range label="Hue Shift" value={range.hue} min={-100} max={100} step={1} suffix="" onChange={(value) => updateRange({ hue: value })} />
      <Range label="Saturation" value={range.saturation} min={-100} max={100} step={1} suffix="" onChange={(value) => updateRange({ saturation: value })} />
      <Range label="Luminance" value={range.luminance} min={-100} max={100} step={1} suffix="" onChange={(value) => updateRange({ luminance: value })} />
      <Range label="Range Width" value={range.rangeWidth} min={5} max={120} step={1} suffix=" deg" onChange={(value) => updateRange({ rangeWidth: value })} />
      <Range label="Feather" value={range.feathering * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => updateRange({ feathering: value / 100 })} />
    </div>
  );
}

function curveFromControls(shadows: number, midtones: number, highlights: number): CurvePoint[] {
  return [
    { x: 0, y: 0 },
    { x: 0.25, y: Math.min(1, Math.max(0, 0.25 + shadows / 200)) },
    { x: 0.5, y: Math.min(1, Math.max(0, 0.5 + midtones / 200)) },
    { x: 0.75, y: Math.min(1, Math.max(0, 0.75 + highlights / 200)) },
    { x: 1, y: 1 }
  ];
}

function curveControlValue(points: CurvePoint[], x: number): number {
  const point = points.find((item) => Math.abs(item.x - x) < 0.01);
  return Math.round(((point?.y ?? x) - x) * 200);
}

function CurvesPanel(props: { grade: ColorGrade; channel: "master" | "red" | "green" | "blue"; onChannel: (channel: "master" | "red" | "green" | "blue") => void; onChange: (patch: Partial<ColorGrade>) => void }) {
  const points = props.grade.curves[props.channel];
  const shadows = curveControlValue(points, 0.25);
  const midtones = curveControlValue(points, 0.5);
  const highlights = curveControlValue(points, 0.75);
  const update = (next: { shadows?: number; midtones?: number; highlights?: number }) => props.onChange({
    curves: {
      ...props.grade.curves,
      enabled: true,
      [props.channel]: curveFromControls(next.shadows ?? shadows, next.midtones ?? midtones, next.highlights ?? highlights)
    }
  });
  return (
    <div className="color-subsection">
      <strong>RGB Curves</strong>
      <label className="check-row">
        <input type="checkbox" checked={props.grade.curves.enabled} onChange={(event) => props.onChange({ curves: { ...props.grade.curves, enabled: event.target.checked } })} />
        <span>Enable curves</span>
      </label>
      <div className="segmented four">
        {(["master", "red", "green", "blue"] as const).map((channel) => <button className={props.channel === channel ? `active curve-${channel}` : `curve-${channel}`} key={channel} onClick={() => props.onChannel(channel)}>{channel}</button>)}
      </div>
      <div className={`curve-graph curve-${props.channel}`} style={{ "--curve-shadow": shadows, "--curve-mid": midtones, "--curve-highlight": highlights } as CSSProperties}><i /></div>
      <Range label="Shadows" value={shadows} min={-50} max={50} step={1} suffix="" onChange={(value) => update({ shadows: value })} />
      <Range label="Midtones" value={midtones} min={-50} max={50} step={1} suffix="" onChange={(value) => update({ midtones: value })} />
      <Range label="Highlights" value={highlights} min={-50} max={50} step={1} suffix="" onChange={(value) => update({ highlights: value })} />
    </div>
  );
}

function EffectEditor(props: {
  effect: EffectInstance;
  clipDuration: number;
  maxDuration: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (effectId: string, direction: -1 | 1) => void;
  onRemove: (effectId: string) => void;
  onReset: (effectId: string) => void;
  onToggle: (effectId: string) => void;
  onUpdate: (effectId: string, patch: Partial<Pick<EffectInstance, "intensity" | "startTime" | "duration">> & { params?: Record<string, EffectParamValue> }) => void;
}) {
  const numericParams = Object.entries(props.effect.params).filter(([, value]) => typeof value === "number") as Array<[string, number]>;
  return (
    <article className={`effect-editor ${props.effect.enabled ? "" : "disabled"}`}>
      <header>
        <div>
          <strong>{props.effect.name}</strong>
          <span>{effectDisplayName(props.effect.type)}</span>
        </div>
        <div className="effect-editor-actions">
          <button title="Move effect up" disabled={props.isFirst} onClick={() => props.onMove(props.effect.id, -1)}><ArrowUp size={13} /></button>
          <button title="Move effect down" disabled={props.isLast} onClick={() => props.onMove(props.effect.id, 1)}><ArrowDown size={13} /></button>
          <button title={props.effect.enabled ? "Disable effect" : "Enable effect"} onClick={() => props.onToggle(props.effect.id)}>{props.effect.enabled ? "On" : "Off"}</button>
          <button title="Reset effect" onClick={() => props.onReset(props.effect.id)}><RotateCcw size={13} /></button>
          <button title="Remove effect" onClick={() => props.onRemove(props.effect.id)}><Trash2 size={13} /></button>
        </div>
      </header>
      <Range label="Intensity" value={props.effect.intensity * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => props.onUpdate(props.effect.id, { intensity: value / 100 })} />
      <Range label="Start" value={props.effect.startTime} min={0} max={props.clipDuration} step={0.1} suffix="s" onChange={(value) => props.onUpdate(props.effect.id, { startTime: value })} />
      <Range label="Duration" value={props.effect.duration} min={0.1} max={props.maxDuration} step={0.1} suffix="s" onChange={(value) => props.onUpdate(props.effect.id, { duration: value })} />
      {numericParams.map(([key, value]) => (
        <Range
          key={key}
          label={labelize(key)}
          value={value}
          min={key === "radius" ? 0 : key === "frequency" ? 0.1 : key === "offset" ? 0 : 0}
          max={key === "radius" ? 40 : key === "frequency" ? 24 : key === "offset" ? 18 : key === "slices" ? 12 : 1}
          step={key === "radius" || key === "offset" || key === "slices" ? 1 : 0.01}
          suffix=""
          onChange={(nextValue) => props.onUpdate(props.effect.id, { params: { [key]: nextValue } })}
        />
      ))}
    </article>
  );
}

function SparkleText() {
  return <strong>Effect stack is empty</strong>;
}

function labelize(value: string): string {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function BlendSelect(props: { value: BlendMode; onChange: (value: BlendMode) => void }) {
  const [open, setOpen] = useState(false);
  const options: Array<{ value: BlendMode; label: string }> = [
    { value: "normal", label: "Normal" },
    { value: "screen", label: "Screen" },
    { value: "multiply", label: "Multiply" },
    { value: "overlay", label: "Overlay" }
  ];
  const selected = options.find((option) => option.value === props.value) ?? options[0];
  return (
    <div className="blend-select" tabIndex={-1} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as HTMLElement | null)) setOpen(false);
    }}>
      <button type="button" className="blend-select-trigger" onClick={() => setOpen((value) => !value)}>
        <span>{selected.label}</span>
        <span aria-hidden="true">v</span>
      </button>
      {open && (
        <div className="blend-select-menu">
          {options.map((option) => (
            <button
              type="button"
              className={option.value === props.value ? "active" : ""}
              key={option.value}
              onClick={() => {
                props.onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function VideoAnimationPanel(props: {
  animations: ReturnType<typeof normalizeVideoClipAnimations>;
  clipDuration: number;
  playhead: number;
  side: VideoAnimationSide;
  onSide: (side: VideoAnimationSide) => void;
  onPreset: (side: VideoAnimationSide, presetId: string) => void;
  onPreview: (side: VideoAnimationSide) => void;
  onReset: (side: VideoAnimationSide) => void;
  onUpdate: (side: VideoAnimationSide, patch: Partial<VideoClipAnimation>) => void;
}) {
  const animation = props.animations[props.side];
  const presets = props.side === "in" ? inVideoAnimationPresets : outVideoAnimationPresets;
  const showDirection = animation.type === "slide" || animation.type === "wipe" || animation.type === "soft-bounce" || animation.type === "soft-drop";
  const showDistance = animation.type === "slide" || animation.type === "soft-bounce" || animation.type === "soft-drop";
  const showScale = animation.type === "zoom" || animation.type === "pop" || animation.type === "rotate" || animation.type === "soft-bounce";
  const showRotation = animation.type === "rotate";
  const showBlur = animation.type === "blur";
  const showWipe = animation.type === "wipe";
  const showAnchor = animation.type === "zoom" || animation.type === "pop" || animation.type === "rotate";
  const maxDuration = Math.max(0.1, Math.min(10, props.clipDuration));
  return (
    <section className="inspector-card text-animation-card video-animation-card">
      <SectionTitle
        icon={<Play size={15} />}
        label="Clip Animation"
        action={
          <div className="title-actions">
            <button title="Preview selected clip animation" onClick={() => props.onPreview(props.side)}><Play size={14} /></button>
            <button title="Reset selected clip animation" onClick={() => props.onReset(props.side)}><RotateCcw size={15} /></button>
          </div>
        }
      />
      <div className="segmented text-animation-side" aria-label="Clip animation side">
        <button className={props.side === "in" ? "active" : ""} onClick={() => props.onSide("in")}>In</button>
        <button className={props.side === "out" ? "active" : ""} onClick={() => props.onSide("out")}>Out</button>
      </div>
      <div className="text-animation-presets video-animation-presets">
        {presets.map((preset) => (
          <button
            className={animation.enabled && animation.type === preset.type ? "active" : ""}
            key={preset.id}
            title={preset.description}
            onClick={() => props.onPreset(props.side, preset.id)}
          >
            <strong>{preset.label}</strong>
            <span>{preset.type.replace("-", " ")}</span>
          </button>
        ))}
      </div>
      <label className="check-row">
        <input type="checkbox" checked={animation.enabled} onChange={(event) => props.onUpdate(props.side, { enabled: event.target.checked })} />
        <span>Enable {props.side === "in" ? "in" : "out"} animation</span>
      </label>
      <Range label="Duration" value={animation.duration} min={0.05} max={maxDuration} step={0.05} suffix="s" onChange={(value) => props.onUpdate(props.side, { duration: value })} />
      <Range label="Delay" value={Math.min(animation.delay, props.clipDuration)} min={0} max={Math.max(0, props.clipDuration - 0.05)} step={0.05} suffix="s" onChange={(value) => props.onUpdate(props.side, { delay: value })} />
      <Range label="Intensity" value={animation.intensity * 100} min={0} max={200} step={1} suffix="%" onChange={(value) => props.onUpdate(props.side, { intensity: value / 100 })} />
      <label className="select-row premium-select">
        <span>Easing</span>
        <select value={animation.easing} onChange={(event) => props.onUpdate(props.side, { easing: event.target.value as VideoClipAnimation["easing"] })}>
          <option value="linear">Linear</option>
          <option value="ease-in">Ease In</option>
          <option value="ease-out">Ease Out</option>
          <option value="ease-in-out">Ease In Out</option>
          <option value="back-out">Back Out</option>
        </select>
      </label>
      {showDirection && (
        <div className="segmented four" aria-label="Animation direction">
          {(["up", "down", "left", "right"] as const).map((direction) => (
            <button className={animation.direction === direction ? "active" : ""} key={direction} onClick={() => props.onUpdate(props.side, { direction })}>
              {direction}
            </button>
          ))}
        </div>
      )}
      {showDistance && <Range label="Distance" value={animation.distance} min={0} max={800} step={1} suffix="px" onChange={(value) => props.onUpdate(props.side, { distance: value })} />}
      {showScale && <Range label="Scale Amount" value={animation.scaleAmount * 100} min={-100} max={100} step={1} suffix="%" onChange={(value) => props.onUpdate(props.side, { scaleAmount: value / 100 })} />}
      {showRotation && <Range label="Rotation" value={animation.rotationAmount} min={-90} max={90} step={1} suffix=" deg" onChange={(value) => props.onUpdate(props.side, { rotationAmount: value })} />}
      {showBlur && <Range label="Blur" value={animation.blurAmount} min={0} max={40} step={0.5} suffix="px" onChange={(value) => props.onUpdate(props.side, { blurAmount: value })} />}
      {showWipe && <Range label="Wipe Softness" value={animation.wipeSoftness} min={0} max={40} step={1} suffix="px" onChange={(value) => props.onUpdate(props.side, { wipeSoftness: value })} />}
      {showAnchor && (
        <div className="field-row two">
          <label>Anchor</label>
          <NumberInput value={animation.anchorX} min={0} max={1} step={0.05} onChange={(value) => props.onUpdate(props.side, { anchorX: value })} />
          <NumberInput value={animation.anchorY} min={0} max={1} step={0.05} onChange={(value) => props.onUpdate(props.side, { anchorY: value })} />
        </div>
      )}
      <div className="text-animation-status">
        <span>Playhead</span>
        <strong>{props.playhead.toFixed(2)}s</strong>
      </div>
    </section>
  );
}

function TextAnimationPanel(props: {
  animations: ReturnType<typeof normalizeTextClipAnimations>;
  clipDuration: number;
  playhead: number;
  side: TextAnimationSide;
  onSide: (side: TextAnimationSide) => void;
  onPreset: (side: TextAnimationSide, presetId: string) => void;
  onPreview: (side: TextAnimationSide) => void;
  onReset: (side: TextAnimationSide) => void;
  onUpdate: (side: TextAnimationSide, patch: Partial<TextAnimation>) => void;
}) {
  const animation = props.animations[props.side];
  const presets = props.side === "in" ? inTextAnimationPresets : outTextAnimationPresets;
  const showDirection = animation.type === "slide" || animation.type === "rise";
  const showScale = animation.type === "pop" || animation.type === "zoom" || animation.type === "stretch" || animation.type === "shrink";
  const showBlur = animation.type === "blur";
  const showCharacter = animation.type === "typewriter";
  const showWord = animation.type === "word-reveal";
  const maxDuration = Math.max(0.1, Math.min(10, props.clipDuration));
  return (
    <section className="inspector-card text-animation-card">
      <SectionTitle
        icon={<Play size={15} />}
        label="Text Animation"
        action={
          <div className="title-actions">
            <button title="Preview selected text animation" onClick={() => props.onPreview(props.side)}><Play size={14} /></button>
            <button title="Reset selected text animation" onClick={() => props.onReset(props.side)}><RotateCcw size={15} /></button>
          </div>
        }
      />
      <div className="segmented text-animation-side" aria-label="Text animation side">
        <button className={props.side === "in" ? "active" : ""} onClick={() => props.onSide("in")}>In</button>
        <button className={props.side === "out" ? "active" : ""} onClick={() => props.onSide("out")}>Out</button>
      </div>
      <div className="text-animation-presets">
        {presets.map((preset) => (
          <button
            className={animation.enabled && animation.type === preset.type ? "active" : ""}
            key={preset.id}
            title={preset.description}
            onClick={() => props.onPreset(props.side, preset.id)}
          >
            <strong>{preset.label}</strong>
            <span>{preset.type.replace("-", " ")}</span>
          </button>
        ))}
      </div>
      <label className="check-row">
        <input type="checkbox" checked={animation.enabled} onChange={(event) => props.onUpdate(props.side, { enabled: event.target.checked })} />
        <span>Enable {props.side === "in" ? "in" : "out"} animation</span>
      </label>
      <Range label="Duration" value={animation.duration} min={0.05} max={maxDuration} step={0.05} suffix="s" onChange={(value) => props.onUpdate(props.side, { duration: value })} />
      <Range label="Delay" value={Math.min(animation.delay, props.clipDuration)} min={0} max={Math.max(0, props.clipDuration - 0.05)} step={0.05} suffix="s" onChange={(value) => props.onUpdate(props.side, { delay: value })} />
      <Range label="Intensity" value={animation.intensity * 100} min={0} max={200} step={1} suffix="%" onChange={(value) => props.onUpdate(props.side, { intensity: value / 100 })} />
      <label className="select-row premium-select">
        <span>Easing</span>
        <select value={animation.easing} onChange={(event) => props.onUpdate(props.side, { easing: event.target.value as TextAnimation["easing"] })}>
          <option value="linear">Linear</option>
          <option value="ease-in">Ease In</option>
          <option value="ease-out">Ease Out</option>
          <option value="ease-in-out">Ease In Out</option>
          <option value="back-out">Back Out</option>
        </select>
      </label>
      {showDirection && (
        <>
          <div className="segmented four" aria-label="Animation direction">
            {(["up", "down", "left", "right"] as const).map((direction) => (
              <button className={animation.direction === direction ? "active" : ""} key={direction} onClick={() => props.onUpdate(props.side, { direction })}>
                {direction}
              </button>
            ))}
          </div>
          <Range label="Distance" value={animation.distance} min={0} max={500} step={1} suffix="px" onChange={(value) => props.onUpdate(props.side, { distance: value })} />
        </>
      )}
      {showScale && <Range label="Scale Amount" value={animation.scale * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => props.onUpdate(props.side, { scale: value / 100 })} />}
      {showBlur && <Range label="Blur" value={animation.blur} min={0} max={40} step={0.5} suffix="px" onChange={(value) => props.onUpdate(props.side, { blur: value })} />}
      {showCharacter && <Range label="Character Stagger" value={animation.characterStagger} min={0} max={0.2} step={0.005} suffix="s" onChange={(value) => props.onUpdate(props.side, { characterStagger: value })} />}
      {showWord && <Range label="Word Stagger" value={animation.wordStagger} min={0} max={0.5} step={0.01} suffix="s" onChange={(value) => props.onUpdate(props.side, { wordStagger: value })} />}
      <div className="text-animation-status">
        <span>Playhead</span>
        <strong>{props.playhead.toFixed(2)}s</strong>
      </div>
    </section>
  );
}

function SectionTitle(props: { icon: ReactNode; label: string; action?: ReactNode }) {
  return (
    <h3 className="inspector-title">
      <span>{props.icon}{props.label}</span>
      {props.action}
    </h3>
  );
}

function TransitionInspector(props: {
  transition: TransitionInstance;
  onChange: (patch: Partial<TransitionInstance>) => void;
  onCopy: () => void;
  onDelete: () => void;
  onPaste: () => void;
  onReplace: (type: string) => void;
}) {
  const definition = transitionDefinition(props.transition.type);
  const needsDirection = ["slide-left", "slide-right", "slide-up", "slide-down", "push", "wipe", "whip-pan", "mask-reveal"].includes(props.transition.type);
  const needsColor = ["fade-black", "dip-white", "flash", "light-leak", "film-burn"].includes(props.transition.type);
  return (
    <div className="inspector-scroll">
      <section className="inspector-card transition-inspector-card">
        <SectionTitle
          icon={<Layers size={16} />}
          label="Transition"
          action={
            <div className="title-actions">
              <button title="Copy transition" onClick={props.onCopy}><Copy size={14} /></button>
              <button title="Paste transition settings" onClick={props.onPaste}><ClipboardPaste size={14} /></button>
              <button title="Reset transition" onClick={() => props.onReplace(props.transition.type)}><RotateCcw size={15} /></button>
              <button title="Delete transition" onClick={props.onDelete}><Trash2 size={14} /></button>
            </div>
          }
        />
        <label className="select-row stacked">
          <span>Type</span>
          <select value={props.transition.type} onChange={(event) => props.onReplace(event.target.value)}>
            {transitionDefinitions.map((item) => (
              <option value={item.id} key={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <div className="transition-inspector-preview">
          <img src={definition.previewPath} alt="" />
          <div>
            <strong>{definition.name}</strong>
            <span>{definition.category} / {definition.compatibility === "fully-supported" ? "Export mapped" : definition.compatibility === "approximate" ? "Approximate export" : "Preview only"}</span>
          </div>
        </div>
        <Range label="Duration" value={props.transition.duration} min={0.05} max={60} step={0.05} suffix="s" onChange={(duration) => props.onChange({ duration })} />
        <Range label="Intensity" value={(props.transition.intensity ?? 0.7) * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => props.onChange({ intensity: value / 100 })} />
        <Range label="Softness" value={(props.transition.softness ?? 0.2) * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => props.onChange({ softness: value / 100 })} />
        <Range label="Blur" value={props.transition.blurAmount ?? 0} min={0} max={80} step={1} suffix="px" onChange={(blurAmount) => props.onChange({ blurAmount })} />
        <Range label="Zoom" value={(props.transition.zoomAmount ?? 0.16) * 100} min={0} max={200} step={1} suffix="%" onChange={(value) => props.onChange({ zoomAmount: value / 100 })} />
        <Range label="Rotation" value={props.transition.rotation ?? 0} min={-720} max={720} step={1} suffix=" deg" onChange={(rotation) => props.onChange({ rotation })} />
        {needsDirection && (
          <label className="select-row stacked">
            <span>Direction</span>
            <select value={props.transition.direction ?? "left"} onChange={(event) => props.onChange({ direction: event.target.value as TransitionDirection })}>
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="up">Up</option>
              <option value="down">Down</option>
            </select>
          </label>
        )}
        <label className="select-row stacked">
          <span>Easing</span>
          <select value={props.transition.easing} onChange={(event) => props.onChange({ easing: event.target.value as TransitionEasing })}>
            <option value="linear">Linear</option>
            <option value="ease-in">Ease In</option>
            <option value="ease-out">Ease Out</option>
            <option value="ease-in-out">Ease In Out</option>
          </select>
        </label>
        {needsColor && <Color label="Color" value={props.transition.color ?? "#ffffff"} onChange={(color) => props.onChange({ color })} />}
        <label className="toggle-row">
          <span>Reverse motion</span>
          <input type="checkbox" checked={props.transition.reversed} onChange={(event) => props.onChange({ reversed: event.target.checked })} />
        </label>
      </section>
    </div>
  );
}

function Range(props: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (value: number) => void }) {
  const range = props.max - props.min || 1;
  const fill = `${Math.min(100, Math.max(0, ((props.value - props.min) / range) * 100))}%`;
  return (
    <div className="range-row premium-range" style={{ "--range-fill": fill } as CSSProperties}>
      <label>{props.label}</label>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value} onChange={(event) => props.onChange(Number(event.target.value))} />
      <NumberInput value={props.value} min={props.min} max={props.max} step={props.step} suffix={props.suffix} onChange={props.onChange} />
    </div>
  );
}

function NumberInput(props: { value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  const step = props.step ?? 1;
  return (
    <label className="number-box">
      <input
        type="number"
        min={props.min}
        max={props.max}
        step={step}
        value={Number.isInteger(props.value) ? props.value : Number(props.value.toFixed(2))}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (Number.isFinite(value)) props.onChange(Math.min(props.max, Math.max(props.min, value)));
        }}
      />
      {props.suffix && <span>{props.suffix}</span>}
    </label>
  );
}

function Color(props: { label: string; value: string; onChange: (value: TextSettings["color"]) => void }) {
  return (
    <label className="color-chip">
      <span>{props.label}</span>
      <input type="color" value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}
