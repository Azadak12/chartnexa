import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type FieldValues } from "react-hook-form";
import type { z } from "zod";

/**
 * React Hook Form wired to a shared Zod schema: validate on submit, then live; focus the first
 * error. Field names are plain strings checked by the schema, so a typo fails a test, not a build.
 */
export function useZodForm<S extends z.ZodType>(schema: S, defaultValues: z.input<S>) {
  return useForm<FieldValues, unknown, z.output<S>>({
    resolver: zodResolver(schema as never) as never,
    defaultValues: defaultValues as FieldValues,
    mode: "onSubmit",
    reValidateMode: "onChange",
    shouldFocusError: true,
  });
}
