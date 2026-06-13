import React from "react";
import { Sandpack } from "@codesandbox/sandpack-react";
import { X, Play, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ArtifactViewerProps {
  code: string;
  language: string;
  onClose: () => void;
}

export function ArtifactViewer({ code, language, onClose }: ArtifactViewerProps) {
  let template: "react" | "vanilla" = "vanilla";
  let files: Record<string, string> = {};

  if (language === "html" || language === "html+css" || language === "html+js") {
    template = "vanilla";
    files = {
      "/index.html": code,
      "/styles.css": "body { font-family: sans-serif; padding: 1rem; }",
    };
  } else if (language === "tsx" || language === "jsx" || language === "react") {
    template = "react";
    files = {
      "/App.js": code,
      "/styles.css": "body { font-family: sans-serif; padding: 1rem; }",
    };
  } else {
    // Fallback just show code
    return (
      <div className="flex flex-col h-full bg-background border-l border-border shadow-xl w-full max-w-xl flex-shrink-0 animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Code2 className="w-4 h-4 text-primary" />
            Artifact Preview ({language})
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-4 overflow-auto bg-muted/10 h-full text-sm font-mono whitespace-pre-wrap text-foreground">
          {code}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background border-l border-border shadow-xl w-full max-w-[600px] flex-shrink-0 animate-in slide-in-from-right duration-300">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Play className="w-4 h-4 text-primary" />
          Interactive Artifact
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <Sandpack
          template={template}
          files={files}
          theme="dark"
          options={{
            showNavigator: true,
            showLineNumbers: true,
            showTabs: true,
            closableTabs: false,
            editorHeight: "100%",
          }}
          customSetup={{
            dependencies: {
              "lucide-react": "^0.300.0",
              "framer-motion": "^11.0.0",
            }
          }}
        />
      </div>
    </div>
  );
}
