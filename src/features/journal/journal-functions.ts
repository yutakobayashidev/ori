import { createServerFn } from "@tanstack/react-start";
import { appendJournalInput } from "./journal-model";

// Global owner-session and CSRF middleware protect these server functions.
export const loadJournalEntries = createServerFn({ method: "GET" }).handler(async () => {
  const { listJournalEntries } = await import("./journal-repository.server");
  return listJournalEntries();
});
export const saveJournalEntry = createServerFn({ method: "POST" })
  .validator(appendJournalInput)
  .handler(async ({ data }) => {
    const { appendJournalEntry } = await import("./journal-repository.server");
    return appendJournalEntry(data);
  });
