import { ArrowUp, Check, Clock, CornerDownLeft, ListTodo, Plus, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Button } from "#/components/ui/button";
import { Textarea } from "#/components/ui/textarea";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion, useSpring } from "motion/react";
import { IntentPalette, type TaskCardMode } from "./intent-palette";
import { MorphContainer } from "./morph-container";
import { spring, tween } from "./composer-motion";
import { classifyHomeTasks } from "./task-intent-functions";
import { MAX_TASK_INPUT_LENGTH, MAX_TASKS, type TaskDraft } from "./task-intent";

export function TaskComposer({
  text,
  onTextChange,
  inputRef,
  onPreviewAction,
  createTasks,
  disabled,
  isLegacyAction,
}: {
  text: string;
  onTextChange: (text: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onPreviewAction: () => void;
  createTasks: (tasks: TaskDraft[]) => Promise<boolean>;
  disabled: boolean;
  isLegacyAction: boolean;
}) {
  const layoutScope = useId();
  const [draftId, setDraftId] = useState(0);
  const [receipt, setReceipt] = useState<{ id: number; tasks: TaskDraft[] } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [forcedMode, setForcedMode] = useState<TaskCardMode | null>(null);
  const legacyAction = isLegacyAction && !forcedMode;
  const observedText = useRef(text);
  const [drafts, setDrafts] = useState<TaskDraft[]>([]);
  const [notice, setNotice] = useState("");
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [composing, setComposing] = useState(false);
  const [locked, setLocked] = useState(false);
  const invalidTitle = drafts.some((task) => !task.title.trim() || task.title.trim().length > 300);
  const tooManyTasks = drafts.length > MAX_TASKS;
  const reduce = useReducedMotion();
  const readiness = useSpring(0, spring.number);
  useEffect(() => {
    readiness.set(drafts.length ? 1 : 0);
  }, [drafts.length, readiness]);
  const revision = useRef(0);
  const saveInFlight = useRef(false);

  useEffect(() => {
    if (observedText.current !== text) {
      observedText.current = text;
      setLocked(false);
      setForcedMode(null);
      setDrafts([]);
      setNotice("");
    }
  }, [text]);
  useEffect(() => {
    const current = ++revision.current;
    let cancelled = false;
    if (!text.trim() || composing || locked || legacyAction) {
      return;
    }
    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        const result = await classifyHomeTasks({ data: { text, today } });
        if (cancelled || revision.current !== current) return;
        setDrafts(result.tasks);
        setNotice(result.notice ?? "");
      } catch {
        if (cancelled || revision.current !== current) return;
        setNotice("Preview unavailable. Add tasks manually.");
      } finally {
        if (revision.current === current) setChecking(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      cancelled = true;
    };
  }, [text, composing, locked, legacyAction]);

  function editDrafts(next: TaskDraft[]) {
    revision.current++;
    setChecking(false);
    setLocked(true);
    setDrafts(next);
  }
  function changeText(value: string) {
    revision.current++;
    observedText.current = value;
    setChecking(!forcedMode && Boolean(value.trim()));
    setDrafts(
      forcedMode && value.trim()
        ? (forcedMode === "list" ? value.split(/\n/).filter((row) => row.trim()) : [value]).map(
            (title) => ({ title: title.trim(), dueDate: null }),
          )
        : value.trim()
          ? drafts
          : [],
    );
    setLocked(Boolean(forcedMode));
    setNotice("");
    onTextChange(value);
  }
  async function save() {
    if (
      saveInFlight.current ||
      composing ||
      !drafts.length ||
      invalidTitle ||
      tooManyTasks ||
      checking
    )
      return;
    saveInFlight.current = true;
    setSaving(true);
    try {
      if (await createTasks(drafts.map((task) => ({ ...task, title: task.title.trim() })))) {
        setReceipt({ id: draftId, tasks: drafts });
        setDraftId((id) => id + 1);
        setForcedMode(null);
        changeText("");
      } else setNotice("Couldn’t save. Try again.");
    } catch {
      setNotice("Couldn’t save. Try again.");
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }
  return (
    <LayoutGroup id={layoutScope}>
      {paletteOpen && (
        <IntentPalette
          onClose={() => {
            setPaletteOpen(false);
            inputRef.current?.focus();
          }}
          onPick={(mode) => {
            setForcedMode(mode);
            setPaletteOpen(false);
            editDrafts(
              mode === "list"
                ? [
                    { title: text.trim(), dueDate: null },
                    { title: "", dueDate: null },
                  ]
                : [{ title: text.trim(), dueDate: null }],
            );
            inputRef.current?.focus();
          }}
        />
      )}
      <MorphContainer readiness={readiness}>
        <div className="p-4">
          <Textarea
            variant="morphComposer"
            rows={1}
            className="max-h-48"
            ref={inputRef}
            aria-label="Home input"
            placeholder="Add a task…"
            maxLength={MAX_TASK_INPUT_LENGTH}
            value={text}
            disabled={saving}
            onChange={(event) => changeText(event.target.value)}
            onCompositionStart={() => {
              revision.current++;
              setComposing(true);
            }}
            onCompositionEnd={() => setComposing(false)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || composing) return;
              if (event.key === "/" && !text.trim()) {
                event.preventDefault();
                setPaletteOpen(true);
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setForcedMode(null);
                changeText("");
                return;
              }
              if (event.key === "Tab" && drafts.length && !locked) {
                editDrafts(drafts);
              }

              if (
                (event.metaKey || event.ctrlKey) &&
                event.key === "Enter" &&
                !event.nativeEvent.isComposing &&
                !composing
              ) {
                event.preventDefault();
                if (legacyAction) onPreviewAction();
              }
            }}
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {text.trim() && (
              <Button
                size="icon"
                aria-label="Preview action"
                disabled={!text.trim() || composing || saving}
                onClick={onPreviewAction}
              >
                <ArrowUp />
              </Button>
            )}
            {!legacyAction && text.trim() && !drafts.length ? (
              <Button
                variant="ghost"
                disabled={saving || composing}
                onClick={() => editDrafts([{ title: text.trim(), dueDate: null }])}
              >
                Add manually
              </Button>
            ) : null}
          </div>
          <p role="status" className="px-px-8 text-ui-12 text-muted-foreground" aria-live="polite">
            {tooManyTasks ? "Add up to 8 tasks at a time." : checking ? "Checking…" : notice}
          </p>
        </div>
        <AnimatePresence initial={false}>
          {!!drafts.length && !legacyAction && (
            <motion.section
              key={`task-card-${draftId}`}
              layoutId={reduce ? undefined : `draft-${draftId}`}
              aria-label="Task preview"
              layout="position"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={
                reduce
                  ? { opacity: 0, transition: tween.exit }
                  : { opacity: 0, scale: 0.98, filter: "blur(4px)", transition: tween.exit }
              }
              transition={reduce ? tween.fade : { ...spring.settle, delay: 0.04 }}
              className="flex flex-col gap-4 px-4 pt-1 pb-4"
            >
              <motion.div
                layout="position"
                className="flex min-h-11 items-center gap-3 text-muted-foreground"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                  <ListTodo className="size-6" />
                </span>
                <span className="relative h-[22px] overflow-hidden text-ui-15 leading-5.5 font-medium text-foreground">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={forcedMode ?? (drafts.length > 1 ? "list" : "task")}
                      className="block"
                      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, filter: "blur(2px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, filter: "blur(2px)" }}
                      transition={reduce ? tween.fade : spring.snappy}
                    >
                      {forcedMode === "deadline"
                        ? "Task with deadline"
                        : forcedMode === "list" || drafts.length > 1
                          ? "Task list"
                          : "Task"}
                    </motion.span>
                  </AnimatePresence>
                </span>
                <span className="ms-auto text-muted-foreground text-ui-12">{drafts.length}</span>
              </motion.div>
              <ul className="flex flex-col">
                <AnimatePresence initial={false}>
                  {drafts.map((task, index) => (
                    <motion.li
                      key={index}
                      layout="position"
                      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, filter: "blur(4px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, transition: tween.exit }}
                      transition={
                        reduce ? tween.fade : { ...spring.settle, delay: 0.04 + index * 0.04 }
                      }
                      className="flex min-h-10 flex-wrap items-center gap-3 border-b border-border/70 py-2 last:border-b-0"
                    >
                      <span
                        aria-hidden
                        className="flex size-4 shrink-0 items-center justify-center rounded-sm border border-border text-muted-foreground"
                      >
                        <Check className="size-2.5 opacity-30" />
                      </span>
                      <input
                        aria-label={`Task ${index + 1}`}
                        className="min-w-[120px] flex-1 rounded-md bg-transparent px-1 py-1.5 text-ui-15 leading-5.5 focus-visible:outline-2 focus-visible:outline-ring"
                        value={task.title}
                        maxLength={300}
                        disabled={saving || checking}
                        onChange={(event) =>
                          editDrafts(
                            drafts.map((row, i) =>
                              i === index ? { ...row, title: event.target.value } : row,
                            ),
                          )
                        }
                      />
                      <label className="flex min-w-0 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2.5 py-1 text-ui-12 text-muted-foreground">
                        <Clock className="size-3.5" aria-hidden />
                        <span className="sr-only">Due date</span>
                        <input
                          type="date"
                          aria-label={`Due date ${index + 1}`}
                          className="min-w-0 max-w-[130px] bg-transparent text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                          value={task.dueDate ?? ""}
                          disabled={saving || checking}
                          onChange={(event) =>
                            editDrafts(
                              drafts.map((row, i) =>
                                i === index ? { ...row, dueDate: event.target.value || null } : row,
                              ),
                            )
                          }
                        />
                      </label>
                      <Button
                        variant="ghost"
                        size="icon-sm"

                        aria-label={`Remove task ${index + 1}`}
                        disabled={saving || checking}
                        onClick={() => editDrafts(drafts.filter((_, i) => i !== index))}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              {drafts.some((task) => task.title.trim().length > 300) && (
                <p role="alert" className="text-sm text-destructive">
                  Keep task titles under 300 characters.
                </p>
              )}
              <motion.div
                layout="position"
                className="flex min-h-8 flex-wrap items-center justify-between gap-2"
              >
                <Button
                  variant="ghost"

                  disabled={saving || checking || drafts.length >= MAX_TASKS}
                  onClick={() => editDrafts([...drafts, { title: "", dueDate: null }])}
                >
                  <Plus className="size-3.5" />
                  Add row
                </Button>
                <Button
                  disabled={
                    disabled || saving || composing || invalidTitle || tooManyTasks || checking
                  }
                  onClick={() => void save()}
                >
                  {saving
                    ? "Adding…"
                    : `Add ${drafts.length === 1 ? "task" : `${drafts.length} tasks`}`}
                  <CornerDownLeft className="size-3.5 opacity-60" aria-hidden />
                </Button>
              </motion.div>
            </motion.section>
          )}
        </AnimatePresence>
      </MorphContainer>
      <AnimatePresence initial={false}>
        {receipt && (
          <motion.section
            key={receipt.id}
            aria-label="Tasks added"
            layout="position"
            layoutId={reduce ? undefined : "draft-" + receipt.id}
            initial={false}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, transition: tween.exit }}
            transition={reduce ? tween.fade : spring.morph}
            className="mt-4 flex items-center gap-3 rounded-ui-12 border border-border bg-background p-3 shadow-sm"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
              <Check className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-ui-13 text-muted-foreground">
                {receipt.tasks.length === 1 ? "Task added" : `${receipt.tasks.length} tasks added`}
              </p>
              <p className="truncate text-ui-15 leading-5.5">
                {receipt.tasks.map((task) => task.title).join(", ")}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Dismiss confirmation"
              onClick={() => setReceipt(null)}
            >
              <X />
            </Button>
          </motion.section>
        )}
      </AnimatePresence>
    </LayoutGroup>
  );
}
