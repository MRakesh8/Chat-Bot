import { useState, useEffect } from "react";
import { getLocalGreeting } from "@/lib/greeting";

/**
 * React hook that returns the time-appropriate greeting derived from the browser's local time.
 * Periodically checks every 60 seconds to update the greeting if the boundary period shifts.
 */
export function useLocalGreeting(): string {
  const [greeting, setGreeting] = useState<string>(() => getLocalGreeting());

  useEffect(() => {
    const checkInterval = setInterval(() => {
      const current = getLocalGreeting();
      setGreeting((prev) => (prev !== current ? current : prev));
    }, 60000);

    return () => clearInterval(checkInterval);
  }, []);

  return greeting;
}
