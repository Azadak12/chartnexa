import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { AccessibilityInfo } from "react-native";
import { z } from "zod";
import { ENTITLEMENT_REASON_MAX, ENTITLEMENT_REASON_MIN } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../../api/errors";
import { canManageEnrollments, fetchAccess } from "../../courses/course-api";
import { FormField } from "../../forms/FormField";
import { useZodForm } from "../../forms/use-zod-form";
import { instructorApi } from "../../instructors/instructor-api";
import { StateView } from "../../state/StateView";
import { Banner, Button, Screen, Text, useSubmitOnce } from "../../ui";
import { staffEntitlementApi } from "../entitlement-api";

const formSchema = z.object({
  email: z.string().trim().min(3, "Enter the person's email").max(254, "That email is too long"),
  reason: z
    .string()
    .trim()
    .min(
      ENTITLEMENT_REASON_MIN,
      `Write ${ENTITLEMENT_REASON_MIN} to ${ENTITLEMENT_REASON_MAX} characters`,
    )
    .max(
      ENTITLEMENT_REASON_MAX,
      `Write ${ENTITLEMENT_REASON_MIN} to ${ENTITLEMENT_REASON_MAX} characters`,
    ),
});

/** Full-screen form: find a person by email, say why, and give them access to the course. */
export function GrantAccessScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const courseId = String(id);
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const { control, handleSubmit, setError } = useZodForm(formSchema, { email: "", reason: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const back = () =>
    router.canGoBack() ? router.back() : router.replace(`/manage/${courseId}/students`);

  const { run, pending } = useSubmitOnce(async (v: z.output<typeof formSchema>) => {
    setMessage(null);
    setInfo(null);
    let person;
    try {
      person = await instructorApi.lookup(v.email);
    } catch (e) {
      if (isAppError(e) && e.kind === "not_found") {
        setError(
          "email",
          { type: "server", message: "No account uses that email." },
          { shouldFocus: true },
        );
        return;
      }
      setMessage(isAppError(e) ? e.message : messageFor("unknown"));
      return;
    }
    try {
      const result = await staffEntitlementApi.grant(courseId, person.id, v.reason);
      await qc.invalidateQueries({ queryKey: ["course-students", courseId] });
      if (!result.created) {
        setInfo("This person already has access. Nothing was changed.");
        return;
      }
      AccessibilityInfo.announceForAccessibility("Access granted");
      back();
    } catch (e) {
      if (isAppError(e) && e.kind === "conflict") {
        setError(
          "email",
          {
            type: "server",
            message:
              "This person cannot be given access yet: they need an active account with a verified email.",
          },
          { shouldFocus: true },
        );
        return;
      }
      if (isAppError(e) && e.kind === "forbidden") {
        void qc.invalidateQueries({ queryKey: ["access"] });
        setMessage("You no longer have permission to do this. What you typed is still here.");
        return;
      }
      if (isAppError(e) && e.kind === "not_found") {
        setMessage("This course or person could not be found. What you typed is still here.");
        return;
      }
      setMessage(isAppError(e) ? e.message : messageFor("unknown"));
    }
  });

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
  if (!canManageEnrollments(access.data)) {
    return (
      <Screen>
        <StateView
          state="empty"
          title="You do not have access"
          message="You need permission to manage who can open this course."
          actionLabel="Back"
          onAction={back}
        />
      </Screen>
    );
  }

  return (
    <Screen keyboard>
      <Text variant="title" accessibilityRole="header">
        Grant access
      </Text>
      <Text tone="muted">
        The person gets lifetime access to every lesson of this course. Their email must belong to
        an active, verified account.
      </Text>
      {message ? <Banner kind="error" message={message} testID="form-error" /> : null}
      {info ? <Banner kind="info" message={info} testID="form-info" /> : null}
      <FormField
        control={control}
        name="email"
        label="Person's email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <FormField
        control={control}
        name="reason"
        label="Reason"
        multiline
        numberOfLines={3}
        textAlignVertical="top"
      />
      <Button
        label="Grant access"
        loading={pending}
        onPress={() => void handleSubmit((v) => run(v))()}
      />
      <Button label="Back" variant="tertiary" onPress={back} />
    </Screen>
  );
}
