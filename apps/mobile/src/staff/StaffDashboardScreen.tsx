import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { isAppError, messageFor } from "../api/errors";
import { fetchAccess, isStaff } from "../courses/course-api";
import type { AccessResponse } from "@chartnexa/api-contracts";
import { Grid } from "../kit/Grid";
import { DashboardMetricCard } from "../kit/Rows";
import { StateView } from "../state/StateView";
import { colors, neutrals, radii, spacing } from "../theme";
import { Screen, Text } from "../ui";
import { AdminDashboard } from "./admin/AdminDashboard";
import { dashboardGroups, type Icon } from "./groups";
import { useAcademyMetrics, type Metric } from "./metrics";

/** The Instructor and Manager numbers, in a grid that cannot overlap what follows it. */
function Metrics({ a }: { a: AccessResponse }) {
  const router = useRouter();
  const m = useAcademyMetrics(a);
  const cards: { label: string; metric: Metric; route: string; icon: Icon }[] = [];
  if (m.people) {
    cards.push({
      label: "Pending invitations",
      metric: m.pending,
      route: "/profile/invitations",
      icon: "mail",
    });
    cards.push({
      label: "Instructors",
      metric: m.instructors,
      route: "/profile/invitations",
      icon: "users",
    });
  }
  if (m.courses) {
    cards.push({
      label: "Published courses",
      metric: m.published,
      route: "/manage",
      icon: "book-open",
    });
    cards.push({ label: "Draft courses", metric: m.drafts, route: "/manage", icon: "edit-3" });
  }
  if (cards.length === 0) return null;
  return (
    <View testID="metrics">
      <Grid>
        {cards.map((c) => (
          <DashboardMetricCard
            key={c.label}
            label={c.label}
            icon={c.icon}
            value={
              c.metric.status === "error"
                ? "Unavailable"
                : c.metric.status === "pending"
                  ? "…"
                  : c.metric.value
            }
            testID={`metric-${c.label}`}
            onPress={() => router.push(c.route as never)}
          />
        ))}
      </Grid>
    </View>
  );
}

/** A role-aware home for staff. Each tile opens a real screen; the server still checks every call. */
export function StaffDashboardScreen() {
  const router = useRouter();
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  if (access.status === "pending") {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  if (access.status === "error") {
    return (
      <Screen>
        <StateView
          state="error"
          message={isAppError(access.error) ? access.error.message : messageFor("unknown")}
          onAction={() => void access.refetch()}
        />
      </Screen>
    );
  }
  const a = access.data;
  if (!isStaff(a)) {
    return (
      <Screen>
        <StateView
          state="empty"
          title="Not available"
          message="The dashboard is for instructors, managers and admins."
        />
      </Screen>
    );
  }
  // Admins have the redesigned dashboard; the other roles keep theirs until they are redesigned.
  if (a.roles.includes("admin")) return <AdminDashboard access={a} />;
  const role = a.roles.includes("manager") ? "Manager" : "Instructor";
  const groups = dashboardGroups(a);
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        {role} dashboard
      </Text>
      <Text tone="muted">
        Everything here uses real data. What you see depends on your permissions.
      </Text>
      <Metrics a={a} />
      {groups.map((g) => {
        const tiles = g.tiles.filter((t) => t.show);
        if (tiles.length === 0) return null;
        return (
          <View key={g.title} style={{ gap: spacing.sm }}>
            <Text variant="subheading" accessibilityRole="header">
              {g.title}
            </Text>
            {tiles.map((t) => (
              <Pressable
                key={t.label}
                accessibilityRole="button"
                accessibilityLabel={`${t.label}. ${t.hint}`}
                onPress={() => router.push(t.route as never)}
                testID={`tile-${t.label}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  borderWidth: 1,
                  borderColor: neutrals.divider,
                  borderRadius: radii.card,
                  padding: spacing.md,
                  backgroundColor: colors.white,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: radii.control,
                    backgroundColor: colors.blueTint,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name={t.icon} size={22} color={colors.blue} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="subheading">{t.label}</Text>
                  <Text variant="caption" tone="muted">
                    {t.hint}
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color={neutrals.muted} />
              </Pressable>
            ))}
          </View>
        );
      })}
    </Screen>
  );
}
