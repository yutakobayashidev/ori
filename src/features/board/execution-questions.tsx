import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
export type PendingInput = {
  requestId: string | number;
  questions: {
    id: string;
    header: string;
    question: string;
    isOther?: boolean;
    isSecret?: boolean;
    options?: { label: string; description: string }[] | null;
  }[];
};
export function ExecutionQuestions({
  input,
  busy,
  submit,
}: {
  input: PendingInput;
  busy: boolean;
  submit: (answers: Record<string, { answers: string[] }>) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  return (
    <form
      className="my-4 space-y-4 rounded-xl border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit(
          Object.fromEntries(
            input.questions.map((question) => [
              question.id,
              { answers: [answers[question.id] ?? ""] },
            ]),
          ),
        );
      }}
    >
      {input.questions.map((question) => (
        <fieldset key={question.id} className="space-y-2">
          <legend className="text-sm font-medium">{question.header}</legend>
          <p className="text-sm">{question.question}</p>
          {question.options?.map((option) => (
            <label
              key={option.label}
              className="flex items-start gap-2 rounded-md border p-2 text-sm"
            >
              <input
                type="radio"
                name={question.id}
                value={option.label}
                checked={answers[question.id] === option.label}
                onChange={() =>
                  setAnswers((previous) => ({ ...previous, [question.id]: option.label }))
                }
              />
              <span>
                {option.label}
                <span className="block text-xs text-muted-foreground">{option.description}</span>
              </span>
            </label>
          ))}
          {(!question.options?.length || question.isOther) && (
            <Input
              aria-label={question.header + " answer"}
              type={question.isSecret ? "password" : "text"}
              value={answers[question.id] ?? ""}
              onChange={(event) =>
                setAnswers((previous) => ({ ...previous, [question.id]: event.target.value }))
              }
            />
          )}
        </fieldset>
      ))}
      <Button
        type="submit"
        disabled={busy || input.questions.some((question) => !answers[question.id]?.trim())}
      >
        Submit answers
      </Button>
    </form>
  );
}
