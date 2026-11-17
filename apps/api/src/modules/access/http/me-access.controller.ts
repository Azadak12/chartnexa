import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AccessResponse } from "@chartnexa/api-contracts";
import { ApiErrors } from "../../../platform/openapi-helpers.js";
import { Authenticated, CurrentUser, type AuthContext } from "../../identity/index.js";
import { AuthorizationService } from "../authorization/authorization.service.js";

@ApiTags("me")
@Authenticated()
@Controller("me")
export class MeAccessController {
  constructor(@Inject(AuthorizationService) private readonly authz: AuthorizationService) {}

  @Get("access")
  @ApiOperation({
    summary: "Your roles and permissions (informational; the server enforces on every request)",
  })
  @ApiErrors(401)
  async access(@CurrentUser() user: AuthContext): Promise<AccessResponse> {
    const a = await this.authz.access(user.userId);
    return { roles: a.roles, permissions: [...a.permissions].sort() };
  }
}
