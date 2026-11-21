import { useRouter } from "expo-router";
import { Image, View } from "react-native";
import { spacing } from "../theme";
import { Feather } from "@expo/vector-icons";
import { colors, market, radii } from "../theme";
import { Button, Screen, StatusPill, Text } from "../ui";
import { HEADER_ART } from "../kit/header-art";
import { CandleQuiz } from "./CandleQuiz";
import { ChartCard } from "./ChartCard";

/** The Trading Learning Lab: explore a chart, then test yourself. No trading, no live prices. */
export function LabScreen() {
  const router = useRouter();
  return (
    <Screen>
      <View
        testID="observatory-header"
        style={{
          borderRadius: radii.card,
          overflow: "hidden",
          backgroundColor: market.navy,
          borderWidth: 1,
          borderColor: market.grid,
        }}
      >
        <Image
          source={HEADER_ART.lab}
          accessible={false}
          resizeMode="cover"
          style={{ width: "100%", aspectRatio: 941 / 126 }}
          testID="observatory-art"
        />
        <View style={{ gap: spacing.sm, padding: spacing.lg }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing.sm,
            }}
          >
            <Text variant="caption" style={{ color: market.blueOnNavy, letterSpacing: 0.8 }}>
              MARKET OBSERVATORY
            </Text>
            <Feather name="activity" size={20} color={colors.blue} accessible={false} />
          </View>
          <Text variant="title" accessibilityRole="header" style={{ color: market.onNavy }}>
            Learning Lab
          </Text>
          <StatusPill label="Simulated data" tone="warning" icon="info" />
          <Text style={{ color: market.onNavyMuted }}>
            Practise reading candlesticks on simulated charts. Nothing here is a live market or a
            recommendation, and no trades can be placed.
          </Text>
        </View>
      </View>
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
