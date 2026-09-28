import { useDebouncer } from "@tanstack/react-pacer";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useUrlState } from "./use-url-state";

// Only the uncommitted text is local. Results and restored views read the URL.
export function useSearchInput(selection: "article" | "conversation") {
  const [search, updateSearch] = useUrlState();
  const router = useRouter();
  const [draft, setDraft] = useState<string | null>(null);
  const composing = useRef(false);
  const debouncer = useDebouncer(
    (value: string) => {
      updateSearch({ q: value || undefined, [selection]: undefined }, { replace: true });
    },
    { wait: 300 },
  );

  useEffect(
    () =>
      router.subscribe("onBeforeNavigate", () => {
        debouncer.cancel();
        setDraft(null);
      }),
    [router, debouncer],
  );

  function change(value: string) {
    setDraft(value);
    if (!composing.current) debouncer.maybeExecute(value);
  }

  return {
    value: draft ?? search.q ?? "",
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => change(event.target.value),
    onCompositionStart: () => {
      composing.current = true;
      debouncer.cancel();
    },
    onCompositionEnd: (event: React.CompositionEvent<HTMLInputElement>) => {
      composing.current = false;
      change(event.currentTarget.value);
    },
    clear: () => {
      debouncer.cancel();
      setDraft(null);
      updateSearch({ q: undefined, [selection]: undefined }, { replace: true });
    },
  };
}
