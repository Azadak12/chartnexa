import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { z } from "zod";
import { acceptInvitationRequestSchema } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { formMessage } from "../auth/errors-ui";
import { applyServerErrors } from "../forms/form-helpers";
import { FormField } from "../forms/FormField";
import { useZodForm } from "../forms/use-zod-form";
import { sessionStore } from "../session/session-store";
import { Banner, Button, Screen, Text, useSubmitOnce } from "../ui";
import { invitationApi } from "./invitation-api";

const formSchema = z
  .object({
    token: acceptInvitationRequestSchema.shape.token,
    displayName: acceptInvitationRequestSchema.shape.displayName,
    password: z.string().min(1, "Enter a password"),
    confirm: z.string().min(1, "Enter the password again"),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "The passwords do not match",
  });

/**
 * Opened from the emailed link (`token`) or by pasting the code. Someone new chooses a password;
 * someone who already has an account types their current password to prove it is theirs.
 */
export function AcceptInvitationScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { control, handleSubmit, setError } = useZodForm(formSchema, {
    token: token ?? "",
    displayName: "",
    password: "",
    confirm: "",
  });
  const [message, setMessage] = useState<string | null>(null);

  const { run, pending } = useSubmitOnce(async (v: z.output<typeof formSchema>) => {
    setMessage(null);
    try {
      await invitationApi.accept({
        token: v.token.trim(),
        displayName: v.displayName,
        password: v.password,
      });
      sessionStore.setNotice("Invitation accepted. Sign in with your email and password.");
      router.replace("/sign-in");
    } catch (e) {
      if (applyServerErrors(e, setError, ["token", "displayName", "password"])) return;
      if (isAppError(e) && e.kind === "conflict") {
        setMessage("This account already has a staff role, so it cannot take this invitation.");
        return;
      }
      setMessage(isAppError(e) ? formMessage(e) : messageFor("unknown"));
    }
  });

  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Accept your invitation
      </Text>
      <Text tone="muted">
        You were invited to teach on ChartNexa Academy. If you already have an account, enter its
        current password. Otherwise choose one.
      </Text>
      {message ? <Banner kind="error" message={message} testID="accept-error" /> : null}
      <FormField
        control={control}
        name="token"
        label="Invitation code"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <FormField control={control} name="displayName" label="Your name" autoComplete="name" />
      <FormField control={control} name="password" label="Password" password="new-password" />
      <FormField
        control={control}
        name="confirm"
        label="Confirm password"
        password="new-password"
      />
      <Button
        label="Accept invitation"
        loading={pending}
        onPress={() => void handleSubmit((v) => run(v as z.output<typeof formSchema>))()}
      />
      <Button label="Back" variant="tertiary" onPress={() => router.replace("/sign-in")} />
    </Screen>
  );
}
