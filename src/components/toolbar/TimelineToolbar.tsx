import { Copy, Crop, Diamond, Layers, Magnet, SplitSquareHorizontal, Trash2 } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";

export function TimelineToolbar() {
  const splitSelected = useEditorStore((state) => state.splitSelected);
  const deleteSelected = useEditorStore((state) => state.deleteSelected);
  const duplicateSelected = useEditorStore((state) => state.duplicateSelected);
  const addMarker = useEditorStore((state) => state.addMarker);
  const addTimelineTrack = useEditorStore((state) => state.addTimelineTrack);
  const applyTimelineTool = useEditorStore((state) => state.applyTimelineTool);
  const snapping = useEditorStore((state) => state.timelineUi.snapping);
  const toggleTimelineSnapping = useEditorStore((state) => state.toggleTimelineSnapping);

  return (
    <section className="timeline-toolbar">
      <button onClick={splitSelected} title="Split selected clip at playhead (S)"><SplitSquareHorizontal size={16} /> Split</button>
      <button onClick={duplicateSelected} title="Duplicate selected clip (Ctrl+D)"><Copy size={16} /> Duplicate</button>
      <button onClick={() => addMarker()} title="Add marker at playhead"><Diamond size={16} /> Marker</button>
      <button onClick={() => addTimelineTrack()} title="Add layer"><Layers size={16} /> Add Layer</button>
      <button onClick={deleteSelected} title="Delete selected clip"><Trash2 size={16} /> Delete</button>
      <button onClick={() => applyTimelineTool("crop")} title="Show crop controls for the selected visual clip"><Crop size={16} /> Crop</button>
      <button className={snapping ? "active" : ""} onClick={toggleTimelineSnapping} title="Toggle magnetic snapping (N)"><Magnet size={16} /> Magnet</button>
    </section>
  );
}
