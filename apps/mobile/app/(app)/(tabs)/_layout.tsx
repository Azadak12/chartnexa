import { useQuery } from "@tanstack/react-query";
import { Redirect, Tabs, usePathname } from "expo-router";
import { fetchAccess } from "../../../src/courses/course-api";
import { ALL_TAB_NAMES, roleOf, tabsFor, type TabSpec } from "../../../src/staff/role-tabs";
import { ResponsiveTabBar, type TabMeta } from "../../../src/kit/ResponsiveTabBar";

/** Titles for hidden tabs, which still need a label if they are ever opened by a link. */
const ALL_SPECS: TabSpec[] = (["student", "instructor", "manager", "admin"] as const).flatMap((r) =>
  tabsFor(r),
);
const tab = (name: string, title: string) => (
  <Tabs.Screen key={name} name={name} options={{ title, tabBarAccessibilityLabel: title }} />
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
    ALL_SPECS.find((t) => t.name === name) ?? { name, title: name, label: name, icon: "grid" };
  const meta: Record<string, TabMeta> = Object.fromEntries(
    ALL_TAB_NAMES.map((n) => {
      const t = spec(n);
      return [n, { label: t.label, icon: t.icon, hidden: !shown.has(n) }];
    }),
  );
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      // Hidden tabs keep their route (a link or the current screen can still be on it) but have no
      // item. href: null would drop the screen when the role loads after the first render.
      tabBar={(props) => <ResponsiveTabBar {...props} meta={meta} />}
    >
      {ALL_TAB_NAMES.map((name) => tab(name, spec(name).title))}
    </Tabs>
  );
}
