import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { colors, neutrals } from "../../../src/theme";

type Icon = React.ComponentProps<typeof Feather>["name"];
const tab = (name: string, title: string, icon: Icon) => (
  <Tabs.Screen
    key={name}
    name={name}
    options={{
      title,
      tabBarAccessibilityLabel: title,
      tabBarIcon: ({ color, size }) => <Feather name={icon} size={size} color={color as string} />,
    }}
  />
);

export default function TabsLayout() {
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
      {tab("courses", "My Courses", "book-open")}
      {tab("assignments", "Assignments", "clipboard")}
      {tab("profile", "Profile", "user")}
    </Tabs>
  );
}
