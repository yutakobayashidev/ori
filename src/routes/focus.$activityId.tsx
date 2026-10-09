import { createFileRoute } from "@tanstack/react-router";
import { FocusPage } from "#/features/focus/focus-page";
export const Route = createFileRoute("/focus/$activityId")({ component: Page });
function Page() {
  const { activityId } = Route.useParams();
  return <FocusPage key={activityId} activityId={activityId} />;
}
