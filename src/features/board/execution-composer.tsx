import { ArrowUpIcon, SquareIcon } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "#/components/ui/input-group";

export function ExecutionComposer({
  value,
  onChange,
  onSend,
  onStop,
  active,
  disabled,
  busy,
  initial,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  active: boolean;
  disabled: boolean;
  busy: boolean;
  initial: boolean;
}) {
  const canSend = !disabled && !busy && !active && !!value.trim();
  return (
    <form
      className="shrink-0 px-4 pb-4 pt-3 sm:px-6 sm:pb-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSend();
      }}
    >
      <InputGroup>
        <InputGroupTextarea
          aria-label={initial ? "Work to delegate" : "Follow-up instructions"}
          placeholder={
            initial ? "What would you like Codex to do?" : "Ask for changes or add context…"
          }
          className="max-h-40 min-h-20 resize-none"
          value={value}
          maxLength={16000}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              event.keyCode !== 229
            ) {
              event.preventDefault();
              if (canSend) onSend();
            }
          }}
        />
        <InputGroupAddon align="block-end">
          <span className="text-xs text-muted-foreground">Codex</span>
          {active ? (
            <InputGroupButton
              className="ml-auto"
              size="icon-sm"
              variant="outline"
              aria-label="Stop"
              disabled={busy}
              onClick={onStop}
            >
              <SquareIcon />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              className="ml-auto"
              type="submit"
              size="icon-sm"
              variant="default"
              aria-label={initial ? "Hand off to AI" : "Send follow-up"}
              disabled={!canSend}
            >
              <ArrowUpIcon />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
