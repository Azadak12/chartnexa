/* eslint-disable @typescript-eslint/no-require-imports -- Metro needs static require() for bundled images. */
import type { ImageSourcePropType } from "react-native";

/**
 * Header illustrations: cropped regions of the owner's Personal Trading Academy concept renders.
 * They are illustration only; any screens or tickers inside them are not real data.
 */
export const HEADER_ART: Record<"admin" | "manager" | "instructor" | "lab", ImageSourcePropType> = {
  admin: require("../../assets/headers/admin.webp"),
  manager: require("../../assets/headers/manager.webp"),
  instructor: require("../../assets/headers/instructor.webp"),
  lab: require("../../assets/headers/lab.webp"),
};
