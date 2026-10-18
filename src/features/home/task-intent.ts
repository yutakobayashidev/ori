export const MAX_TASK_INPUT_LENGTH = 500;
export const MAX_TASKS = 8;
export type TaskDraft = { title: string; dueDate: string | null };
export type RoutineCandidate = { id: string; name: string; aliases: string[]; description: string };
export type TaskIntentResult = {
  status: "task" | "journal" | "routine_create" | "routine_run" | "none" | "uncertain";
  routineId?: string;
  tasks: TaskDraft[];
  notice: string | null;
};
export type TaskIntentInput = { text: string; today: string };
export type DateCandidate = { source: string; date: string | null };
export type TaskCandidate = { source: string; title: string };

export function isDateOnly(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
const datePattern =
  /(?:\d{4}年)?\d{1,2}月\d{1,2}日|\d{4}-\d{2}-\d{2}|(?:\d{4}\/)?\d{1,2}\/\d{1,2}|再来週[の\s]*[月火水木金土日]曜(?:日)?|(?:今週|来週)?[の\s]*[月火水木金土日]曜(?:日)?|今日|明後日|あさって|明日|あした|本日|今月末|来月末|\d{1,3}日後/g;
function offset(today: string, days: number): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function findDateCandidates(text: string, today: string): DateCandidate[] {
  if (!isDateOnly(today)) throw new Error("基準日が正しくありません。");
  const current = new Date(`${today}T00:00:00Z`);
  return [...text.matchAll(datePattern)].map(([source]) => {
    const term = source.trim();
    let date: string | null = null;
    if (/^(今日|本日)$/.test(term)) date = today;
    else if (/^(明日|あした)$/.test(term)) date = offset(today, 1);
    else if (/^(明後日|あさって)$/.test(term)) date = offset(today, 2);
    else if (term.endsWith("日後")) date = offset(today, Number.parseInt(term));
    else if (term.endsWith("月末"))
      date = new Date(
        Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + (term === "今月末" ? 1 : 2), 0),
      )
        .toISOString()
        .slice(0, 10);
    else if (/曜/.test(term)) {
      const weekday = "日月火水木金土".indexOf(term.match(/([月火水木金土日])曜/)?.[1] ?? "");
      const monday = (current.getUTCDay() + 6) % 7;
      const target = (weekday + 6) % 7;
      const days = term.startsWith("再来週")
        ? 14 - monday + target
        : term.startsWith("来週")
          ? 7 - monday + target
          : term.startsWith("今週")
            ? target - monday
            : (weekday - current.getUTCDay() + 7) % 7;
      date = offset(today, days);
    } else {
      const numbers = (term.match(/\d+/g) ?? []).map(Number);
      const explicitYear = numbers.length === 3;
      const [year = NaN, month = NaN, day = NaN] = explicitYear
        ? numbers
        : [current.getUTCFullYear(), ...numbers];
      const format = (y: number) =>
        `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const candidate = format(year);
      if (isDateOnly(candidate))
        date = !explicitYear && candidate < today ? format(year + 1) : candidate;
      if (date && !isDateOnly(date)) date = null;
    }
    return { source, date };
  });
}

export function findTaskCandidates(text: string): TaskCandidate[] {
  // Keep dates in candidates: a mentioned date is not necessarily a deadline.
  const body = text.trim().replace(/^(?:やること|タスク(?:を追加)?|追加)[：:\s]+/, "");
  const parts = body
    .split(/[、,。\n；;]+|それから|そして/)
    .map((s) => s.trim())
    .filter(Boolean);
  const sharedVerb = parts.at(-1)?.match(/(を(?:買う|購入する))$/)?.[1];
  return parts.flatMap((source) => {
    let title = source;
    title = title
      .replace(/^[-・\s]+/, "")
      .replace(/を(?:タスクに)?追加(?:して)?[！!]?$/, "")
      .replace(/(?:を)?追加(?:して)?[！!]?$/, "")
      .trim();
    // Split noun lists with an explicit shared action; do not split names such as 京都.
    const shared = title.match(/^(.+と.+)(を(?:買う|購入する|予約する))$/);
    if (shared?.[1])
      return shared[1].split("と").map((item) => ({ source, title: item + shared[2] }));
    const nominal = title.match(/^([^を]+)と([^を]+)$/);
    if (nominal && !/さん|一緒|話|会/.test(title))
      return nominal.slice(1).map((item) => ({ source, title: item }));
    if (sharedVerb && !/[はをにで]|する$|ない/.test(title)) title += sharedVerb;
    return title ? [{ source, title }] : [];
  });
}

export function titleWithoutDeadline(
  title: string,
  deadline: DateCandidate,
  dates: DateCandidate[],
): string {
  if (!deadline.date) return title;
  const escape = (source: string) => source.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Remove a superseded leading date only when the user explicitly corrected it.
  for (const date of dates) {
    title = title.replace(
      new RegExp(`^${escape(date.source)}(?:じゃなくて|ではなくて|じゃなく|ではなく)\\s*`),
      "",
    );
  }
  return title
    .replace(new RegExp(`${escape(deadline.source)}(?:までに|まで|中に|に|は(?=[^ぁ-ゖ]))?`), "")
    .trim();
}
