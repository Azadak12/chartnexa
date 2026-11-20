import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { CATEGORY_NAME_MAX, CATEGORY_NAME_MIN, type StaffCategory } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { ConfirmDialog } from "../auth/ConfirmDialog";
import { canManageCategories, fetchAccess } from "../courses/course-api";
import { shouldRetry } from "../state/query-client";
import { StateView } from "../state/StateView";
import { raised, spacing } from "../theme";
import { Banner, Button, NameSheet, Screen, Text } from "../ui";
import { staffCategoryApi } from "./category-api";
import { StaffPageHeader } from "../kit/StaffPageHeader";

const courses = (n: number) => `${n} ${n === 1 ? "course" : "courses"}`;

/** Admins and Managers add, rename and delete categories. Every call is checked by the server. */
export function StaffCategoriesScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const allowed = canManageCategories(access.data);
  const list = useQuery({
    queryKey: ["staff-categories"],
    enabled: allowed,
    queryFn: staffCategoryApi.list,
    retry: shouldRetry,
  });
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<StaffCategory | null>(null);
  const [deleting, setDeleting] = useState<StaffCategory | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const addRef = useRef(null);
  const rowRef = useRef<unknown>(null);
  const refs = useRef<Record<string, unknown>>({});

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["staff-categories"] }),
      qc.invalidateQueries({ queryKey: ["categories"] }),
    ]);
  };

  if (access.status === "pending") {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  if (!allowed) {
    return (
      <Screen>
        <StateView
          state="empty"
          title="You do not have access"
          message="Only Admins and Managers can manage categories."
          actionLabel="Back"
          onAction={() => (router.canGoBack() ? router.back() : router.replace("/home"))}
        />
      </Screen>
    );
  }

  const items = list.data ?? [];
  return (
    <Screen>
      <StaffPageHeader title="Categories" eyebrow="COURSE STUDIO" icon="book-open" />
      {message ? <Banner kind="error" message={message} testID="categories-error" /> : null}
      <View ref={addRef} collapsable={false}>
        <Button label="Add category" onPress={() => setAdding(true)} />
      </View>
      {list.status === "pending" ? (
        <StateView state="loading" />
      ) : list.status === "error" ? (
        <StateView
          state={isAppError(list.error) && list.error.kind === "network" ? "offline" : "error"}
          message={isAppError(list.error) ? list.error.message : messageFor("unknown")}
          onAction={() => void list.refetch()}
        />
      ) : items.length === 0 ? (
        <StateView
          state="empty"
          title="No categories yet"
          message="Add categories so students can filter courses by topic."
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {items.map((c) => (
            <View
              key={c.id}
              testID={`category-${c.id}`}
              style={{
                gap: spacing.xs,
                padding: spacing.md,
                ...raised,
              }}
            >
              <Text variant="subheading">{c.name}</Text>
              <Text variant="caption" tone="muted">
                {courses(c.totalCourseCount)}, {c.courseCount} published
              </Text>
              <View
                ref={(node) => {
                  refs.current[c.id] = node;
                }}
                collapsable={false}
                style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}
              >
                <Button
                  label={`Rename ${c.name}`}
                  variant="secondary"
                  onPress={() => {
                    rowRef.current = refs.current[c.id];
                    setRenaming(c);
                  }}
                />
                <Button
                  label={`Delete ${c.name}`}
                  variant="tertiary"
                  onPress={() => {
                    rowRef.current = refs.current[c.id];
                    setDeleting(c);
                  }}
                />
              </View>
            </View>
          ))}
        </View>
      )}
      <NameSheet
        visible={adding}
        label="Category name"
        min={CATEGORY_NAME_MIN}
        max={CATEGORY_NAME_MAX}
        title="Add category"
        initialName=""
        confirmLabel="Add category"
        openerRef={addRef}
        onClose={() => setAdding(false)}
        onSave={async (name) => {
          await staffCategoryApi.create(name);
          await refresh();
          setAdding(false);
          AccessibilityInfo.announceForAccessibility(`Category ${name} added`);
        }}
      />
      <NameSheet
        visible={renaming !== null}
        label="Category name"
        min={CATEGORY_NAME_MIN}
        max={CATEGORY_NAME_MAX}
        title="Rename category"
        initialName={renaming?.name ?? ""}
        confirmLabel="Save name"
        openerRef={rowRef}
        onClose={() => setRenaming(null)}
        onSave={async (name) => {
          if (!renaming) return;
          try {
            await staffCategoryApi.rename(renaming.id, renaming.version, name);
          } catch (e) {
            if (isAppError(e) && e.kind === "conflict") {
              await refresh();
              setRenaming(null);
              setMessage(
                "Someone else changed this category. The list is up to date now; try again.",
              );
              return;
            }
            throw e;
          }
          await refresh();
          setRenaming(null);
          AccessibilityInfo.announceForAccessibility("Category renamed");
        }}
      />
      <ConfirmDialog
        visible={deleting !== null}
        title={`Delete ${deleting?.name ?? "category"}?`}
        message="Only a category with no courses can be deleted. Students will no longer see it."
        confirmLabel="Delete category"
        openerRef={rowRef}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await staffCategoryApi.remove(deleting.id);
          } catch (e) {
            if (isAppError(e) && e.kind === "conflict") {
              setDeleting(null);
              setMessage(e.message);
              return;
            }
            throw e;
          }
          setDeleting(null);
          setMessage(null);
          await refresh();
          AccessibilityInfo.announceForAccessibility("Category deleted");
        }}
      />
    </Screen>
  );
}
