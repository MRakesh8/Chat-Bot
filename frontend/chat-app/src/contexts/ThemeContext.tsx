import { createContext, useContext, useEffect, useState } from "react";

export type Palette = "warm-paper" | "nova-natural";
export type Mode = "light" | "dark" | "system";
export type LegacyTheme = "dark" | "light" | "system" | "evergreen" | "warm-paper" | "midnight-espresso" | "forest-marigold" | "nova-natural";

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
  setPalette: (palette: Palette) => void;
  setMode: (mode: Mode) => void;
  setTheme: (theme: LegacyTheme) => void;
};

const initialState: ThemeProviderState = {
  palette: "warm-paper",
  mode: "system",
  theme: "system",
  setPalette: () => null,
  setMode: () => null,
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultPalette = "warm-paper",
  defaultMode = "system",
  defaultTheme,
  storageKey = "ui-theme",
  ...props
}: ThemeProviderProps) {
  const [palette, setPaletteState] = useState<Palette>(() => {
    const savedPalette = localStorage.getItem("ui-palette") as Palette;
    if (savedPalette && ["warm-paper", "nova-natural"].includes(savedPalette)) {
      return savedPalette;
    }
    if ((savedPalette as string) === "midnight-espresso" || (savedPalette as string) === "forest-marigold") {
      return "nova-natural";
    }
    const legacyTheme = localStorage.getItem(storageKey) || defaultTheme;
    if (legacyTheme === "evergreen" || legacyTheme === "forest-marigold" || legacyTheme === "midnight-espresso") return "nova-natural";
    if (legacyTheme === "dark") return "warm-paper";
    if (legacyTheme === "light" || legacyTheme === "system") return "warm-paper";
    if (legacyTheme === "nova-natural") return "nova-natural";
    if (legacyTheme === "warm-paper") return "warm-paper";
    return defaultPalette;
  });

  const [mode, setModeState] = useState<Mode>(() => {
    const savedMode = localStorage.getItem("ui-mode") as Mode;
    if (savedMode && ["light", "dark", "system"].includes(savedMode)) {
      return savedMode;
    }
    const savedPalette = localStorage.getItem("ui-palette");
    if (savedPalette === "midnight-espresso") return "dark";
    const legacyTheme = localStorage.getItem(storageKey) || defaultTheme;
    if (legacyTheme === "dark" || legacyTheme === "midnight-espresso") return "dark";
    if (legacyTheme === "light") return "light";
    if (legacyTheme === "system") return "system";
    return defaultMode;
  });

  const getEffectiveMode = (m: Mode): "light" | "dark" => {
    if (m === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return m;
  };

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark", "theme-evergreen", "theme-natural-light", "theme-natural-dark", "theme-forest-light", "theme-forest-dark");

    const effectiveMode = getEffectiveMode(mode);

    if (palette === "nova-natural") {
      if (effectiveMode === "dark") {
        root.classList.add("dark", "theme-natural-dark");
      } else {
        root.classList.add("theme-natural-light", "theme-evergreen");
      }
    } else {
      if (effectiveMode === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.add("light");
      }
    }

    if (mode === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => {
        root.classList.remove("light", "dark", "theme-evergreen", "theme-natural-light", "theme-natural-dark", "theme-forest-light", "theme-forest-dark");
        const newEffectiveMode = mediaQuery.matches ? "dark" : "light";
        if (palette === "nova-natural") {
          root.classList.add(newEffectiveMode === "dark" ? "theme-natural-dark" : "theme-natural-light");
          if (newEffectiveMode === "dark") root.classList.add("dark");
        } else {
          root.classList.add(newEffectiveMode);
        }
      };

      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
    return undefined;
  }, [palette, mode]);

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
    if (t === "evergreen" || t === "forest-marigold") {
      setPalette("nova-natural");
      setMode("light");
    } else if (t === "dark" || t === "midnight-espresso") {
      setPalette("nova-natural");
      setMode("dark");
    } else if (t === "light") {
      setPalette("warm-paper");
      setMode("light");
    } else if (t === "system") {
      setMode("system");
    } else if (t === "warm-paper") {
      setPalette("warm-paper");
    } else if (t === "nova-natural") {
      setPalette("nova-natural");
    }
  };

  const legacyTheme: LegacyTheme =
    palette === "nova-natural"
      ? "nova-natural"
      : mode === "dark"
      ? "dark"
      : mode;

  const value = {
    palette,
    mode,
    theme: legacyTheme,
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
