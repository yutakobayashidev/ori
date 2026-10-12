const paths = new Set([
  "/",
  "/board",
  "/browse",
  "/deck",
  "/support",
  "/journal",
  "/inbox",
  "/vitals",
]);

export function safeReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value)
  )
    return "/";
  const url = new URL(value, "https://workspace.invalid");
  return url.origin === "https://workspace.invalid" && paths.has(url.pathname)
    ? `${url.pathname}${url.search}${url.hash}`
    : "/";
}
