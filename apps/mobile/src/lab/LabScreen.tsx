import { useRouter } from "expo-router";
import { View } from "react-native";
import { spacing } from "../theme";
import { Button, Screen, Text } from "../ui";
import { CandleQuiz } from "./CandleQuiz";
import { ChartCard } from "./ChartCard";

/** The Trading Learning Lab: explore a chart, then test yourself. No trading, no live prices. */
export function LabScreen() {
  const router = useRouter();
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Learning Lab
      </Text>
      <Text tone="muted">
        Practise reading candlesticks on simulated charts. Nothing here is a live market or a
        recommendation, and no trades can be placed.
      </Text>
      <ChartCard title="Explore a chart" seed={11} />
      <View style={{ gap: spacing.sm }}>
        <Text variant="heading" accessibilityRole="header">
          Exercise: bullish or bearish?
        </Text>
        <CandleQuiz seed={11} />
      </View>
      <Button
        label="Back"
        variant="tertiary"
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))}
      />
    </Screen>
  );
}
