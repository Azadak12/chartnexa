import { View } from "react-native";
import type { CourseTone } from "@chartnexa/api-contracts";
import { CoverBlock } from "../courses/CoverBlock";
import { radii } from "../theme";

/** A course picture at a fixed 16:9 shape, so cards line up and nothing shifts while images load. */
export function CourseThumbnail({
  tone,
  thumbnailUrl,
  width,
  height,
  rounded = radii.control,
}: {
  tone: CourseTone;
  thumbnailUrl: string | null;
  width?: number;
  height?: number;
  rounded?: number;
}) {
  const h = height ?? (width ? Math.round((width * 9) / 16) : 150);
  return (
    <View style={{ width: width ?? "100%", height: h, borderRadius: rounded, overflow: "hidden" }}>
      <CoverBlock tone={tone} height={h} thumbnailUrl={thumbnailUrl} />
    </View>
  );
}
