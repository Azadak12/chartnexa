import { useState } from "react";
import { Banner, Button, useSubmitOnce } from "../ui";
import { accountApi } from "./account-api";
import { formMessage } from "./errors-ui";

/** Shown while the email is unverified: explains and offers to resend (once while sending). */
export function VerifyNotice() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useSubmitOnce(async () => {
    setError(null);
    try {
      await accountApi.resendVerification();
      setSent(true);
    } catch (e) {
      setError(formMessage(e));
    }
  });
  return (
    <>
      <Banner
        kind="warning"
        message="Your email is not verified yet. Check your inbox for the link."
        testID="verify-notice"
      />
      {error ? <Banner kind="error" message={error} testID="verify-error" /> : null}
      <Button
        label={sent ? "Email sent" : "Resend verification email"}
        variant="secondary"
        loading={pending}
        disabled={sent}
        onPress={() => void run()}
      />
    </>
  );
}
