import { continueLearningSchema, type ContinueLearning } from "@chartnexa/api-contracts";
import { AppError, messageFor } from "../api/errors";
import { authedFetch } from "../auth/authed-fetch";

export const continueApi = {
  /** The unfinished course the person studied most recently, with its next lesson, or null. */
  async get(): Promise<ContinueLearning["item"]> {
    const parsed = continueLearningSchema.safeParse(await authedFetch("/me/continue-learning"));
    if (!parsed.success) throw new AppError("unknown", messageFor("unknown"), null, null);
    return parsed.data.item;
  },
};
