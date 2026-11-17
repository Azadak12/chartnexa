import { applyDecorators } from "@nestjs/common";
import { ApiBody, ApiResponse } from "@nestjs/swagger";
import { z, type ZodType } from "zod";

/** Documents a request body from the same Zod schema that validates it. */
export function ApiZodBody(schema: ZodType) {
  const json = z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;
  delete json["$schema"];
  return ApiBody({ schema: json });
}

const envelope = { $ref: "#/components/schemas/ErrorEnvelope" };

export function ApiErrors(...statuses: number[]) {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({ status, description: `Error (${status})`, schema: envelope }),
    ),
  );
}
