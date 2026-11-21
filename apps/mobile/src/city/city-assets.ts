/* eslint-disable @typescript-eslint/no-require-imports -- Metro needs static require() for bundled images. */
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

/**
 * The Home hero picture: a cropped region of the approved concept render (lounge, wall sign, bull).
 * It is illustration, not a live view of anything; its screens show no real prices.
 */
export const HERO_ART: ImageSourcePropType = require("../../assets/city/academy-hero.webp");
/** Width / height of the hero picture. */
export const HERO_ASPECT = 886 / 274;

/** True once every slot has real artwork. The provisional-art notice disappears then. */
export const CITY_ART_COMPLETE = CITY_LAYERS.every((l) => l.source !== null);

/** The scene is always this shape, so art layers and tap areas can share percentage coordinates. */
export const SCENE_ASPECT = 100 / 90;

export interface Destination {
  key: string;
  label: string;
  spoken: string;
  /** Feather icon shown on the tile control. */
  icon: "award" | "book-open" | "activity" | "target";
  /** Cropped illustration for the tile control. */
  art: ImageSourcePropType;
  route: "/courses" | "/explore" | "/lab" | "/assignments";
  /** Tap area as fractions of the scene: left, top, width, height. */
  box: { x: number; y: number; w: number; h: number };
}

export const DESTINATIONS: readonly Destination[] = [
  {
    key: "learn",
    art: require("../../assets/city/tile-learn.webp"),
    icon: "award",
    label: "Academy",
    spoken: "Learning Academy: My Learning",
    route: "/courses",
    box: { x: 0.05, y: 0.3, w: 0.23, h: 0.5 },
  },
  {
    key: "explore",
    art: require("../../assets/city/tile-explore.webp"),
    icon: "book-open",
    label: "Library",
    spoken: "Course Library: Explore courses",
    route: "/explore",
    box: { x: 0.3, y: 0.46, w: 0.2, h: 0.34 },
  },
  {
    key: "lab",
    art: require("../../assets/city/tile-lab.webp"),
    icon: "activity",
    label: "Lab",
    spoken: "Market Observatory: Learning Lab",
    route: "/lab",
    box: { x: 0.52, y: 0.38, w: 0.21, h: 0.42 },
  },
  {
    key: "tasks",
    art: require("../../assets/city/tile-tasks.webp"),
    icon: "target",
    label: "Missions",
    spoken: "Mission Center: Assignments",
    route: "/assignments",
    box: { x: 0.75, y: 0.52, w: 0.2, h: 0.28 },
  },
];
