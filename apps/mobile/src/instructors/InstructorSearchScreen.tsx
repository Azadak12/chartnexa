import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";
import { lookupQuerySchema, type UserLookupResponse } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { StateView } from "../state/StateView";
import { spacing } from "../theme";
import { Banner, Button, Card, Screen, Text, TextField, useSubmitOnce } from "../ui";
import { canManageInstructors, fetchAccess, isAdmin } from "../courses/course-api";
import { instructorApi } from "./instructor-api";
import { ReasonSheet } from "./ReasonSheet";

const ROLE_LABEL = { instructor: "Instructor", manager: "Manager", admin: "Admin" } as const;
const STATUS_LABEL = { active: "Active", disabled: "Disabled", deleted: "Deleted" } as const;

/** Find a person by exact email, then manage their Instructor permissions. */
export function InstructorSearchScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);
  const [person, setPerson] = useState<UserLookupResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [appointing, setAppointing] = useState(false);
  const appointRef = useRef(null);

  const { run, pending } = useSubmitOnce(async () => {
    setNotice(null);
    setFailure(null);
    setPerson(null);
    const parsed = lookupQuerySchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError("Enter a full email address, like name@example.com");
      return;
    }
    setFieldError(undefined);
    try {
      setPerson(await instructorApi.lookup(parsed.data.email));
    } catch (e) {
      if (isAppError(e) && e.kind === "not_found") {
        setFieldError("No account matches that email.");
      } else if (isAppError(e) && e.kind === "validation") {
        setFieldError("Enter a full email address, like name@example.com");
      } else {
        setFailure(isAppError(e) ? e.message : messageFor("unknown"));
      }
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
  if (!canManageInstructors(access.data)) {
    return (
      <Screen>
        <StateView
          state="empty"
          title="You do not have access"
          message="Only Admins and Managers can manage Instructor permissions."
          actionLabel="Back"
          onAction={() => (router.canGoBack() ? router.back() : router.replace("/profile"))}
        />
      </Screen>
    );
  }

  const name = person?.displayName ?? "This person";
  return (
    <Screen keyboard>
      <Text variant="title" accessibilityRole="header">
        Instructor permissions
      </Text>
      <Text tone="muted">Find a person by their exact email address.</Text>
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={fieldError}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="search"
        onSubmitEditing={() => void run()}
      />
      <Button label="Find" loading={pending} onPress={() => void run()} />
      {failure ? (
        <>
          <Banner kind="error" message={failure} testID="lookup-error" />
          <Button label="Retry" variant="secondary" onPress={() => void run()} />
        </>
      ) : null}
      {notice ? <Banner kind="success" message={notice} testID="search-notice" /> : null}
      {person ? (
        <Card>
          <Text variant="subheading">{person.displayName ?? "No name set"}</Text>
          <Text tone="muted" testID="person-role">
            {person.staffRole ? ROLE_LABEL[person.staffRole] : "Student"} ·{" "}
            {STATUS_LABEL[person.status]}
          </Text>
          {person.staffRole === "instructor" && person.status === "active" ? (
            <Button
              label="Open permissions"
              onPress={() => router.push(`/profile/instructors/${person.id}`)}
            />
          ) : (
            <View style={{ gap: spacing.sm }}>
              <Text testID="not-instructor">{name} is not an Instructor.</Text>
              {isAdmin(access.data) && person.staffRole === null && person.status === "active" ? (
                <View ref={appointRef} collapsable={false}>
                  <Button label="Make Instructor" onPress={() => setAppointing(true)} />
                </View>
              ) : null}
            </View>
          )}
        </Card>
      ) : null}
      <Button label="Back" variant="tertiary" onPress={() => router.back()} />
      <ReasonSheet
        visible={appointing}
        title="Make Instructor"
        message={`${name} will become an Instructor. They start with no permissions; you choose what they can do next.`}
        confirmLabel="Make Instructor"
        openerRef={appointRef}
        onCancel={() => setAppointing(false)}
        onConfirm={async (reason) => {
          if (!person) return;
          await instructorApi.makeInstructor(person.id, reason);
          setPerson({ ...person, staffRole: "instructor" });
          setAppointing(false);
          setNotice(`${name} is now an Instructor with no permissions yet.`);
          await qc.invalidateQueries({ queryKey: ["instructor-permissions", person.id] });
        }}
      />
      <View style={{ height: spacing.xl }} />
    </Screen>
  );
}
