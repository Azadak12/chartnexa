import { Feather } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { View } from "react-native";
import { colors, radii, spacing } from "../theme";
import { Text } from "../ui";

type Icon = ComponentProps<typeof Feather>["name"];

/**
 * The title block every staff screen opens with: a small area label, the page title (the screen's
 * header for assistive technology), an optional line of support and an optional action row.
 * Operational screens stay calm: no artwork behind forms.
 */
export function StaffPageHeader({
  title,
  eyebrow,
  icon,
  subtitle,
  children,
}: {
  title: string;
  eyebrow: string;
  icon: Icon;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 32,
            height: 32,
            borderRadius: radii.control,
            backgroundColor: colors.blueTint,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name={icon} size={16} color={colors.blue} />
        </View>
        <Text variant="caption" tone="link" style={{ letterSpacing: 0.8, fontWeight: "700" }}>
          {eyebrow}
        </Text>
      </View>
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text tone="muted">{subtitle}</Text> : null}
      {children}
    </View>
  );
}
