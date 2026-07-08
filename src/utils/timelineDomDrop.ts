import { pixelsToSeconds } from "./time";
import type { PointerEvent as ReactPointerEvent } from "react";

export interface TimelinePointerDrop {
  trackId: string;
  time: number;
}

export function timelineDropFromPoint(clientX: number, clientY: number): TimelinePointerDrop | undefined {
  const element = document.elementFromPoint(clientX, clientY);
  const lane = element?.closest<HTMLElement>(".track-lane[data-track-id]");
  if (!lane?.dataset.trackId) return undefined;
  const pxPerSecond = Number(lane.dataset.pxPerSecond);
  if (!Number.isFinite(pxPerSecond) || pxPerSecond <= 0) return undefined;
  const rect = lane.getBoundingClientRect();
  return {
    trackId: lane.dataset.trackId,
    time: pixelsToSeconds(Math.max(0, clientX - rect.left), pxPerSecond)
  };
}

export function beginTimelinePointerDrag(
  event: ReactPointerEvent<HTMLElement>,
  label: string,
  onDrop: (drop: TimelinePointerDrop) => void,
  onMiss: () => void,
  onDragState?: (dragging: boolean) => void
) {
  if (event.button !== 0) return;
  const startX = event.clientX;
  const startY = event.clientY;
  let moved = false;
  let ghost: HTMLDivElement | undefined;

  const moveGhost = (clientX: number, clientY: number) => {
    if (!ghost) {
      ghost = document.createElement("div");
      ghost.className = "timeline-drag-ghost";
      ghost.textContent = label;
      document.body.appendChild(ghost);
      onDragState?.(true);
    }
    ghost.style.transform = `translate3d(${clientX + 14}px, ${clientY + 14}px, 0)`;
  };

  const cleanup = () => {
    ghost?.remove();
    ghost = undefined;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    onDragState?.(false);
  };

  const onMove = (moveEvent: PointerEvent) => {
    const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
    if (!moved && distance < 5) return;
    moved = true;
    moveEvent.preventDefault();
    moveGhost(moveEvent.clientX, moveEvent.clientY);
  };

  const onUp = (upEvent: PointerEvent) => {
    if (moved) {
      upEvent.preventDefault();
      const drop = timelineDropFromPoint(upEvent.clientX, upEvent.clientY);
      if (drop) onDrop(drop);
      else onMiss();
    }
    cleanup();
  };

  const onCancel = () => cleanup();

  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", onUp, { passive: false });
  window.addEventListener("pointercancel", onCancel);
}
