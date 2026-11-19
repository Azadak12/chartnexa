import type { AccessResponse } from "@chartnexa/api-contracts";
import { roleOf } from "../staff/role-tabs";
import { HOME_ROUTE } from "./return-to";

/** Where a signed-in person starts: Student Home, or the Dashboard for Instructor, Manager and Admin. */
export function landingFor(access: AccessResponse | undefined): string {
  return roleOf(access) === "student" ? HOME_ROUTE : "/dashboard";
}
