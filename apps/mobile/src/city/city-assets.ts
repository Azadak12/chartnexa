import type { ImageSourcePropType } from "react-native";

/**
 * Artwork slots for the Market City. Each slot is filled by a commissioned, licensed image; until
 * then `source` is null and the scene draws a clearly provisional vector skyline instead.
 * Exact production specifications: docs/design/market-city-assets.md.
 */
export interface CityLayerSlot {
  id: "sky" | "skyline" | "campus" | "foreground";
  /** Replace with `require("../../assets/city/<file>.webp")` when the artwork is delivered. */
  source: ImageSourcePropType | null;
}

export const CITY_LAYERS: readonly CityLayerSlot[] = [
  { id: "sky", source: null },
  { id: "skyline", source: null },
  { id: "campus", source: null },
  { id: "foreground", source: null },
];

/** True once every slot has real artwork. The provisional-art notice disappears then. */
export const CITY_ART_COMPLETE = CITY_LAYERS.every((l) => l.source !== null);

/** The scene is always this shape, so art layers and tap areas can share percentage coordinates. */
export const SCENE_ASPECT = 100 / 90;

export interface Destination {
  key: string;
  label: string;
  spoken: string;
  route: "/courses" | "/explore" | "/lab" | "/assignments";
  /** Tap area as fractions of the scene: left, top, width, height. */
  box: { x: number; y: number; w: number; h: number };
}

export const DESTINATIONS: readonly Destination[] = [
  {
    key: "learn",
    label: "Academy",
    spoken: "Learning Academy: My Learning",
    route: "/courses",
    box: { x: 0.05, y: 0.3, w: 0.23, h: 0.5 },
  },
  {
    key: "explore",
    label: "Library",
    spoken: "Course Library: Explore courses",
    route: "/explore",
    box: { x: 0.3, y: 0.46, w: 0.2, h: 0.34 },
  },
  {
    key: "lab",
    label: "Lab",
    spoken: "Market Observatory: Learning Lab",
    route: "/lab",
    box: { x: 0.52, y: 0.38, w: 0.21, h: 0.42 },
  },
  {
    key: "tasks",
    label: "Missions",
    spoken: "Mission Center: Assignments",
    route: "/assignments",
    box: { x: 0.75, y: 0.52, w: 0.2, h: 0.28 },
  },
];
