import React, { createContext, useContext, useState, useCallback } from "react";

interface NovaAiContextType {
  isOpen: boolean;
  isMinimized: boolean;
  toggleOpen: () => void;
  toggleMinimize: () => void;
  openAssistant: () => void;
  closeAssistant: () => void;
}

const NovaAiContext = createContext<NovaAiContextType | undefined>(undefined);

export function NovaAiProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  const toggleOpen = useCallback(() => {
    if (!isOpen) {
      setIsOpen(true);
      setIsMinimized(false);
    } else {
      setIsOpen(false);
      setIsMinimized(false);
    }
  }, [isOpen]);

  const toggleMinimize = useCallback(() => {
    if (isOpen) {
      setIsMinimized((prev) => !prev);
    }
  }, [isOpen]);

  const openAssistant = useCallback(() => {
    setIsOpen(true);
    setIsMinimized(false);
  }, []);

  const closeAssistant = useCallback(() => {
    setIsOpen(false);
    setIsMinimized(false);
  }, []);

  return (
    <NovaAiContext.Provider
      value={{
        isOpen,
        isMinimized,
        toggleOpen,
        toggleMinimize,
        openAssistant,
        closeAssistant,
      }}
    >
      {children}
    </NovaAiContext.Provider>
  );
}

export function useNovaAi() {
  const context = useContext(NovaAiContext);
  if (!context) {
    throw new Error("useNovaAi must be used within a NovaAiProvider");
  }
  return context;
}
