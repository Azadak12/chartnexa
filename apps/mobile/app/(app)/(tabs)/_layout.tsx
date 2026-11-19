import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Tabs } from "expo-router";
import { fetchAccess, isStaff } from "../../../src/courses/course-api";
import { colors, neutrals } from "../../../src/theme";

type Icon = React.ComponentProps<typeof Feather>["name"];
const tab = (name: string, title: string, icon: Icon, hidden = false) => (
  <Tabs.Screen
    key={name}
    name={name}
    options={{
      title,
      tabBarAccessibilityLabel: title,
      // A hidden tab keeps its screen but is not in the bar.
      ...(hidden ? { href: null } : {}),
      tabBarIcon: ({ color, size }) => <Feather name={icon} size={size} color={color as string} />,
    }}
  />
);

export default function TabsLayout() {
  // Staff see a Dashboard tab. The list is only a convenience: the server checks every request.
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const staff = isStaff(access.data);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: neutrals.muted,
        tabBarStyle: { backgroundColor: colors.white },
      }}
    >
      {tab("home", "Home", "home")}
      {tab("courses", "My Learning", "book-open")}
      {tab("assignments", "Assignments", "clipboard")}
      {tab("dashboard", "Dashboard", "grid", !staff)}
      {tab("profile", "Profile", "user")}
    </Tabs>
  );
}
