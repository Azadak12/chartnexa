import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { colors, market, neutrals, radii, spacing } from "../theme";
import { Text } from "../ui";
import { WorkshopArt } from "./WorkshopArt";

export function WorkshopDashboard() {
  const router = useRouter();
  return (
    <View style={{ gap: spacing.lg }} testID="traders-workshop">
      <View style={styles.hero}>
        <View style={styles.row}>
          <Text variant="caption" tone="onBlue" style={{ letterSpacing: 2 }}>
            THE TRADER'S WORKSHOP
          </Text>
          <Feather name="crosshair" size={22} color={colors.onBlue} accessible={false} />
        </View>
        <Text accessibilityRole="header" style={styles.title}>
          Read the market.{"\n"}Train your mind.
        </Text>
        <Text tone="onBlue" style={{ maxWidth: 330 }}>
          A little knowledge. A deliberate decision. A better learning session.
        </Text>
        <WorkshopArt />
        <View style={styles.heroFooter}>
          <Text variant="caption" tone="onBlue">
            LEARN → PRACTICE → REFLECT
          </Text>
          <Text variant="caption" tone="onBlue">
            YOUR PACE
          </Text>
        </View>
      </View>
      <View style={styles.modes}>
        {(
          [
            {
              number: "01",
              title: "Learn",
              caption: "Your course path",
              icon: "map",
              route: "/courses",
            },
            {
              number: "02",
              title: "Practice",
              caption: "Read a chart",
              icon: "bar-chart-2",
              route: "/lab",
            },
            {
              number: "03",
              title: "Reflect",
              caption: "Train discipline",
              icon: "compass",
              route: "/mindset",
            },
          ] as const
        ).map((m) => (
          <Pressable
            key={m.number}
            accessibilityRole="button"
            accessibilityLabel={`${m.title}: ${m.caption}`}
            onPress={() => router.push(m.route)}
            style={({ pressed }) => [
              styles.mode,
              { backgroundColor: pressed ? colors.blueTint : colors.surface },
            ]}
          >
            <View style={styles.row}>
              <Text variant="caption" tone="muted">
                {m.number}
              </Text>
              <Feather name={m.icon} size={18} color={colors.blue} accessible={false} />
            </View>
            <Text variant="subheading">{m.title}</Text>
            <Text variant="caption" tone="muted">
              {m.caption}
            </Text>
          </Pressable>
        ))}
      </View>
      <MindsetInvitation />
    </View>
  );
}

export function MindsetInvitation() {
  const router = useRouter();
  return (
    <Pressable
      testID="mindset-invitation"
      accessibilityRole="button"
      accessibilityLabel="Enter the Mindset Arena: five trading psychology scenarios"
      onPress={() => router.push("/mindset")}
      style={({ pressed }) => [styles.arena, { opacity: pressed ? 0.9 : 1 }]}
    >
      <View style={styles.row}>
        <View style={styles.pill}>
          <Feather name="zap" size={14} color={market.onNavy} accessible={false} />
          <Text variant="caption" tone="onNavy">
            MINDSET ARENA
          </Text>
        </View>
        <Feather name="arrow-up-right" size={24} color={market.onNavy} accessible={false} />
      </View>
      <Text variant="title" tone="onNavy">
        Can you stick{"\n"}to your plan?
      </Text>
      <Text style={{ color: market.onNavy }}>
        FOMO. A losing streak. A tempting shortcut. Make the call, then unpack your decision.
      </Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {["Patience", "Discipline", "Reflection"].map((word, i) => (
          <View
            key={word}
            style={{
              flex: 1,
              borderTopWidth: 2,
              borderTopColor: market.blueOnNavy,
              paddingTop: spacing.sm,
              gap: spacing.xs,
            }}
          >
            <Text variant="caption" style={{ color: market.blueOnNavy }}>
              0{i + 1}
            </Text>
            <Text variant="caption" tone="onNavy">
              {word}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.arenaAction}>
        <Text variant="button" tone="onBlue">
          Enter the arena
        </Text>
        <Text variant="caption" tone="onBlue">
          5 decisions →
        </Text>
      </View>
      <Text variant="caption" style={{ color: market.onNavyMuted }}>
        Fictional scenarios · No trades or money
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.blue,
    borderRadius: radii.sheet,
    padding: spacing.xl,
    gap: spacing.md,
    overflow: "hidden",
  },
  title: {
    color: colors.onBlue,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: "700",
    letterSpacing: -1.4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  heroFooter: {
    borderTopWidth: 1,
    borderTopColor: market.blueOnNavy,
    paddingTop: spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  modes: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  mode: {
    flex: 1,
    minWidth: 85,
    minHeight: 112,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: neutrals.divider,
  },
  arena: {
    backgroundColor: market.navy,
    borderRadius: radii.sheet,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  pill: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  arenaAction: {
    minHeight: 48,
    padding: spacing.md,
    backgroundColor: colors.blue,
    borderRadius: radii.control,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
});
