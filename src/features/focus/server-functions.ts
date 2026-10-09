import { createServerFn } from "@tanstack/react-start";
import type { ActivityFailure } from "../activities/model";
import {
  changeFocusInput,
  deleteWorkLogInput,
  loadFocusInput,
  saveWorkLogInput,
  startFocusInput,
} from "./model";
async function run<T>(
  operation: (repository: typeof import("./repository.server")) => T,
): Promise<T | ActivityFailure> {
  const repository = await import("./repository.server");
  const { ActivityPersistenceError } = await import("../activities/repository.server");
  try {
    return operation(repository);
  } catch (error) {
    if (error instanceof ActivityPersistenceError)
      return { ok: false, error: { code: error.code, message: error.message } };
    return {
      ok: false,
      error: { code: "internal-error", message: "Unable to update focus. Please try again." },
    };
  }
}
export const loadFocus = createServerFn({ method: "GET" })
  .validator(loadFocusInput)
  .handler(({ data }) => run((r) => r.getFocusContext(data)));
export const startFocus = createServerFn({ method: "POST" })
  .validator(startFocusInput)
  .handler(({ data }) => run((r) => r.startFocus(data)));
export const changeFocus = createServerFn({ method: "POST" })
  .validator(changeFocusInput)
  .handler(({ data }) => run((r) => r.changeFocus(data)));
export const saveWorkLog = createServerFn({ method: "POST" })
  .validator(saveWorkLogInput)
  .handler(({ data }) => run((r) => r.saveWorkLog(data)));
export const deleteWorkLog = createServerFn({ method: "POST" })
  .validator(deleteWorkLogInput)
  .handler(({ data }) => run((r) => r.deleteWorkLog(data)));
