import { useEffect, useState, type RefObject } from "react";
import { Pressable, View } from "react-native";
import type { StaffCourseModule } from "@chartnexa/api-contracts";
import { formMessage } from "../../auth/errors-ui";
import { colors, MIN_TOUCH_SIZE, neutrals, radii, spacing } from "../../theme";
import { BottomSheet, Banner, Button, Text, useSubmitOnce } from "../../ui";

/** Choose which module a lesson belongs to, or none. The lesson goes to the end of that module. */
export function ModulePickerSheet({
  visible,
  lessonTitle,
  current,
  modules,
  onSave,
  onClose,
  openerRef,
}: {
  visible: boolean;
  lessonTitle: string;
  current: string | null;
  modules: StaffCourseModule[];
  onSave: (moduleId: string | null) => Promise<void>;
  onClose: () => void;
  openerRef?: RefObject<unknown>;
}) {
  const [choice, setChoice] = useState<string | null>(current);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setChoice(current);
      setError(null);
    }
  }, [visible, current]);
  const { run, pending } = useSubmitOnce(async () => {
    setError(null);
    try {
      await onSave(choice);
    } catch (e) {
      setError(formMessage(e));
    }
  });
  const options = [
    { id: null as string | null, label: "No module" },
    ...modules.map((m) => ({
      id: m.id as string | null,
      label: `Module ${m.position}: ${m.title}`,
    })),
  ];
  return (
    <BottomSheet
      visible={visible}
      title={`Module for ${lessonTitle}`}
      onDismiss={onClose}
      {...(openerRef ? { openerRef } : {})}
    >
      {error ? <Banner kind="error" message={error} testID="module-picker-error" /> : null}
      <View accessibilityRole="radiogroup" style={{ gap: spacing.xs }}>
        {options.map((o) => {
          const on = choice === o.id;
          return (
            <Pressable
              key={o.id ?? "none"}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ checked: on, selected: on }}
              onPress={() => setChoice(o.id)}
              style={{
                minHeight: MIN_TOUCH_SIZE,
                justifyContent: "center",
                paddingHorizontal: spacing.md,
                borderRadius: radii.card,
                borderWidth: on ? 2 : 1,
                borderColor: on ? colors.blue : neutrals.divider,
              }}
            >
              <Text variant={on ? "bodyStrong" : "body"}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Button label="Move lesson" loading={pending} onPress={() => void run()} />
      <Button label="Cancel" variant="secondary" onPress={onClose} />
    </BottomSheet>
  );
}
