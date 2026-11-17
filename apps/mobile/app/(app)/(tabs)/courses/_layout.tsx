import { Stack } from "expo-router";

/** Each tab owns its stack, so leaving a tab and coming back keeps where the person was. */
export default function CoursesStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
