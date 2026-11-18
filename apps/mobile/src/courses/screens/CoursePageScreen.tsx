import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { isAppError, messageFor } from "../../api/errors";
import { shouldRetry } from "../../state/query-client";
import { StateView } from "../../state/StateView";
import { spacing } from "../../theme";
import { Banner, Button, Screen, Text } from "../../ui";
import { courseApi } from "../course-api";
import { LEVEL_LABEL } from "../CourseCard";
import { CoverBlock } from "../CoverBlock";
import { formatPrice } from "../money";

export function CoursePageScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({
    queryKey: ["course", id],
    queryFn: () => courseApi.get(String(id)),
    // Only transient failures are retried; a missing or forbidden course will not appear by retrying.
    retry: shouldRetry,
  });
  const goHome = () => (router.canGoBack() ? router.back() : router.replace("/home"));

  if (query.status === "pending") {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  if (query.status === "error") {
    const e = query.error;
    if (isAppError(e) && e.kind === "not_found") {
      return (
        <Screen>
          <StateView
            state="empty"
            title="Course not found"
            message="This course is not available. It may have been removed."
            actionLabel="Back to courses"
            onAction={goHome}
          />
        </Screen>
      );
    }
    return (
      <Screen>
        <StateView
          state={isAppError(e) && e.kind === "network" ? "offline" : "error"}
          message={isAppError(e) ? e.message : messageFor("unknown")}
          requestId={isAppError(e) ? e.requestId : null}
          onAction={() => void query.refetch()}
        />
      </Screen>
    );
  }

  const c = query.data;
  return (
    <Screen>
      <CoverBlock tone={c.coverTone} height={140} />
      <Text variant="title" accessibilityRole="header">
        {c.title}
      </Text>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: spacing.sm,
        }}
      >
        <Text tone="muted">{LEVEL_LABEL[c.level]}</Text>
        <Text variant="heading" testID="course-price">
          {formatPrice(c.priceCents)}
        </Text>
      </View>
      <Banner
        kind="info"
        message="Enrollment is coming soon. You will be able to buy this course here."
        testID="enroll-notice"
      />
      {c.description ? <Text>{c.description}</Text> : null}
      <Button label="Back to courses" variant="secondary" onPress={goHome} />
    </Screen>
  );
}
