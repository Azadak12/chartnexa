import { Controller, type Control, type FieldValues } from "react-hook-form";
import type { TextInputProps } from "react-native";
import { PasswordField } from "../ui/PasswordField";
import { TextField } from "../ui/TextField";

interface Props extends Omit<TextInputProps, "value" | "onChangeText" | "style"> {
  // Any form: the schema, not the type system, decides which field names exist.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any, unknown, any>;
  name: string;
  label: string;
  password?: "current-password" | "new-password";
  icon?: React.ComponentProps<typeof TextField>["icon"];
}

/** A labelled input wired to a form: errors appear beside it and failed submits focus it. */
export function FormField({ control, name, label, password, ...input }: Props) {
  return (
    <Controller
      control={control as unknown as Control<FieldValues>}
      name={name}
      render={({ field, fieldState }) => {
        const common = {
          label,
          value: (field.value as string | undefined) ?? "",
          onChangeText: field.onChange,
          onBlur: field.onBlur,
          inputRef: field.ref,
          error: fieldState.error?.message,
          ...input,
        };
        return password ? (
          <PasswordField purpose={password} {...common} />
        ) : (
          <TextField {...common} />
        );
      }}
    />
  );
}
