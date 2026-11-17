import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from "@nestjs/swagger";
import { z } from "zod";
import { errorEnvelopeSchema } from "@chartnexa/api-contracts";

export function buildOpenApiDocument(app: NestFastifyApplication): OpenAPIObject {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle("ChartNexa API").setVersion("0.0.0").build(),
  );
  const envelope = z.toJSONSchema(errorEnvelopeSchema) as Record<string, unknown>;
  delete envelope["$schema"];
  document.components = {
    ...document.components,
    schemas: { ...document.components?.schemas, ErrorEnvelope: envelope },
  };
  return document;
}

/** Served only outside production. */
export function setupOpenApi(app: NestFastifyApplication, nodeEnv: string): void {
  if (nodeEnv === "production") return;
  SwaggerModule.setup("docs", app, buildOpenApiDocument(app), {
    ui: false,
    jsonDocumentUrl: "openapi.json",
  });
}
