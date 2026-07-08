import { Captions, Layers3, Library, MonitorDot, Music, SlidersHorizontal, Sparkles, Sticker } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";

const items = [
  ["Media", Library],
  ["Audio", Music],
  ["Text", Captions],
  ["Stickers", Sticker],
  ["Effects", Sparkles],
  ["Transitions", Layers3],
  ["Filters", SlidersHorizontal],
  ["Screen Recorder", MonitorDot]
] as const;

export function Sidebar() {
  const activePanel = useEditorStore((state) => state.activePanel);
  const setActivePanel = useEditorStore((state) => state.setActivePanel);

  return (
    <aside className="side-nav">
      {items.map(([label, Icon]) => (
        <button
          className={`side-nav-item ${activePanel === label ? "active" : ""}`}
          key={label}
          title={label}
          onClick={() => setActivePanel(label)}
        >
          <Icon size={21} />
          <span>{label}</span>
        </button>
      ))}
    </aside>
  );
}
