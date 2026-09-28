import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { validateWorkspaceSearch, type WorkspaceSearch } from "./search";

export function useUrlState() {
  const search = useSearch({ from: "__root__" });
  const navigate = useNavigate();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const update = (patch: Partial<WorkspaceSearch>, options?: { replace?: boolean }) => {
    if (!mounted.current) return;
    void navigate({
      to: ".",
      search: (previous) => validateWorkspaceSearch({ ...previous, ...patch }),
      replace: options?.replace ?? false,
      resetScroll: false,
    });
  };
  return [search, update] as const;
}
