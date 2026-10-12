import { useState } from "react";
import { Play } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "#/components/ui/sheet";
import type { Activity } from "#/features/activities/model";
import { FocusPage } from "./focus-page";
import { useFocus, useRequiredFocus } from "./focus-store";

export function StartFocusButton({ activity }: { activity: Activity }) {
  const focus = useFocus();
  if (!focus || !["available", "inProgress"].includes(activity.userState)) return null;
  return <StartFocusAction activity={activity} />;
}
function StartFocusAction({ activity }: { activity: Activity }) {
  const focus = useRequiredFocus();
  const [open, setOpen] = useState(false);
  const session = focus.snapshot?.session;
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={focus.busy || !focus.snapshot}
        aria-label={`Focus on ${activity.effective.title}`}
        onClick={async () => {
          if (session || (await focus.start(activity.id))) setOpen(true);
        }}
      >
        <Play className="size-3" />
        {session?.activityId === activity.id ? "Return to focus" : "Focus"}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full! overflow-y-auto sm:max-w-[min(720px,92vw)]!">
          <SheetHeader>
            <SheetTitle>Focus</SheetTitle>
          </SheetHeader>
          <FocusPage activityId={activity.id} embedded />
        </SheetContent>
      </Sheet>
    </>
  );
}
