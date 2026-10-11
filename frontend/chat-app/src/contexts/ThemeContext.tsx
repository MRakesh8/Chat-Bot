import { createContext, useContext, useEffect, useState } from "react";

export type Palette = "warm-paper" | "nova-natural";
export type Mode = "light" | "dark" | "system";
export type LegacyTheme =
  | "dark"
  | "light"
  | "system"
  | "evergreen"
  | "warm-paper"
  | "midnight-espresso"
  | "forest-marigold"
  | "nova-natural";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultPalette?: Palette;
  defaultMode?: Mode;
  defaultTheme?: LegacyTheme | string;
  storageKey?: string;
};

type ThemeProviderState = {
  palette: Palette;
  mode: Mode;
  theme: LegacyTheme;
  resolvedTheme: "light" | "dark";
  effectiveMode: "light" | "dark";
  toggleMode: () => void;
  setPalette: (palette: Palette) => void;
  setMode: (mode: Mode) => void;
  setTheme: (theme: LegacyTheme) => void;
};

const initialState: ThemeProviderState = {
  palette: "nova-natural",
  mode: "dark",
  theme: "dark",
  resolvedTheme: "dark",
  effectiveMode: "dark",
  toggleMode: () => null,
  setPalette: () => null,
  setMode: () => null,
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultPalette = "nova-natural",
  defaultMode = "dark",
  defaultTheme,
  storageKey = "ui-theme",
  ...props
}: ThemeProviderProps) {
  const [palette, setPaletteState] = useState<Palette>(() => {
    // 1. Explicit modern palette preference
    const savedPalette = localStorage.getItem("ui-palette");
    if (savedPalette === "warm-paper" || savedPalette === "nova-natural") {
      return savedPalette;
    }
    // 2. Legacy aliases in ui-palette
    if (savedPalette === "midnight-espresso" || savedPalette === "forest-marigold") {
      return "nova-natural";
    }

    // 3. Legacy theme key migration (ui-theme)
    const legacyTheme = localStorage.getItem(storageKey);
    if (legacyTheme) {
      if (legacyTheme === "warm-paper") return "warm-paper";
      if (
        legacyTheme === "evergreen" ||
        legacyTheme === "forest-marigold" ||
        legacyTheme === "midnight-espresso" ||
        legacyTheme === "nova-natural"
      ) {
        return "nova-natural";
      }
      // If legacyTheme is "dark", "light", or "system", no explicit palette was selected,
      // so the new default palette applies
      return defaultPalette;
    }

    if (defaultTheme === "warm-paper") return "warm-paper";
    if (
      defaultTheme === "evergreen" ||
      defaultTheme === "forest-marigold" ||
      defaultTheme === "midnight-espresso" ||
      defaultTheme === "nova-natural"
    ) {
      return "nova-natural";
    }

    return defaultPalette;
  });

  const [mode, setModeState] = useState<Mode>(() => {
    // 1. Explicit modern mode preference
    const savedMode = localStorage.getItem("ui-mode");
    if (savedMode === "light" || savedMode === "dark" || savedMode === "system") {
      return savedMode;
    }

    // 2. Check ui-palette for legacy hints
    const savedPalette = localStorage.getItem("ui-palette");
    if (savedPalette === "midnight-espresso") return "dark";

    // 3. Legacy theme key migration (ui-theme)
    const legacyTheme = localStorage.getItem(storageKey);
    if (legacyTheme) {
      if (legacyTheme === "dark" || legacyTheme === "midnight-espresso") return "dark";
      if (legacyTheme === "light" || legacyTheme === "evergreen" || legacyTheme === "forest-marigold") return "light";
      if (legacyTheme === "system") return "system";
    }

    if (defaultTheme === "dark" || defaultTheme === "light" || defaultTheme === "system") {
      return defaultTheme as Mode;
    }

    return defaultMode;
  });

  const [systemMode, setSystemMode] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "dark";
  });

  const getEffectiveMode = (m: Mode): "light" | "dark" => {
    if (m === "system") {
      return systemMode;
    }
    return m;
  };

  const effectiveMode = getEffectiveMode(mode);

  useEffect(() => {
    const root = window.document.documentElement;
    const applyClasses = (effMode: "light" | "dark") => {
      root.classList.remove(
        "light",
        "dark",
        "theme-evergreen",
        "theme-natural-light",
        "theme-natural-dark",
        "theme-forest-light",
        "theme-forest-dark"
      );

      if (palette === "nova-natural") {
        if (effMode === "dark") {
          root.classList.add("dark", "theme-natural-dark");
        } else {
          root.classList.add("theme-natural-light", "theme-evergreen");
        }
      } else {
        if (effMode === "dark") {
          root.classList.add("dark");
        } else {
          root.classList.add("light");
        }
      }
    };

    applyClasses(effectiveMode);

    if (mode === "system" && typeof window !== "undefined" && window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (e: MediaQueryListEvent) => {
        const nextSys = e.matches ? "dark" : "light";
        setSystemMode(nextSys);
        applyClasses(nextSys);
      };

      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
    return undefined;
  }, [palette, mode, effectiveMode]);

  const setPalette = (p: Palette) => {
    localStorage.setItem("ui-palette", p);
    setPaletteState(p);
  };

  const setMode = (m: Mode) => {
    localStorage.setItem("ui-mode", m);
    setModeState(m);
  };

  const setTheme = (t: LegacyTheme) => {
    localStorage.setItem(storageKey, t);
    if (t === "light") {
      setMode("light");
    } else if (t === "dark") {
      setMode("dark");
    } else if (t === "system") {
      setMode("system");
    } else if (t === "warm-paper") {
      setPalette("warm-paper");
    } else if (t === "nova-natural") {
      setPalette("nova-natural");
    } else if (t === "evergreen" || t === "forest-marigold") {
      setPalette("nova-natural");
      setMode("light");
    } else if (t === "midnight-espresso") {
      setPalette("nova-natural");
      setMode("dark");
    }
  };

  const toggleMode = () => {
    const nextMode = effectiveMode === "dark" ? "light" : "dark";
    setMode(nextMode);
  };

  const value = {
    palette,
    mode,
    theme: effectiveMode as LegacyTheme,
    resolvedTheme: effectiveMode,
    effectiveMode,
    toggleMode,
    setPalette,
    setMode,
    setTheme,
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");
  return context;
};
