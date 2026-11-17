import type { QueryClient } from "@tanstack/react-query";

/** Lets code outside React (verification, sign-out) refresh or clear cached account data. */
export const queryClientRef: { current: QueryClient | null } = { current: null };
