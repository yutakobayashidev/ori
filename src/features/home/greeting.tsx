import { useEffect, useState } from "react";

function currentGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

export function Greeting({ name }: { name: string | undefined }) {
  // The server cannot know the device's timezone. Keep hydration consistent.
  const [greeting, setGreeting] = useState("Hello");
  useEffect(() => {
    const update = () => setGreeting(currentGreeting());
    update();
    const interval = window.setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return (
    <>
      {greeting}, {name}
    </>
  );
}
