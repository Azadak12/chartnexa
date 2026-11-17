import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";
import { PrismaService } from "../database/prisma.service.js";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  @Get("live")
  @ApiOperation({ summary: "Liveness: the process is running" })
  @ApiOkResponse({ description: "Process is up", schema: { example: { status: "ok" } } })
  live(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("ready")
  @ApiOperation({ summary: "Readiness: the database is reachable" })
  @ApiOkResponse({ description: "Ready to serve", schema: { example: { status: "ok" } } })
  @ApiServiceUnavailableResponse({
    description: "Dependency unavailable",
    schema: { $ref: "#/components/schemas/ErrorEnvelope" },
  })
  async ready(): Promise<{ status: "ok" }> {
    if (!(await this.db.isReachable())) {
      throw new ServiceUnavailableException("Service is not ready.");
    }
    return { status: "ok" };
  }
}
