import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

const STATUS_MESSAGES = [
  "Aria is thinking...",
  "Analyzing request...",
  "Searching knowledge...",
  "Understanding context...",
  "Building response...",
  "Generating answer...",
];

export function RotatingStatus({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={cn("relative h-4 overflow-hidden min-w-[150px]", className)}>
      {STATUS_MESSAGES.map((msg, i) => (
        <span
          key={msg}
          className={cn(
            "absolute left-0 top-0 w-full transition-all duration-500",
            i === index
              ? "opacity-100 translate-y-0"
              : i < index || (index === 0 && i === STATUS_MESSAGES.length - 1)
              ? "opacity-0 -translate-y-4"
              : "opacity-0 translate-y-4"
          )}
        >
          {msg}
        </span>
      ))}
    </div>
  );
}
