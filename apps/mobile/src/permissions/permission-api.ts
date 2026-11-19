import type {
  ManagedRole,
  PermissionChange,
  PermissionUserDetail,
  PermissionUsersPage,
  RoleDefaultsResponse,
} from "@chartnexa/api-contracts";
import { AppError, messageFor } from "../api/errors";
import { authedFetch } from "../auth/authed-fetch";

const enc = encodeURIComponent;

function shaped<T>(body: unknown, keys: string[]): T {
  if (typeof body !== "object" || body === null || keys.some((k) => !(k in body))) {
    throw new AppError("unknown", messageFor("unknown"), null, null);
  }
  return body as T;
}

/** Admin-only permission management. The server refuses everyone else with 403. */
export const permissionApi = {
  async users(role: ManagedRole, q: string, cursor: string | null): Promise<PermissionUsersPage> {
    const params = [`role=${enc(role)}`, "limit=25"];
    if (q.trim()) params.push(`q=${enc(q.trim())}`);
    if (cursor) params.push(`cursor=${enc(cursor)}`);
    return shaped(await authedFetch(`/staff/permissions/users?${params.join("&")}`), [
      "items",
      "nextCursor",
    ]);
  },
  async detail(userId: string): Promise<PermissionUserDetail> {
    return shaped(await authedFetch(`/staff/permissions/users/${enc(userId)}`), [
      "user",
      "version",
      "permissions",
      "courseGrants",
    ]);
  },
  async save(
    userId: string,
    body: { reason: string; expectedVersion: number; changes: PermissionChange[] },
  ): Promise<PermissionUserDetail> {
    return shaped(
      await authedFetch(`/staff/permissions/users/${enc(userId)}`, { method: "PUT", body }),
      ["user", "version", "permissions", "courseGrants"],
    );
  },
  async roles(): Promise<RoleDefaultsResponse> {
    return shaped(await authedFetch("/staff/permissions/roles"), ["roles"]);
  },
  async saveRole(
    role: ManagedRole,
    body: { reason: string; changes: Array<{ permission: string; enabled: boolean }> },
  ): Promise<RoleDefaultsResponse> {
    return shaped(
      await authedFetch(`/staff/permissions/roles/${enc(role)}`, { method: "PUT", body }),
      ["roles"],
    );
  },
};
