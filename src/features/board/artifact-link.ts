import type { ExecutionRun } from "#/features/execution/model";

export function artifactLink(run: Pick<ExecutionRun, "id" | "artifacts">, href: string) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//") || href.startsWith("#"))
    return href;
  let path: string;
  try {
    path = decodeURIComponent(href).split("#")[0] || "";
  } catch {
    return undefined;
  }
  const artifact = run.artifacts.find(
    (file) => path === file.path || path.endsWith("/" + file.path),
  );
  return artifact
    ? "/api/execution/artifacts?" + new URLSearchParams({ id: run.id, path: artifact.path })
    : undefined;
}
