import { BadRequestException } from "@nestjs/common";
import { INVITATION_ERROR_CODES } from "@chartnexa/api-contracts";

/** One answer for every reason an invitation cannot be used (unknown, expired, used, revoked, wrong password). */
export class InvalidInvitation extends BadRequestException {
  constructor() {
    super({
      message: "This invitation is invalid or has expired. Ask for a new one.",
      code: INVITATION_ERROR_CODES.invalid,
    });
  }
}
