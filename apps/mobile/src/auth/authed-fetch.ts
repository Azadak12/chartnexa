import { apiFetch, type ApiOptions } from "../api/client";
import { AppError, isAppError, messageFor } from "../api/errors";
import { sessionManager } from "./session-manager";

type Options = Omit<ApiOptions, "getToken">;

/**
 * Calls the API as the signed-in person. The token is renewed first when close to expiry, and a
 * 401 is retried exactly once after a renewal. A second 401 ends the session instead of looping,
 * and an unreachable server never signs anyone out.
 */
export async function authedFetch<T>(path: string, options: Options = {}): Promise<T> {
  const token = await sessionManager.getAccessToken();
  try {
    return await apiFetch<T>(path, { ...options, getToken: () => token });
  } catch (e) {
    if (!isAppError(e) || e.kind !== "unauthorized") throw e;
  }

  const renewed = await sessionManager.renew();
  if (renewed === "ended") {
    throw new AppError("unauthorized", messageFor("unauthorized"), 401, null);
  }
  if (renewed === "unreachable") {
    throw new AppError("network", messageFor("network"), null, null);
  }
  try {
    return await apiFetch<T>(path, {
      ...options,
      getToken: () => sessionManager.currentAccessToken(),
    });
  } catch (e) {
    if (isAppError(e) && e.kind === "unauthorized") await sessionManager.endSession();
    throw e;
  }
}
