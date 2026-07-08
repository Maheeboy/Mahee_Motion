import type { StickerAnimationId } from "../types/editor";

export interface StickerPreset {
  id: string;
  label: string;
  category: "static" | "animated";
  path: string;
  width: number;
  height: number;
  animation?: StickerAnimationId;
}

export const staticStickerPresets: StickerPreset[] = [
  { id: "heart-pop", label: "Heart Pop", category: "static", path: "/stickers/static/mahee-heart-pop.png", width: 289, height: 319 },
  { id: "fire-flame", label: "Fire Flame", category: "static", path: "/stickers/static/mahee-fire-flame.png", width: 291, height: 341 },
  { id: "gold-crown", label: "Gold Crown", category: "static", path: "/stickers/static/mahee-gold-crown.png", width: 299, height: 306 },
  { id: "lightning-bolt", label: "Lightning Bolt", category: "static", path: "/stickers/static/mahee-lightning-bolt.png", width: 253, height: 320 },
  { id: "blue-rocket", label: "Blue Rocket", category: "static", path: "/stickers/static/mahee-blue-rocket.png", width: 272, height: 321 },
  { id: "party-burst", label: "Party Burst", category: "static", path: "/stickers/static/mahee-party-burst.png", width: 315, height: 363 },
  { id: "smiling-star", label: "Smiling Star", category: "static", path: "/stickers/static/mahee-smiling-star.png", width: 297, height: 299 },
  { id: "thumbs-up", label: "Thumbs Up", category: "static", path: "/stickers/static/mahee-thumbs-up.png", width: 285, height: 294 },
  { id: "sunglasses-smile", label: "Sunglasses Smile", category: "static", path: "/stickers/static/mahee-sunglasses-smile.png", width: 298, height: 289 },
  { id: "sparkle-arrow", label: "Sparkle Arrow", category: "static", path: "/stickers/static/mahee-sparkle-arrow.png", width: 265, height: 273 },
  { id: "neon-music-note", label: "Neon Music Note", category: "static", path: "/stickers/static/mahee-neon-music-note.png", width: 271, height: 314 },
  { id: "magic-wand", label: "Magic Wand", category: "static", path: "/stickers/static/mahee-magic-wand.png", width: 267, height: 329 },
  { id: "smiling-cloud", label: "Smiling Cloud", category: "static", path: "/stickers/static/mahee-smiling-cloud.png", width: 323, height: 270 },
  { id: "glossy-camera", label: "Glossy Camera", category: "static", path: "/stickers/static/mahee-glossy-camera.png", width: 290, height: 268 },
  { id: "red-bell", label: "Red Bell", category: "static", path: "/stickers/static/mahee-red-bell.png", width: 274, height: 282 },
  { id: "blue-gem", label: "Blue Gem", category: "static", path: "/stickers/static/mahee-blue-gem.png", width: 287, height: 288 },
  { id: "game-controller", label: "Game Controller", category: "static", path: "/stickers/static/mahee-game-controller.png", width: 337, height: 271 },
  { id: "gold-trophy", label: "Gold Trophy", category: "static", path: "/stickers/static/mahee-gold-trophy.png", width: 298, height: 330 },
  { id: "speech-bubble", label: "Speech Bubble", category: "static", path: "/stickers/static/mahee-speech-bubble.png", width: 281, height: 270 },
  { id: "rainbow-swirl", label: "Rainbow Swirl", category: "static", path: "/stickers/static/mahee-rainbow-swirl.png", width: 274, height: 279 },
  { id: "silver-mic", label: "Silver Mic", category: "static", path: "/stickers/static/mahee-silver-mic.png", width: 219, height: 348 },
  { id: "pink-gift", label: "Pink Gift", category: "static", path: "/stickers/static/mahee-pink-gift.png", width: 283, height: 308 },
  { id: "clapperboard", label: "Clapperboard", category: "static", path: "/stickers/static/mahee-clapperboard.png", width: 288, height: 315 },
  { id: "green-check", label: "Green Check", category: "static", path: "/stickers/static/mahee-green-check.png", width: 277, height: 283 },
  { id: "location-pin", label: "Location Pin", category: "static", path: "/stickers/static/mahee-location-pin.png", width: 219, height: 288 }
];

const stickerAnimationMap: Record<string, StickerAnimationId> = {
  "heart-pop": "heart-pop",
  "fire-flame": "flame-flicker",
  "gold-crown": "crown-shine",
  "lightning-bolt": "lightning-strike",
  "blue-rocket": "rocket-launch",
  "party-burst": "confetti-burst",
  "smiling-star": "star-glow",
  "thumbs-up": "thumb-approve",
  "sunglasses-smile": "cool-nod",
  "sparkle-arrow": "arrow-trend",
  "neon-music-note": "music-bop",
  "magic-wand": "wand-spark",
  "smiling-cloud": "cloud-drift",
  "glossy-camera": "camera-flash",
  "red-bell": "bell-ring",
  "blue-gem": "gem-sparkle",
  "game-controller": "controller-rumble",
  "gold-trophy": "trophy-lift",
  "speech-bubble": "bubble-chat",
  "rainbow-swirl": "rainbow-spin",
  "silver-mic": "mic-pulse",
  "pink-gift": "gift-pop",
  "clapperboard": "clap-snap",
  "green-check": "check-confirm",
  "location-pin": "pin-drop"
};

export const animatedStickerPresets: StickerPreset[] = staticStickerPresets.map((sticker) => ({
  ...sticker,
  id: `animated-${sticker.id}`,
  label: `${sticker.label} Loop`,
  category: "animated",
  animation: stickerAnimationMap[sticker.id] ?? "heart-pop"
}));

export const stickerLibrary: StickerPreset[] = [...staticStickerPresets, ...animatedStickerPresets];
export const stickerPresets: StickerPreset[] = stickerLibrary;
