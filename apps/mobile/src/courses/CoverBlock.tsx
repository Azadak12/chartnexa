import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import type { CourseTone } from "@chartnexa/api-contracts";
import { apiBaseUrl } from "../api/client";
import { colors, neutrals, radii } from "../theme";

const tones: Record<CourseTone, { bg: string; fg: string }> = {
  blue: { bg: colors.blue, fg: colors.onBlue },
  black: { bg: colors.ink, fg: colors.onBlue },
  tint: { bg: colors.blueTint, fg: colors.blue },
};

/**
 * A course's picture: its thumbnail when it has one, otherwise one of three brand colours with
 * an icon. While the image loads, the colour shows with a spinner; if it cannot load (offline,
 * removed), the colour stays, so a card never looks broken. The image address changes whenever
 * the picture does, so the device can keep it for as long as it likes.
 */
export function CoverBlock({
  tone,
  height = 96,
  thumbnailUrl = null,
}: {
  tone: CourseTone;
  height?: number;
  thumbnailUrl?: string | null;
}) {
  const t = tones[tone];
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  useEffect(() => setState("loading"), [thumbnailUrl]);
  const showImage = thumbnailUrl !== null && state !== "failed";
  return (
    <View
      style={[styles.block, { backgroundColor: t.bg, height }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      testID="cover"
    >
      {showImage ? (
        <>
          <Image
            testID="cover-image"
            source={{ uri: `${apiBaseUrl()}${thumbnailUrl}` }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onLoad={() => setState("ready")}
            onError={() => setState("failed")}
          />
          {state === "loading" ? <ActivityIndicator color={neutrals.muted} /> : null}
        </>
      ) : (
        <Feather name="trending-up" size={Math.round(height / 2.5)} color={t.fg} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    borderRadius: radii.control,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
