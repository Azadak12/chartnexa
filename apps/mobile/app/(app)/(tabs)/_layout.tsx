import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Redirect, Tabs, usePathname } from "expo-router";
import { fetchAccess } from "../../../src/courses/course-api";
import { ALL_TAB_NAMES, roleOf, tabsFor, type TabSpec } from "../../../src/staff/role-tabs";
import { colors, neutrals } from "../../../src/theme";

type Icon = React.ComponentProps<typeof Feather>["name"];
/** Titles for hidden tabs, which still need a label if they are ever opened by a link. */
const ALL_SPECS: TabSpec[] = (["student", "instructor", "manager", "admin"] as const).flatMap((r) =>
  tabsFor(r),
);
const tab = (name: string, title: string, icon: Icon, hidden = false) => (
  <Tabs.Screen
    key={name}
    name={name}
    options={{
      title,
      tabBarAccessibilityLabel: title,
      // A hidden tab keeps its route (a link or the current screen can still be on it) but has no
      // button. Using href: null here would drop the screen when the role loads after the first render.
      ...(hidden ? { tabBarButton: () => null } : {}),
      tabBarIcon: ({ color, size }) => <Feather name={icon} size={size} color={color as string} />,
    }}
  />
);

export default function TabsLayout() {
  // The tab bar follows the role. The list is only a convenience: the server checks every request.
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const role = roleOf(access.data);
  const visible = tabsFor(role);
  const shown = new Set(visible.map((t) => t.name));
  const pathname = usePathname();
  // Staff land on their dashboard, not on the student Home.
  if (role !== "student" && pathname === "/home") return <Redirect href="/dashboard" />;
  const titles = new Map(visible.map((t) => [t.name, t]));
  const spec = (name: string): TabSpec =>
    titles.get(name) ??
    ALL_SPECS.find((t) => t.name === name) ?? { name, title: name, icon: "grid" };
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: neutrals.muted,
        tabBarStyle: { backgroundColor: colors.white },
      }}
    >
      {ALL_TAB_NAMES.map((name) => {
        const t = spec(name);
        return tab(name, t.title, t.icon, !shown.has(name));
      })}
    </Tabs>
  );
}
