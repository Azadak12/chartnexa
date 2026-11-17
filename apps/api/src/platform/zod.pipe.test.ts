import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ValidationFailed, ZodPipe } from "./zod.pipe.js";

const pipe = new ZodPipe(z.strictObject({ name: z.string().min(2), age: z.number().int() }));

describe("ZodPipe", () => {
  it("passes valid input", () => {
    expect(pipe.transform({ name: "Al", age: 3 })).toEqual({ name: "Al", age: 3 });
  });
  it("lists each failing field", () => {
    try {
      pipe.transform({ name: "A", age: "x" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationFailed);
      expect((e as ValidationFailed).fields.map((f) => f.field).sort()).toEqual(["age", "name"]);
    }
  });
  it("rejects unknown properties", () => {
    expect(() => pipe.transform({ name: "Al", age: 3, extra: 1 })).toThrow(ValidationFailed);
  });
});
