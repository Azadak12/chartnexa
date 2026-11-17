import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";
import type { FieldError } from "@chartnexa/api-contracts";

export class ValidationFailed extends BadRequestException {
  constructor(public readonly fields: FieldError[]) {
    super("Validation failed");
  }
}

/** Validates input against a Zod schema. Use z.strictObject so unknown keys are rejected. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationFailed(
        result.error.issues.map((i) => ({
          field: i.path.join(".") || "(body)",
          message: i.message,
        })),
      );
    }
    return result.data;
  }
}
