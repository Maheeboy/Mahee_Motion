import { convertFileSrc } from "@tauri-apps/api/core";

export function mediaPathToSrc(path?: string): string | undefined {
  if (!path) return undefined;
  if (
    path.startsWith("/")
    || path.startsWith("http://")
    || path.startsWith("https://")
    || path.startsWith("data:")
    || path.startsWith("blob:")
  ) {
    return path;
  }
  return convertFileSrc(path);
}
