import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { IconButton } from "./IconButton";
import { TextField, type TextFieldProps } from "./TextField";

export interface PasswordFieldProps extends Omit<TextFieldProps, "secureTextEntry" | "accessory"> {
  /** `current-password` for sign in and confirmations, `new-password` when choosing one. */
  purpose: "current-password" | "new-password";
}

/**
 * Masked by default with a labelled show or hide control. It is masked again whenever the
 * screen loses focus, and it declares the autofill type so password managers work.
 */
export function PasswordField({ purpose, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  useFocusEffect(
    useCallback(() => {
      return () => setVisible(false);
    }, []),
  );
  return (
    <TextField
      {...props}
      secureTextEntry={!visible}
      autoComplete={purpose === "new-password" ? "new-password" : "current-password"}
      textContentType={purpose === "new-password" ? "newPassword" : "password"}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      accessory={
        <IconButton
          icon={visible ? "eye-off" : "eye"}
          accessibilityLabel={visible ? "Hide password" : "Show password"}
          onPress={() => setVisible((v) => !v)}
        />
      }
    />
  );
}
