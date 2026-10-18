import { z } from "zod";

export const journalEntrySchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(["メモ", "再開地点", "服薬", "体重"]),
  text: z
    .string()
    .min(1)
    .max(100_000)
    .refine((value) => value.trim().length > 0),
  source: z.string().max(2000),
  occurredAt: z.string().max(100),
  recordedAt: z.iso.datetime({ offset: true }),
  correctionOf: z.uuid().optional(),
});
export const appendJournalInput = journalEntrySchema.extend({
  recordedAt: z.iso.datetime({ offset: true }).optional(),
});
export type JournalEntry = z.infer<typeof journalEntrySchema>;
