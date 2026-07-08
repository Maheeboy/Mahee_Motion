import { X } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";

export function Toasts() {
  const toasts = useEditorStore((state) => state.toasts);
  const dismissToast = useEditorStore((state) => state.dismissToast);
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div className={`toast toast-${toast.kind}`} key={toast.id}>
          <span>{toast.message}</span>
          <button aria-label="Dismiss" onClick={() => dismissToast(toast.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
