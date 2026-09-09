import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { saveScrollPosition, getSavedScrollPosition } from "@/lib/workspace-continuity";

export function useScrollRestoration<T extends HTMLElement>() {
  const [location] = useLocation();
  const elementRef = useRef<T | null>(null);
  const prevLocationRef = useRef<string>(location);

  // Save scroll position when user scrolls or navigates
  const handleScroll = () => {
    if (elementRef.current && prevLocationRef.current) {
      saveScrollPosition(prevLocationRef.current, elementRef.current.scrollTop);
    }
  };

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    // Save previous route scroll position
    if (prevLocationRef.current && prevLocationRef.current !== location) {
      saveScrollPosition(prevLocationRef.current, el.scrollTop);
    }

    // Restore target route scroll position
    const savedPos = getSavedScrollPosition(location);
    prevLocationRef.current = location;

    const timer = requestAnimationFrame(() => {
      if (elementRef.current) {
        elementRef.current.scrollTop = savedPos;
      }
    });

    return () => cancelAnimationFrame(timer);
  }, [location]);

  return { elementRef, handleScroll };
}
