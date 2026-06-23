import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiUrl } from "@/lib/api-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Loader2, Save, Info, Copy, Check, Sparkles, Undo, Download, Upload, Search, 
  Monitor, Tablet, Smartphone, X, Play, AlertCircle
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

import { validateCSS, scopeCSS } from "@/lib/css-validator";

// Metadata mapping for widget selectors
function getSelectorMetadata(name: string) {
  const metadata: Record<string, { description: string; properties: string[]; example: string; result: string }> = {
    ".widget-wrapper": {
      description: "Controls the main fixed container wrapping both the launcher button and the chat panel card.",
      properties: ["position", "bottom", "right", "left", "z-index"],
      example: ".widget-wrapper {\n  bottom: 40px !important;\n  right: 40px !important;\n}",
      result: "Repositions the widget further from the screen edges (40px offset instead of 24px)."
    },
    ".chat-panel": {
      description: "Controls the main container card of the active chat window.",
      properties: ["background-color", "border", "border-radius", "width", "height", "box-shadow"],
      example: ".chat-panel {\n  border-radius: 24px !important;\n  width: 380px !important;\n  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;\n}",
      result: "Makes the chat window wider, adds rounder corners, and applies a deep shadow."
    },
    ".header": {
      description: "Controls the top header bar section containing the bot info and close button.",
      properties: ["background-color", "padding", "color", "border-bottom"],
      example: ".header {\n  background-color: #4f46e5 !important;\n  border-bottom: 2px solid #312e81 !important;\n}",
      result: "Changes header background to deep purple/indigo and adds a dark border beneath it."
    },
    ".avatar": {
      description: "Controls the circular avatar display containing the first letter of the bot name.",
      properties: ["width", "height", "background", "border-radius", "font-weight"],
      example: ".avatar {\n  background: #ffffff !important;\n  color: #4f46e5 !important;\n  border: 1px solid #e0e7ff !important;\n}",
      result: "Makes the bot avatar background white with purple letter and border."
    },
    ".title": {
      description: "Controls the bot name title text in the header.",
      properties: ["font-size", "font-weight", "color", "font-family"],
      example: ".title {\n  font-size: 18px !important;\n  font-weight: 700 !important;\n  letter-spacing: -0.025em !important;\n}",
      result: "Enlarges the bot name, making it bold and compact."
    },
    ".subtitle": {
      description: "Controls the online status subtext under the bot name.",
      properties: ["font-size", "opacity", "color", "margin-top"],
      example: ".subtitle {\n  color: #34d399 !important;\n  font-weight: 600 !important;\n}",
      result: "Changes online text status indicator to a bright, bold green."
    },
    ".close-btn": {
      description: "Controls the X close button icon in the top header.",
      properties: ["color", "opacity", "transition", "padding"],
      example: ".close-btn {\n  color: #ff8a8a !important;\n  transform: scale(1.1) !important;\n}",
      result: "Changes the close button color to soft red and slightly increases its size."
    },
    ".messages": {
      description: "Controls the scrollable middle messages viewport container.",
      properties: ["background-color", "padding", "gap", "scroll-behavior"],
      example: ".messages {\n  background-color: #0f172a !important;\n  padding: 24px !important;\n}",
      result: "Sets message container background to dark slate and increases internal padding."
    },
    ".message": {
      description: "Base styling applied to all chat bubble messages (both user and bot).",
      properties: ["font-size", "line-height", "padding", "border-radius", "max-width"],
      example: ".message {\n  font-size: 15px !important;\n  padding: 14px 18px !important;\n}",
      result: "Slightly increases message font size and inflates bubble padding."
    },
    ".message.bot": {
      description: "Controls the appearance of bot response messages specifically.",
      properties: ["background-color", "color", "border", "border-radius"],
      example: ".message.bot {\n  background-color: #1e293b !important;\n  color: #e2e8f0 !important;\n  border: 1px solid #334155 !important;\n}",
      result: "Colors bot chat bubbles slate grey with a light border."
    },
    ".message.user": {
      description: "Controls the appearance of messages sent by the user specifically.",
      properties: ["background-color", "color", "border-radius"],
      example: ".message.user {\n  background: linear-gradient(135deg, #a855f7, #6366f1) !important;\n  color: #ffffff !important;\n}",
      result: "Sets user bubbles to a vibrant purple-to-indigo gradient."
    },
    ".input-area": {
      description: "Controls the bottom wrapper panel which contains the message input field.",
      properties: ["background-color", "padding", "border-top"],
      example: ".input-area {\n  background-color: #0f172a !important;\n  border-top: 1px solid #1e293b !important;\n}",
      result: "Darkens the background of the bottom input panel."
    },
    ".input-wrapper": {
      description: "Controls the form input bar wrapper.",
      properties: ["background", "border", "border-radius", "padding"],
      example: ".input-wrapper {\n  border: 2px solid #3b82f6 !important;\n  background: #1e293b !important;\n  border-radius: 8px !important;\n}",
      result: "Gives the input field container a bold blue border, dark fill, and rectangular look."
    },
    ".input-wrapper input": {
      description: "Controls the text input box itself (where user types text).",
      properties: ["color", "font-size", "placeholder-color"],
      example: ".input-wrapper input {\n  color: #f8fafc !important;\n  font-size: 16px !important;\n}",
      result: "Changes input text color to bright slate and sets text size to 16px."
    },
    ".send-btn": {
      description: "Controls the send arrow button inside the input field.",
      properties: ["background", "color", "border-radius", "width", "height"],
      example: ".send-btn {\n  background: #3b82f6 !important;\n  border-radius: 4px !important;\n}",
      result: "Changes send button shape to a rounded square with bright blue background."
    },
    ".floating-button": {
      description: "Controls the floating bubble launcher button used to open the chat widget.",
      properties: ["width", "height", "background-color", "border-radius", "box-shadow"],
      example: ".floating-button {\n  background: linear-gradient(135deg, #3b82f6, #8b5cf6) !important;\n  border-radius: 12px !important;\n  box-shadow: 0 10px 20px rgba(99, 102, 241, 0.4) !important;\n}",
      result: "Styles launcher button with blue-purple gradient, rounded square look, and indigo drop-shadow."
    },
    ".typing-indicator": {
      description: "Controls the typing indicator bubble shown when the assistant is generating text.",
      properties: ["background-color", "border", "border-radius", "padding"],
      example: ".typing-indicator {\n  background-color: #1e293b !important;\n  border: 1px solid #334155 !important;\n}",
      result: "Colors the typing indicator container bubble to match dark-mode bot bubbles."
    }
  };

  return metadata[name] || {
    description: `Styles the ${name} widget elements.`,
    properties: ["color", "background", "border", "padding"],
    example: `${name} {\n  background: #8b5cf6 !important;\n}`,
    result: "Applies custom background color."
  };
}

// Built-in CSS Themes
const CSS_THEMES = [
  {
    name: "Modern Indigo",
    description: "Sleek modern styling with rich violet-indigo tones and smooth shadows.",
    css: `:host {
  --primary: #6366f1 !important;
  --bg-dark: #0f172a !important;
  --bg-panel: #1e293b !important;
  --border: #334155 !important;
  --text-main: #f8fafc !important;
  --text-muted: #94a3b8 !important;
}

.chat-panel {
  border-radius: 20px !important;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
  border: 1px solid var(--border) !important;
}

.floating-button {
  border-radius: 16px !important;
  box-shadow: 0 10px 20px rgba(99, 102, 241, 0.3) !important;
}`
  },
  {
    name: "Glassmorphism",
    description: "Futuristic frosted-glass style with blurred backgrounds and neon highlights.",
    css: `.chat-panel {
  background: rgba(24, 24, 27, 0.7) !important;
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  border-radius: 24px !important;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6) !important;
}

.message.bot {
  background: rgba(255, 255, 255, 0.05) !important;
  border: 1px solid rgba(255, 255, 255, 0.05) !important;
  color: #f4f4f5 !important;
}

.message.user {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.8), rgba(236, 72, 153, 0.8)) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3) !important;
}

.input-wrapper {
  background: rgba(0, 0, 0, 0.4) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
}

.floating-button {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.9), rgba(236, 72, 153, 0.9)) !important;
  backdrop-filter: blur(8px) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
}`
  },
  {
    name: "Dark Neon",
    description: "Pure black card layout with glowing neon-green accents.",
    css: `:host {
  --primary: #10b981 !important;
  --bg-dark: #000000 !important;
  --bg-panel: #0a0a0a !important;
  --border: #262626 !important;
  --text-main: #ffffff !important;
  --text-muted: #737373 !important;
}

.chat-panel {
  border-radius: 12px !important;
  border: 1px solid #10b981 !important;
  box-shadow: 0 0 15px rgba(16, 185, 129, 0.2) !important;
}

.message.bot {
  background: #171717 !important;
  border: 1px solid #262626 !important;
}

.input-wrapper {
  background: #171717 !important;
  border-radius: 8px !important;
  border: 1px solid #10b981 !important;
}

.floating-button {
  border-radius: 8px !important;
  box-shadow: 0 0 15px rgba(16, 185, 129, 0.3) !important;
}`
  },
  {
    name: "Corporate Sky",
    description: "Clean, professional, and trustworthy blue theme for commercial sites.",
    css: `:host {
  --primary: #0284c7 !important;
  --bg-dark: #f8fafc !important;
  --bg-panel: #ffffff !important;
  --border: #e2e8f0 !important;
  --text-main: #0f172a !important;
  --text-muted: #64748b !important;
}

.chat-panel {
  border-radius: 6px !important;
  border: 2px solid #0284c7 !important;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05) !important;
}

.message.bot {
  background: #f1f5f9 !important;
  border: 1px solid #e2e8f0 !important;
  color: #1e293b !important;
  border-radius: 6px !important;
}

.message.user {
  border-radius: 6px !important;
}

.input-wrapper {
  background: #ffffff !important;
  border: 1px solid #cbd5e1 !important;
  border-radius: 6px !important;
}

.floating-button {
  border-radius: 6px !important;
}`
  },
  {
    name: "Sunset Gradient",
    description: "Vibrant gradient headers and user bubbles featuring warm orange and red colors.",
    css: `.header {
  background: linear-gradient(135deg, #f97316, #ef4444) !important;
}

.message.user {
  background: linear-gradient(135deg, #f97316, #ef4444) !important;
}

.floating-button {
  background: linear-gradient(135deg, #f97316, #ef4444) !important;
  box-shadow: 0 10px 20px rgba(239, 68, 68, 0.3) !important;
}

.send-btn {
  background: linear-gradient(135deg, #f97316, #ef4444) !important;
}`
  },
  {
    name: "Minimalist Mono",
    description: "Ultra-clean stark black-and-white theme with sharp edges and simple lines.",
    css: `:host {
  --primary: #000000 !important;
  --bg-dark: #ffffff !important;
  --bg-panel: #ffffff !important;
  --border: #e5e5e5 !important;
  --text-main: #171717 !important;
  --text-muted: #a3a3a3 !important;
}

.chat-panel {
  border-radius: 0px !important;
  box-shadow: none !important;
  border: 1px solid #171717 !important;
}

.message.bot {
  background: #ffffff !important;
  border-bottom: 1px solid #e5e5e5 !important;
  border-radius: 0px !important;
  padding: 8px 0px !important;
  max-width: 100% !important;
}

.message.user {
  background: #f5f5f5 !important;
  color: #000000 !important;
  border: 1px solid #171717 !important;
  border-radius: 0px !important;
}

.input-wrapper {
  background: #ffffff !important;
  border-radius: 0px !important;
  border: none !important;
  border-bottom: 1px solid #171717 !important;
}

.floating-button {
  border-radius: 0px !important;
  border: 1px solid #171717 !important;
  background: #ffffff !important;
  color: #000000 !important;
}`
  }
];

export function WidgetStudio({ projectId }: { projectId: string }) {
  const { session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = session?.access_token;
    return fetch(url, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  };

  const { data: settings, isLoading } = useQuery({
    queryKey: ["widget-settings", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/settings`));
      if (!res.ok) throw new Error("Failed to load widget settings");
      return res.json();
    },
    enabled: !!projectId,
  });

  const [formData, setFormData] = useState<any>({});
  
  // Custom CSS states
  const [editorCss, setEditorCss] = useState("");
  const [activePreviewCss, setActivePreviewCss] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  
  // Custom CSS Assistant states
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [parsedSelectors, setParsedSelectors] = useState<any[]>([]);
  const [selectorSearch, setSelectorSearch] = useState("");
  const [selectedSelector, setSelectedSelector] = useState<any>(null);
  
  // AI Generator states
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiCssResult, setAiCssResult] = useState<string | null>(null);
  const [aiDisabled, setAiDisabled] = useState(false);
  
  // Copy state trackers
  const [copiedTemplate, setCopiedTemplate] = useState<string | null>(null);
  const [copiedExample, setCopiedExample] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      const initialCss = settings.customCss || "";
      
      // Guard: if the saved customCss contains non-CSS content (e.g. backend error logs
      // that were previously saved due to a bug), discard it and start with empty CSS.
      const val = validateCSS(initialCss);
      if (initialCss && val.error === "This does not appear to be CSS") {
        console.warn("Widget settings contained non-CSS content in customCss field. Discarding.");
        setFormData({ ...settings, customCss: "" });
        setEditorCss("");
        setActivePreviewCss("");
        setValidationError(null);
      } else {
        setFormData(settings);
        setEditorCss(initialCss);
        setActivePreviewCss(initialCss);
        if (!val.valid) {
          setValidationError(val.error || "Invalid CSS syntax");
        } else {
          setValidationError(null);
        }
      }
    }
  }, [settings]);

  // Fetch and parse selectors from widget.js (Fallback to static if it fails)
  useEffect(() => {
    const fetchAndParseSelectors = async () => {
      try {
        const res = await fetch("/widget.js");
        if (res.ok) {
          const text = await res.text();
          const baseStylesMatch = text.match(/function getBaseStyles\(\)\s*\{[\s\S]*?return\s*`([\s\S]*?)`;/);
          if (baseStylesMatch) {
            const cssText = baseStylesMatch[1];
            const classRegex = /\.([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)/g;
            const classes = new Set<string>();
            let match;
            while ((match = classRegex.exec(cssText)) !== null) {
              const className = match[1];
              if (
                className && 
                !className.includes("position-") && 
                className !== "open" && 
                className !== "visible" && 
                className !== "typing-dot"
              ) {
                classes.add("." + className);
              }
            }
            const list = Array.from(classes).map(name => ({
              name,
              ...getSelectorMetadata(name)
            }));
            setParsedSelectors(list);
            return;
          }
        }
      } catch (err) {
        console.error("Failed to parse selectors dynamically:", err);
      }
      
      // Fallback
      const fallbackClasses = [
        ".widget-wrapper", ".chat-panel", ".header", ".avatar", ".title", ".subtitle", 
        ".close-btn", ".messages", ".message", ".message.bot", ".message.user", 
        ".input-area", ".input-wrapper", ".send-btn", ".floating-button", ".typing-indicator"
      ];
      setParsedSelectors(fallbackClasses.map(name => ({
        name,
        ...getSelectorMetadata(name)
      })));
    };

    fetchAndParseSelectors();
  }, []);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/settings`), {
        method: "PUT",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update widget settings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["widget-settings", projectId] });
      toast({ title: "Widget settings saved!" });
    },
    onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validationError) {
      toast({ 
        title: "Warning: CSS has syntax errors", 
        description: "Your changes will be saved, but some styling may not render correctly in production.",
        variant: "destructive"
      });
    }
    updateMutation.mutate(formData);
  };

  // Handle CSS typing reactively
  const handleCssChange = (value: string) => {
    setEditorCss(value);
    
    // Check validation on every keystroke
    const val = validateCSS(value);
    if (val.valid) {
      setValidationError(null);
      // Reactive instant update of preview
      setActivePreviewCss(value);
    } else {
      setValidationError(val.error || "Syntax Error");
      // Keep last valid activePreviewCss intact (DO NOT update activePreviewCss)
    }

    setFormData((prev: any) => ({ ...prev, customCss: value }));
  };

  // Reset CSS (Default values)
  const handleResetCSS = () => {
    if (window.confirm("Are you sure you want to clear your custom CSS? This will restore the default widget styles.")) {
      handleCssChange("");
      toast({ title: "Custom CSS cleared" });
    }
  };

  // Export CSS file
  const handleExportCSS = () => {
    const blob = new Blob([editorCss], { type: "text/css" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${formData.botName || "chatbot"}-custom.css`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: "CSS file exported successfully!" });
  };

  // Import CSS file
  const handleImportCSS = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === "string") {
        handleCssChange(text);
        toast({ title: "CSS file imported successfully!" });
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // clear file select
  };

  // AI CSS Generation Call
  const handleGenerateCSS = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiError(null);
    setAiCssResult(null);

    try {
      const token = session?.access_token;
      const res = await fetch(apiUrl(`/api/projects/${projectId}/widget/generate-css`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ prompt: aiPrompt }),
      });

      if (!res.ok) throw new Error("AI service error");
      const data = await res.json();

      if (data.code === "AI_DISABLED") {
        setAiDisabled(true);
        setAiError(data.error || "AI Generator is unavailable");
      } else if (data.css) {
        // Validate AI output is actually CSS before presenting it to the user
        const aiValidation = validateCSS(data.css);
        if (aiValidation.error === "This does not appear to be CSS") {
          setAiError("AI returned invalid output (not CSS). Please rephrase your prompt and try again.");
        } else {
          setAiCssResult(data.css);
        }
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err: any) {
      setAiError(err.message || "Failed to contact AI generator");
    } finally {
      setAiLoading(false);
    }
  };

  // Apply templates directly
  const applyTheme = (css: string) => {
    handleCssChange(css);
    toast({ title: "Theme applied to editor and live preview!" });
  };

  // Copy template text
  const handleCopyText = (text: string, name: string, type: 'template' | 'example') => {
    navigator.clipboard.writeText(text);
    if (type === 'template') {
      setCopiedTemplate(name);
      setTimeout(() => setCopiedTemplate(null), 1500);
    } else {
      setCopiedExample(name);
      setTimeout(() => setCopiedExample(null), 1500);
    }
    toast({ title: "CSS copied to clipboard!" });
  };

  // Search filter
  const filteredSelectors = parsedSelectors.filter(s => 
    s.name.toLowerCase().includes(selectorSearch.toLowerCase()) ||
    s.description.toLowerCase().includes(selectorSearch.toLowerCase())
  );

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-6 h-6" /></div>;

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        
        {/* Settings Form */}
        <Card className="bg-card border-border flex flex-col justify-between">
          <CardHeader>
            <CardTitle>Widget Studio</CardTitle>
            <CardDescription>Customize how your AI assistant appears on external websites.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <Tabs defaultValue="basic" className="w-full flex-1 flex flex-col justify-between">
              <TabsList className="mb-6 self-start">
                <TabsTrigger value="basic">Basic Settings</TabsTrigger>
                <TabsTrigger value="advanced">Advanced</TabsTrigger>
              </TabsList>

              <form onSubmit={handleSubmit} className="space-y-6 flex-1 flex flex-col justify-between">
                <div className="space-y-6 flex-1">
                  <TabsContent value="basic" className="space-y-6 m-0">
                    <div className="flex items-center justify-between p-4 bg-muted border border-border rounded-lg">
                      <div>
                        <h3 className="text-sm font-medium text-foreground">Enable Widget</h3>
                        <p className="text-xs text-muted-foreground">Allow this chatbot to be loaded via embed script</p>
                      </div>
                      <Switch
                        checked={formData.isEnabled ?? true}
                        onCheckedChange={(c) => setFormData({ ...formData, isEnabled: c })}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Bot Name</label>
                      <Input 
                        value={formData.botName || ""}
                        onChange={(e) => setFormData({ ...formData, botName: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Welcome Message</label>
                      <Textarea 
                        value={formData.welcomeMessage || ""}
                        onChange={(e) => setFormData({ ...formData, welcomeMessage: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Theme Color</label>
                      <div className="flex items-center gap-3">
                        <Input 
                          type="color" 
                          className="w-16 h-10 p-1 bg-card border border-border"
                          value={formData.themeColor || "#8B5CF6"}
                          onChange={(e) => setFormData({ ...formData, themeColor: e.target.value })}
                        />
                        <Input 
                          value={formData.themeColor || "#8B5CF6"}
                          onChange={(e) => setFormData({ ...formData, themeColor: e.target.value })}
                          placeholder="#8B5CF6"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Display Mode</label>
                      <Select 
                        value={formData.displayMode || "floating"} 
                        onValueChange={(val) => setFormData({ ...formData, displayMode: val })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="floating">Floating Bubble</SelectItem>
                          <SelectItem value="panel">Chat Panel (Slide-out)</SelectItem>
                          <SelectItem value="full-screen">Full Screen Mobile</SelectItem>
                          <SelectItem value="custom">Custom Container</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TabsContent>

                  <TabsContent value="advanced" className="space-y-6 m-0">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Allowed Domains</label>
                      <p className="text-xs text-muted-foreground">Comma separated domains (e.g. arunshop.com, www.example.com)</p>
                      <Input 
                        value={(formData.allowedDomains || []).join(", ")}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          allowedDomains: e.target.value.split(",").map(d => d.trim()).filter(Boolean) 
                        })}
                        placeholder="example.com"
                      />
                    </div>

                    {formData.displayMode === "custom" && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Custom Container ID</label>
                        <Input 
                          value={formData.customContainerId || ""}
                          onChange={(e) => setFormData({ ...formData, customContainerId: e.target.value })}
                          placeholder="aria-ai-chat"
                        />
                      </div>
                    )}

                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium">Human Handoff (Optional)</label>
                        <p className="text-xs text-muted-foreground">Contact details if the AI cannot help.</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs">WhatsApp Number</label>
                          <Input 
                            value={formData.humanHandoffLinks?.whatsapp || ""}
                            onChange={(e) => setFormData({ ...formData, humanHandoffLinks: { ...formData.humanHandoffLinks, whatsapp: e.target.value } })}
                            placeholder="+1234567890"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs">Telegram Username</label>
                          <Input 
                            value={formData.humanHandoffLinks?.telegram || ""}
                            onChange={(e) => setFormData({ ...formData, humanHandoffLinks: { ...formData.humanHandoffLinks, telegram: e.target.value } })}
                            placeholder="@username"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs">Email Address</label>
                          <Input 
                            value={formData.humanHandoffLinks?.email || ""}
                            onChange={(e) => setFormData({ ...formData, humanHandoffLinks: { ...formData.humanHandoffLinks, email: e.target.value } })}
                            placeholder="support@domain.com"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs">Phone Number</label>
                          <Input 
                            value={formData.humanHandoffLinks?.phone || ""}
                            onChange={(e) => setFormData({ ...formData, humanHandoffLinks: { ...formData.humanHandoffLinks, phone: e.target.value } })}
                            placeholder="+1234567890"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Custom CSS Editor Section */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <label className="text-sm font-medium text-foreground">Custom CSS</label>
                          <button 
                            type="button" 
                            onClick={() => setIsAssistantOpen(true)}
                            className="text-muted-foreground hover:text-primary transition-colors focus:outline-none"
                            title="Open CSS Assistant Help System"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <input 
                            type="file" 
                            id="import-css-file" 
                            accept=".css" 
                            onChange={handleImportCSS} 
                            className="hidden" 
                          />
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            className="w-7 h-7"
                            title="Import CSS file"
                            onClick={() => document.getElementById("import-css-file")?.click()}
                          >
                            <Upload className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                          </Button>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            className="w-7 h-7"
                            title="Export CSS file"
                            onClick={handleExportCSS}
                          >
                            <Download className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                          </Button>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            className="w-7 h-7"
                            title="Reset CSS"
                            onClick={handleResetCSS}
                          >
                            <Undo className="w-4 h-4 text-muted-foreground hover:text-destructive-foreground" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="relative">
                        <Textarea 
                          value={editorCss}
                          onChange={(e) => handleCssChange(e.target.value)}
                          placeholder="/* Type your custom styles here. e.g. */&#10;.chat-panel { border-radius: 12px !important; }"
                          className="font-mono text-[11px] h-48 bg-zinc-950 border-zinc-800 text-zinc-300 focus:border-zinc-700"
                        />
                      </div>

                      {/* Real-time Syntax Validator UI */}
                      <div className="flex items-center text-xs font-semibold mt-1">
                        {editorCss.trim() === "" ? (
                          <span className="text-muted-foreground/60">No styles defined (using default style)</span>
                        ) : validationError ? (
                          <span className="text-red-500 flex items-center gap-1.5 animate-pulse">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            {validationError === "This does not appear to be CSS" ? "❌ " : "❌ Syntax Error: "}{validationError}
                          </span>
                        ) : (
                          <span className="text-green-500 flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 shrink-0 bg-green-500/10 p-0.5 rounded-full" />
                            ✓ Valid CSS (Live Preview Updated)
                          </span>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                </div>

                <div className="pt-6 border-t border-border mt-auto">
                  <Button 
                    type="submit" 
                    disabled={updateMutation.isPending || validationError === "This does not appear to be CSS"} 
                    className="w-full gap-2"
                  >
                    {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Widget Settings
                  </Button>
                </div>
              </form>
            </Tabs>
          </CardContent>
        </Card>

        {/* Live Preview Pane */}
        <Card className="bg-card border-border overflow-hidden flex flex-col sticky top-6">
          <div className="flex items-center justify-between border-b border-border bg-muted/30 pb-4 px-6 pt-4">
            <div>
              <CardTitle className="text-sm">Live Preview</CardTitle>
              <CardDescription className="text-xs">Preview custom styling instantly on the client side.</CardDescription>
            </div>
            
            {/* Responsive Mode Switcher */}
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-1 rounded-lg">
              <Button 
                type="button" 
                size="sm" 
                variant={previewMode === "desktop" ? "secondary" : "ghost"}
                className="h-7 px-2.5 text-xs gap-1"
                onClick={() => setPreviewMode("desktop")}
              >
                <Monitor className="w-3.5 h-3.5" />
                Desktop
              </Button>
              <Button 
                type="button" 
                size="sm" 
                variant={previewMode === "tablet" ? "secondary" : "ghost"}
                className="h-7 px-2.5 text-xs gap-1"
                onClick={() => setPreviewMode("tablet")}
              >
                <Tablet className="w-3.5 h-3.5" />
                Tablet
              </Button>
              <Button 
                type="button" 
                size="sm" 
                variant={previewMode === "mobile" ? "secondary" : "ghost"}
                className="h-7 px-2.5 text-xs gap-1"
                onClick={() => setPreviewMode("mobile")}
              >
                <Smartphone className="w-3.5 h-3.5" />
                Mobile
              </Button>
            </div>
          </div>
          
          <CardContent className="flex-1 bg-zinc-900 p-4 relative flex items-center justify-center overflow-auto h-[600px] min-h-[480px]">
            {/* Scoped CSS styling injection */}
            <style dangerouslySetInnerHTML={{ __html: scopeCSS(activePreviewCss, ".preview-container") }} />

            {/* Device Screen Frame */}
            <div 
              className={`preview-container bg-zinc-950 border border-zinc-800 transition-all duration-300 relative overflow-hidden flex flex-col rounded-xl shadow-2xl`}
              style={{ 
                width: previewMode === "mobile" ? "340px" : previewMode === "tablet" ? "450px" : "100%",
                height: previewMode === "mobile" ? "100%" : previewMode === "tablet" ? "480px" : "100%",
                maxHeight: "100%"
              }}
            >
              {/* Mock website content inside device frame */}
              <div className="p-6 opacity-10 pointer-events-none select-none">
                <div className="w-3/4 h-5 bg-zinc-700 rounded mb-4"></div>
                <div className="w-full h-3 bg-zinc-700 rounded mb-2"></div>
                <div className="w-5/6 h-3 bg-zinc-700 rounded mb-2"></div>
                <div className="w-2/3 h-3 bg-zinc-700 rounded"></div>
              </div>

              {/* Chat panel inside frame */}
              {previewMode === "mobile" ? (
                /* Mobile: full viewport panel card */
                <div className="chat-panel w-full h-full flex flex-col absolute inset-0 bg-[#18181b] border border-zinc-800 overflow-hidden">
                  <div className="header p-4 flex items-center justify-between text-white" style={{ backgroundColor: formData.themeColor || "#8B5CF6" }}>
                    <div className="header-info flex items-center gap-3">
                      <div className="avatar w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold">
                        {formData.botName?.charAt(0) || "A"}
                      </div>
                      <div>
                        <h4 className="title font-semibold text-sm leading-none">{formData.botName || "AI Assistant"}</h4>
                        <span className="subtitle text-[10px] text-white/80 mt-1 inline-block">● Online</span>
                      </div>
                    </div>
                    <button type="button" className="close-btn text-white/80" aria-label="Close">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="messages flex-1 p-4 bg-zinc-950 overflow-y-auto custom-scrollbar flex flex-col gap-4">
                    <div className="message bot bg-zinc-900 text-zinc-200 text-xs p-3 rounded-2xl rounded-tl-none border border-zinc-800 max-w-[85%] self-start">
                      {formData.welcomeMessage || "Hello 👋"}
                    </div>
                    <div className="message user text-white text-xs p-3 rounded-2xl rounded-tr-none max-w-[85%] self-end" style={{ backgroundColor: formData.themeColor || "#8B5CF6" }}>
                      Can I customize the styles?
                    </div>
                    <div className="message bot bg-zinc-900 text-zinc-200 text-xs p-3 rounded-2xl rounded-tl-none border border-zinc-800 max-w-[85%] self-start">
                      Absolutely! Try changing theme templates or adding Custom CSS.
                    </div>
                  </div>

                  <div className="input-area p-3 bg-zinc-950 border-t border-zinc-800">
                    <div className="input-wrapper bg-zinc-900 rounded-full flex items-center px-4 py-2 border border-zinc-800">
                      <input type="text" className="flex-1 bg-transparent border-none text-zinc-200 text-xs focus:outline-none" placeholder="Ask a question..." disabled />
                      <button type="button" className="send-btn ml-2 text-zinc-400" disabled>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Desktop and Tablet: floating overlay chat panel & bubble */
                <div className="absolute inset-0 p-4 flex flex-col items-end justify-end pointer-events-none">
                  <div className="chat-panel w-full bg-[#18181b] border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl mb-4 flex flex-col pointer-events-auto" style={{ height: "350px", maxWidth: "300px" }}>
                    <div className="header p-3.5 flex items-center justify-between text-white" style={{ backgroundColor: formData.themeColor || "#8B5CF6" }}>
                      <div className="header-info flex items-center gap-2">
                        <div className="avatar w-7 h-7 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs">
                          {formData.botName?.charAt(0) || "A"}
                        </div>
                        <div>
                          <h4 className="title font-semibold text-xs leading-none">{formData.botName || "AI Assistant"}</h4>
                          <span className="subtitle text-[9px] text-white/80 mt-0.5 inline-block">● Online</span>
                        </div>
                      </div>
                      <button type="button" className="close-btn text-white/80" aria-label="Close">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    
                    <div className="messages flex-1 p-3 bg-zinc-950 overflow-y-auto custom-scrollbar flex flex-col gap-3">
                      <div className="message bot bg-zinc-900 text-zinc-200 text-[11px] p-2.5 rounded-2xl rounded-tl-none border border-zinc-800 max-w-[85%] self-start">
                        {formData.welcomeMessage || "Hello 👋"}
                      </div>
                      <div className="message user text-white text-[11px] p-2.5 rounded-2xl rounded-tr-none max-w-[85%] self-end" style={{ backgroundColor: formData.themeColor || "#8B5CF6" }}>
                        Can I customize styles?
                      </div>
                    </div>

                    <div className="input-area p-2.5 bg-zinc-950 border-t border-zinc-800">
                      <div className="input-wrapper bg-zinc-900 rounded-full flex items-center px-3.5 py-1.5 border border-zinc-800">
                        <input type="text" className="flex-1 bg-transparent border-none text-zinc-200 text-[11px] focus:outline-none" placeholder="Ask a question..." disabled />
                        <button type="button" className="send-btn ml-1.5 text-zinc-400" disabled>
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  {formData.displayMode === "floating" && (
                    <div 
                      className="floating-button w-11 h-11 rounded-full shadow-lg flex items-center justify-center text-white cursor-pointer pointer-events-auto"
                      style={{ backgroundColor: formData.themeColor || "#8B5CF6" }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Collapsible CSS Assistant Sheet Sidebar */}
        <Sheet open={isAssistantOpen} onOpenChange={setIsAssistantOpen}>
          <SheetContent className="w-[450px] sm:w-[500px] max-w-full overflow-y-auto flex flex-col bg-zinc-950 border-l border-zinc-800 text-zinc-100 p-6">
            <SheetHeader className="border-b border-zinc-800 pb-4 mb-4">
              <SheetTitle className="text-zinc-100 flex items-center gap-2">
                <Info className="w-5 h-5 text-primary" />
                Custom CSS Assistant
              </SheetTitle>
              <SheetDescription className="text-zinc-400 text-xs">
                Learn widget styling, browse selectors, copy prompt templates for AI models, or apply built-in themes.
              </SheetDescription>
            </SheetHeader>

            <Tabs defaultValue="selectors" className="w-full flex-1 flex flex-col">
              <TabsList className="bg-zinc-900 border border-zinc-800 p-1 mb-4 grid grid-cols-3">
                <TabsTrigger value="selectors" className="text-xs">Selectors</TabsTrigger>
                <TabsTrigger value="themes" className="text-xs">Templates</TabsTrigger>
                <TabsTrigger value="ai" className="text-xs flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-yellow-400" />
                  AI Generator
                </TabsTrigger>
              </TabsList>

              {/* 1. SELECTORS TAB */}
              <TabsContent value="selectors" className="space-y-4 flex-1 m-0">
                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                  <Input 
                    placeholder="Search selector name or description..."
                    className="pl-9 bg-zinc-900 border-zinc-800 text-xs focus:border-zinc-700 h-9 text-zinc-200"
                    value={selectorSearch}
                    onChange={(e) => setSelectorSearch(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5 max-h-[300px] overflow-y-auto custom-scrollbar border border-zinc-850 p-2 rounded-lg bg-zinc-900/40">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold px-2 block">
                    Available CSS Selectors
                  </span>
                  {filteredSelectors.length === 0 ? (
                    <p className="text-xs text-zinc-500 p-3 italic">No selectors matching search</p>
                  ) : (
                    filteredSelectors.map((sel) => (
                      <Tooltip key={sel.name}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className={`w-full text-left px-3 py-2 rounded-md transition-colors text-xs font-mono flex items-center justify-between ${
                              selectedSelector?.name === sel.name 
                                ? "bg-primary text-white" 
                                : "bg-zinc-900 hover:bg-zinc-800 text-zinc-300"
                            }`}
                            onClick={() => setSelectedSelector(sel)}
                          >
                            <span>{sel.name}</span>
                            <span className="text-[9px] opacity-75 font-sans">Self-Learning Info →</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="bg-zinc-800 text-zinc-100 border border-zinc-700 text-xs p-2 max-w-xs shadow-xl">
                          <p className="font-semibold">{sel.name}</p>
                          <p className="text-[11px] text-zinc-300 mt-0.5">{sel.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    ))
                  )}
                </div>

                {/* SELF-LEARNING PROMPT GENERATION PANEL */}
                {selectedSelector ? (
                  <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg space-y-3 relative animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <button 
                      type="button" 
                      onClick={() => setSelectedSelector(null)}
                      className="absolute top-2 right-2 text-zinc-500 hover:text-zinc-200 focus:outline-none"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div>
                      <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded font-mono font-bold">{selectedSelector.name}</span>
                      <h4 className="text-xs font-semibold text-zinc-200 mt-2">What it controls</h4>
                      <p className="text-xs text-zinc-400 leading-relaxed mt-0.5">{selectedSelector.description}</p>
                    </div>
                    
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-200">Common CSS properties</h4>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedSelector.properties.map((p: string) => (
                          <span key={p} className="text-[10px] bg-zinc-950 text-zinc-400 px-1.5 py-0.5 rounded font-mono border border-zinc-850">{p}</span>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-200 flex items-center justify-between">
                        Example Stylesheet
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon" 
                          className="h-5 w-5 text-zinc-500 hover:text-zinc-300"
                          onClick={() => handleCopyText(selectedSelector.example, selectedSelector.name, 'example')}
                        >
                          {copiedExample === selectedSelector.name ? (
                            <Check className="w-3 h-3 text-green-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </Button>
                      </h4>
                      <pre className="text-[10px] bg-zinc-950 p-2.5 rounded border border-zinc-900 text-zinc-400 font-mono mt-1 overflow-x-auto">
                        {selectedSelector.example}
                      </pre>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold text-zinc-200">Visual Effect</h4>
                      <p className="text-xs text-zinc-400 leading-relaxed mt-0.5">{selectedSelector.result}</p>
                    </div>

                    <div className="pt-2 flex gap-2">
                      <Button 
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full text-xs gap-1.5 h-8 border-zinc-800 bg-transparent hover:bg-zinc-800"
                        onClick={() => {
                          const current = editorCss;
                          const delimiter = current && !current.endsWith("\n") ? "\n\n" : "";
                          handleCssChange(`${current}${delimiter}${selectedSelector.example}`);
                          toast({ title: `Injected example CSS for ${selectedSelector.name}` });
                        }}
                      >
                        <Play className="w-3 h-3 text-green-400" />
                        Inject Example
                      </Button>
                      
                      <Button 
                        type="button"
                        size="sm"
                        className="w-full text-xs gap-1.5 h-8"
                        onClick={() => {
                          const promptText = `I want to customize the "${selectedSelector.name}" selector in my chatbot widget.
This selector controls: ${selectedSelector.description}
Common properties used for this selector: ${selectedSelector.properties.join(", ")}

Here is an example structure:
${selectedSelector.example}
Visual result: ${selectedSelector.result}

Please generate custom CSS code for "${selectedSelector.name}" that: [Describe your custom design changes here, e.g., make it glow, add linear gradients, change spacing, etc.]`;
                          navigator.clipboard.writeText(promptText);
                          toast({ title: "Prompt template copied to clipboard! Paste it in ChatGPT, Claude or our AI CSS generator." });
                        }}
                      >
                        <Copy className="w-3 h-3" />
                        Copy Prompt for AI
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="border border-dashed border-zinc-800 rounded-lg p-6 text-center bg-zinc-900/10">
                    <Info className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                    <p className="text-xs text-zinc-500 font-medium">Click any selector name above to open the "Generate CSS Prompt" details panel and copy AI prompts.</p>
                  </div>
                )}
              </TabsContent>

              {/* 2. THEMES & TEMPLATES TAB */}
              <TabsContent value="themes" className="space-y-4 flex-1 m-0">
                <div className="space-y-3">
                  {CSS_THEMES.map((theme) => (
                    <div key={theme.name} className="p-3.5 bg-zinc-900 border border-zinc-850 rounded-lg flex flex-col justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-semibold text-zinc-200">{theme.name}</h4>
                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{theme.description}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          type="button"
                          size="sm"
                          className="text-xs gap-1 h-7.5 w-full bg-primary text-white"
                          onClick={() => applyTheme(theme.css)}
                        >
                          <Play className="w-3 h-3" />
                          Apply Theme
                        </Button>
                        <Button 
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1 h-7.5 w-full border-zinc-800 hover:bg-zinc-800 bg-transparent"
                          onClick={() => handleCopyText(theme.css, theme.name, 'template')}
                        >
                          {copiedTemplate === theme.name ? (
                            <Check className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          Copy CSS
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* 3. AI CSS GENERATOR TAB */}
              <TabsContent value="ai" className="space-y-4 flex-1 m-0">
                {aiDisabled ? (
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-lg text-xs leading-relaxed flex gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">AI Assistant Offline</p>
                      <p className="mt-1 opacity-90">No Gemini API keys are configured for this system. You can still use the custom CSS help reference, dynamic selectors documentation, templates, and import/export features fully.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <form onSubmit={handleGenerateCSS} className="space-y-2">
                      <label className="text-xs font-semibold text-zinc-300">Describe the changes you want (Plain English)</label>
                      <Textarea 
                        placeholder="Make the header background gradient pink-orange, change the border radius to 12px, and color bot text bubbles charcoal grey..."
                        className="bg-zinc-900 border-zinc-800 text-xs text-zinc-200 focus:border-zinc-700 h-24 placeholder-zinc-500"
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                      />
                      <Button 
                        type="submit" 
                        disabled={aiLoading || !aiPrompt.trim()}
                        className="w-full text-xs h-9 gap-1.5"
                      >
                        {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-yellow-400" />}
                        Generate CSS Styles
                      </Button>
                    </form>

                    {aiError && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs flex gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{aiError}</span>
                      </div>
                    )}

                    {aiCssResult && (
                      <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-zinc-300">Generated CSS Output</label>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6"
                            onClick={() => handleCopyText(aiCssResult, 'ai-result', 'example')}
                          >
                            <Copy className="w-3.5 h-3.5 text-zinc-400" />
                          </Button>
                        </div>
                        <pre className="text-[10px] bg-zinc-950 p-3 rounded-lg border border-zinc-850 text-zinc-300 font-mono overflow-x-auto max-h-[180px]">
                          {aiCssResult}
                        </pre>
                        
                        <div className="flex gap-2">
                          <Button 
                            type="button"
                            size="sm"
                            className="w-full text-xs"
                            onClick={() => {
                              handleCssChange(aiCssResult);
                              toast({ title: "Injected and tested generated CSS!" });
                            }}
                          >
                            Replace Editor & Preview
                          </Button>
                          <Button 
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full text-xs border-zinc-800 bg-transparent hover:bg-zinc-800"
                            onClick={() => {
                              const current = editorCss;
                              const delimiter = current && !current.endsWith("\n") ? "\n\n" : "";
                              handleCssChange(`${current}${delimiter}${aiCssResult}`);
                              toast({ title: "Appended generated CSS!" });
                            }}
                          >
                            Append to Editor
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}
