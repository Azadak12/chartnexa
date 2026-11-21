import { View } from "react-native";
import { spacing } from "../theme";
import { Text } from "../ui";
import { TopBarRow } from "./TopBar";

export { initialsOf } from "./TopBar";

/**
 * The Home greeting block. With `bar` (the default, used on its own) it also draws the brand row;
 * inside the tab layout the persistent TopBar already does, so Home passes `bar={false}`.
 */
export function AppHeader({
  greeting,
  subtitle,
  unread = 0,
  onBell,
  name,
  onProfile,
  bar = true,
}: {
  greeting: string;
  subtitle?: string;
  unread?: number;
  onBell?: () => void;
  name?: string | null;
  onProfile?: () => void;
  bar?: boolean;
}) {
  return (
    <View style={{ gap: spacing.sm }} testID="app-header">
      {bar ? <TopBarRow unread={unread} onBell={onBell} name={name} onProfile={onProfile} /> : null}
      <Text variant="title" testID="header-greeting">
        {greeting}
      </Text>
      {subtitle ? <Text tone="muted">{subtitle}</Text> : null}
    </View>
  );
}
