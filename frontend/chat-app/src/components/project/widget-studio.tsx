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
  Monitor, Tablet, Smartphone, X, Play, AlertCircle, RotateCcw, Palette, Type, Sliders, Code, Eye
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

import { validateCSS, scopeCSS } from "@/lib/css-validator";

// Selector metadata mapping for helper sheet
function getSelectorMetadata(name: string) {
  const metadata: Record<string, { description: string; properties: string[]; example: string; result: string }> = {
    ".widget-wrapper": {
      description: "Controls the main fixed container wrapping both the launcher button and the chat panel card.",
      properties: ["position", "bottom", "right", "left", "z-index"],
      example: ".widget-wrapper {\n  bottom: 40px !important;\n  right: 40px !important;\n}",
      result: "Repositions the widget further from the screen edges."
    },
    ".chat-panel": {
      description: "Controls the main container card of the active chat window.",
      properties: ["background-color", "border", "border-radius", "width", "height", "box-shadow"],
      example: ".chat-panel {\n  border-radius: 24px !important;\n  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;\n}",
      result: "Applies rounded corners and deep shadow to chat panel."
    },
    ".header": {
      description: "Controls the top header bar section containing the bot info and close button.",
      properties: ["background-color", "padding", "color", "border-bottom"],
      example: ".header {\n  background-color: #4f46e5 !important;\n}",
      result: "Changes header background color."
    },
    ".avatar": {
      description: "Controls the circular avatar display containing the first letter of the bot name.",
      properties: ["width", "height", "background", "border-radius", "font-weight"],
      example: ".avatar {\n  background: #ffffff !important;\n  color: #4f46e5 !important;\n}",
      result: "Styles bot avatar badge."
    },
    ".title": {
      description: "Controls the bot name title text in the header.",
      properties: ["font-size", "font-weight", "color"],
      example: ".title {\n  font-size: 18px !important;\n  font-weight: 700 !important;\n}",
      result: "Enlarges bot name title."
    },
    ".subtitle": {
      description: "Controls the online status subtext under the bot name.",
      properties: ["font-size", "opacity", "color"],
      example: ".subtitle {\n  color: #34d399 !important;\n}",
      result: "Colors online status text green."
    },
    ".messages": {
      description: "Controls the scrollable middle messages viewport container.",
      properties: ["background-color", "padding", "gap"],
      example: ".messages {\n  background-color: #0f172a !important;\n}",
      result: "Changes chat viewport background."
    },
    ".message.bot": {
      description: "Controls the appearance of bot response messages specifically.",
      properties: ["background-color", "color", "border", "border-radius"],
      example: ".message.bot {\n  background-color: #1e293b !important;\n  color: #e2e8f0 !important;\n}",
      result: "Colors assistant response bubbles."
    },
    ".message.user": {
      description: "Controls the appearance of messages sent by the user specifically.",
      properties: ["background-color", "color", "border-radius"],
      example: ".message.user {\n  background: linear-gradient(135deg, #a855f7, #6366f1) !important;\n}",
      result: "Applies gradient fill to user messages."
    },
    ".input-area": {
      description: "Controls the bottom wrapper panel which contains the message input field.",
      properties: ["background-color", "padding", "border-top"],
      example: ".input-area {\n  background-color: #0f172a !important;\n}",
      result: "Darkens bottom input panel."
    },
    ".input-wrapper": {
      description: "Controls the form input bar wrapper.",
      properties: ["background", "border", "border-radius", "padding"],
      example: ".input-wrapper {\n  border: 2px solid #3b82f6 !important;\n  border-radius: 9999px !important;\n}",
      result: "Styles pill-shaped chat input bar."
    },
    ".send-btn": {
      description: "Controls the send arrow button inside the input field.",
      properties: ["background", "color", "border-radius", "width", "height"],
      example: ".send-btn {\n  background: #3b82f6 !important;\n}",
      result: "Colors send button."
    },
    ".floating-button": {
      description: "Controls the floating bubble launcher button used to open the chat widget.",
      properties: ["width", "height", "background-color", "border-radius", "box-shadow"],
      example: ".floating-button {\n  background: linear-gradient(135deg, #3b82f6, #8b5cf6) !important;\n}",
      result: "Styles launcher button with gradient."
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
    themeColor: "#6366f1",
    css: `:host {
  --primary: #6366f1 !important;
}
.chat-panel {
  border-radius: 20px !important;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
}
.floating-button {
  border-radius: 50% !important;
  box-shadow: 0 10px 20px rgba(99, 102, 241, 0.35) !important;
}`
  },
  {
    name: "Glassmorphism",
    description: "Futuristic frosted-glass style with blurred backgrounds and neon highlights.",
    themeColor: "#8b5cf6",
    css: `.chat-panel {
  background: rgba(24, 24, 27, 0.75) !important;
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  border-radius: 24px !important;
}
.message.bot {
  background: rgba(255, 255, 255, 0.06) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
}
.message.user {
  background: linear-gradient(135deg, #8b5cf6, #ec4899) !important;
}`
  },
  {
    name: "Dark Neon",
    description: "Pure black card layout with glowing neon-green accents.",
    themeColor: "#10b981",
    css: `.chat-panel {
  border-radius: 12px !important;
  border: 1px solid #10b981 !important;
  box-shadow: 0 0 15px rgba(16, 185, 129, 0.25) !important;
}
.message.bot {
  background: #171717 !important;
  border: 1px solid #262626 !important;
}
.input-wrapper {
  background: #171717 !important;
  border: 1px solid #10b981 !important;
}`
  },
  {
    name: "Corporate Sky",
    description: "Clean, professional, and trustworthy blue theme for commercial sites.",
    themeColor: "#0284c7",
    css: `.chat-panel {
  border-radius: 14px !important;
  border: 1px solid #0284c7 !important;
}
.message.bot {
  background: #1e293b !important;
  border: 1px solid #334155 !important;
}`
  },
  {
    name: "Sunset Warmth",
    description: "Vibrant header and user bubbles featuring warm orange and amber tones.",
    themeColor: "#f97316",
    css: `.header {
  background: linear-gradient(135deg, #f97316, #ef4444) !important;
}
.message.user {
  background: linear-gradient(135deg, #f97316, #ef4444) !important;
}
.floating-button {
  background: linear-gradient(135deg, #f97316, #ef4444) !important;
}`
  }
];

// 16 Custom Color Fields for Individual Overrides
const CUSTOM_COLOR_FIELDS = [
  { key: "widgetBg", label: "Widget Background", default: "#18181b" },
  { key: "headerBg", label: "Header Background", default: "#8B5CF6" },
  { key: "headerText", label: "Header Text", default: "#ffffff" },
  { key: "aiMsgBg", label: "AI Message Background", default: "#18181b" },
  { key: "aiMsgText", label: "AI Message Text", default: "#f4f4f5" },
  { key: "userMsgBg", label: "User Message Background", default: "#8B5CF6" },
  { key: "userMsgText", label: "User Message Text", default: "#ffffff" },
  { key: "inputBg", label: "Input Background", default: "#09090b" },
  { key: "inputText", label: "Input Text", default: "#f4f4f5" },
  { key: "placeholderText", label: "Placeholder Text", default: "#a1a1aa" },
  { key: "sendBtnBg", label: "Send Button Background", default: "#8B5CF6" },
  { key: "sendBtnIcon", label: "Send Icon", default: "#ffffff" },
  { key: "launcherBg", label: "Launcher Background", default: "#8B5CF6" },
  { key: "launcherIcon", label: "Launcher Icon", default: "#ffffff" },
  { key: "borderColor", label: "Border Color", default: "#27272a" },
  { key: "statusColor", label: "Online/Status Indicator", default: "#10b981" }
];

// Single Source of Truth for Live Preview & Widget CSS
export function generateWidgetCss(data: any): string {
  const themeColor = data.themeColor || "#8B5CF6";
  const app = data.appearance || {};
  const isCustom = app.themeMode === "custom";

  const widgetBg = (isCustom && app.widgetBg) ? app.widgetBg : "#18181b";
  const headerBg = (isCustom && app.headerBg) ? app.headerBg : themeColor;
  const headerText = (isCustom && app.headerText) ? app.headerText : "#ffffff";
  const aiMsgBg = (isCustom && app.aiMsgBg) ? app.aiMsgBg : "#18181b";
  const aiMsgText = (isCustom && app.aiMsgText) ? app.aiMsgText : "#f4f4f5";
  const userMsgBg = (isCustom && app.userMsgBg) ? app.userMsgBg : themeColor;
  const userMsgText = (isCustom && app.userMsgText) ? app.userMsgText : "#ffffff";
  const inputBg = (isCustom && app.inputBg) ? app.inputBg : "#09090b";
  const inputText = (isCustom && app.inputText) ? app.inputText : "#f4f4f5";
  const placeholderText = (isCustom && app.placeholderText) ? app.placeholderText : "#a1a1aa";
  const sendBtnBg = (isCustom && app.sendBtnBg) ? app.sendBtnBg : themeColor;
  const sendBtnIcon = (isCustom && app.sendBtnIcon) ? app.sendBtnIcon : "#ffffff";
  const launcherBg = (isCustom && app.launcherBg) ? app.launcherBg : themeColor;
  const launcherIcon = (isCustom && app.launcherIcon) ? app.launcherIcon : "#ffffff";
  const borderColor = (isCustom && app.borderColor) ? app.borderColor : "#27272a";
  const statusColor = (isCustom && app.statusColor) ? app.statusColor : "#10b981";

  const userCustomCss = data.customCss || "";

  return `
    .chat-panel {
      background-color: ${widgetBg} !important;
      border-color: ${borderColor} !important;
    }
    .header {
      background-color: ${headerBg} !important;
      color: ${headerText} !important;
    }
    .avatar {
      color: ${headerText} !important;
    }
    .title, .subtitle {
      color: ${headerText} !important;
    }
    .status-dot {
      background-color: ${statusColor} !important;
    }
    .close-btn {
      color: ${headerText} !important;
    }
    .messages {
      background-color: ${widgetBg} !important;
    }
    .message.bot {
      background-color: ${aiMsgBg} !important;
      color: ${aiMsgText} !important;
      border-color: ${borderColor} !important;
    }
    .message.user {
      background-color: ${userMsgBg} !important;
      color: ${userMsgText} !important;
    }
    .input-area {
      background-color: ${widgetBg} !important;
      border-top-color: ${borderColor} !important;
    }
    .input-wrapper {
      background-color: ${inputBg} !important;
      border-color: ${borderColor} !important;
    }
    .input-wrapper input {
      color: ${inputText} !important;
    }
    .input-wrapper input::placeholder {
      color: ${placeholderText} !important;
    }
    .send-btn {
      background-color: ${sendBtnBg} !important;
      color: ${sendBtnIcon} !important;
    }
    .floating-button {
      background-color: ${launcherBg} !important;
      color: ${launcherIcon} !important;
    }

    ${userCustomCss}
  `;
}

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

  const [formData, setFormData] = useState<any>({
    botName: "AI Assistant",
    welcomeMessage: "Hello 👋 How can I help you today?",
    inputPlaceholder: "Ask a question...",
    onlineStatus: "Online",
    themeColor: "#8B5CF6",
    displayMode: "floating",
    position: "bottom-right",
    isEnabled: true,
    appearance: {
      themeMode: "all",
      widgetBg: "#18181b",
      headerBg: "#8B5CF6",
      headerText: "#ffffff",
      aiMsgBg: "#18181b",
      aiMsgText: "#f4f4f5",
      userMsgBg: "#8B5CF6",
      userMsgText: "#ffffff",
      inputBg: "#09090b",
      inputText: "#f4f4f5",
      placeholderText: "#a1a1aa",
      sendBtnBg: "#8B5CF6",
      sendBtnIcon: "#ffffff",
      launcherBg: "#8B5CF6",
      launcherIcon: "#ffffff",
      borderColor: "#27272a",
      statusColor: "#10b981"
    }
  });

  // Preview interactive chat messages
  const [previewMessages, setPreviewMessages] = useState<Array<{ role: 'bot' | 'user'; text: string }>>([]);
  const [previewInput, setPreviewInput] = useState("");
  
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
      const val = validateCSS(initialCss);
      
      const app = settings.appearance || {};
      const mergedFormData = {
        ...settings,
        botName: settings.botName || "AI Assistant",
        welcomeMessage: settings.welcomeMessage || "Hello 👋 How can I help you today?",
        inputPlaceholder: settings.inputPlaceholder || "Ask a question...",
        onlineStatus: settings.onlineStatus || "Online",
        themeColor: settings.themeColor || "#8B5CF6",
        appearance: {
          themeMode: app.themeMode || "all",
          widgetBg: app.widgetBg || "#18181b",
          headerBg: app.headerBg || settings.themeColor || "#8B5CF6",
          headerText: app.headerText || "#ffffff",
          aiMsgBg: app.aiMsgBg || "#18181b",
          aiMsgText: app.aiMsgText || "#f4f4f5",
          userMsgBg: app.userMsgBg || settings.themeColor || "#8B5CF6",
          userMsgText: app.userMsgText || "#ffffff",
          inputBg: app.inputBg || "#09090b",
          inputText: app.inputText || "#f4f4f5",
          placeholderText: app.placeholderText || "#a1a1aa",
          sendBtnBg: app.sendBtnBg || settings.themeColor || "#8B5CF6",
          sendBtnIcon: app.sendBtnIcon || "#ffffff",
          launcherBg: app.launcherBg || settings.themeColor || "#8B5CF6",
          launcherIcon: app.launcherIcon || "#ffffff",
          borderColor: app.borderColor || "#27272a",
          statusColor: app.statusColor || "#10b981"
        }
      };

      if (initialCss && val.error === "This does not appear to be CSS") {
        console.warn("Widget settings contained non-CSS content in customCss field. Discarding.");
        setFormData({ ...mergedFormData, customCss: "" });
        setEditorCss("");
        setActivePreviewCss("");
        setValidationError(null);
      } else {
        setFormData(mergedFormData);
        setEditorCss(initialCss);
        setActivePreviewCss(initialCss);
        setValidationError(val.valid ? null : (val.error || "Invalid CSS syntax"));
      }
    }
  }, [settings]);

  // Dynamic selector parsing
  useEffect(() => {
    const fallbackClasses = [
      ".widget-wrapper", ".chat-panel", ".header", ".avatar", ".title", ".subtitle", 
      ".close-btn", ".messages", ".message", ".message.bot", ".message.user", 
      ".input-area", ".input-wrapper", ".send-btn", ".floating-button"
    ];
    setParsedSelectors(fallbackClasses.map(name => ({
      name,
      ...getSelectorMetadata(name)
    })));
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
      toast({ title: "Widget settings saved successfully!" });
    },
    onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validationError) {
      toast({ 
        title: "Warning: CSS has syntax errors", 
        description: "Your changes will be saved, but invalid CSS may not render cleanly.",
        variant: "destructive"
      });
    }
    updateMutation.mutate(formData);
  };

  const handleCssChange = (value: string) => {
    setEditorCss(value);
    const val = validateCSS(value);
    if (val.valid) {
      setValidationError(null);
      setActivePreviewCss(value);
    } else {
      setValidationError(val.error || "Syntax Error");
    }
    setFormData((prev: any) => ({ ...prev, customCss: value }));
  };

  const handleResetAppearance = () => {
    if (window.confirm("Are you sure you want to reset appearance settings? Your knowledge base and API keys will not be affected.")) {
      const resetForm = {
        ...formData,
        botName: "AI Assistant",
        welcomeMessage: "Hello 👋 How can I help you today?",
        inputPlaceholder: "Ask a question...",
        onlineStatus: "Online",
        themeColor: "#8B5CF6",
        customCss: "",
        appearance: {
          themeMode: "all",
          widgetBg: "#18181b",
          headerBg: "#8B5CF6",
          headerText: "#ffffff",
          aiMsgBg: "#18181b",
          aiMsgText: "#f4f4f5",
          userMsgBg: "#8B5CF6",
          userMsgText: "#ffffff",
          inputBg: "#09090b",
          inputText: "#f4f4f5",
          placeholderText: "#a1a1aa",
          sendBtnBg: "#8B5CF6",
          sendBtnIcon: "#ffffff",
          launcherBg: "#8B5CF6",
          launcherIcon: "#ffffff",
          borderColor: "#27272a",
          statusColor: "#10b981"
        }
      };
      setFormData(resetForm);
      setEditorCss("");
      setActivePreviewCss("");
      setValidationError(null);
      toast({ title: "Appearance reset to defaults" });
    }
  };

  const updateAppearanceColor = (colorKey: string, hexValue: string) => {
    setFormData((prev: any) => ({
      ...prev,
      appearance: {
        ...(prev.appearance || {}),
        themeMode: "custom",
        [colorKey]: hexValue
      }
    }));
  };

  const handleSendPreviewMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!previewInput.trim()) return;
    const userText = previewInput.trim();
    setPreviewMessages(prev => [...prev, { role: "user", text: userText }]);
    setPreviewInput("");

    setTimeout(() => {
      setPreviewMessages(prev => [...prev, { 
        role: "bot", 
        text: `Thanks for testing! I am ${formData.botName || "AI Assistant"}. Your styling updates look great!` 
      }]);
    }, 400);
  };

  const applyThemePreset = (preset: typeof CSS_THEMES[0]) => {
    setFormData((prev: any) => ({
      ...prev,
      themeColor: preset.themeColor,
      appearance: {
        ...(prev.appearance || {}),
        headerBg: preset.themeColor,
        userMsgBg: preset.themeColor,
        sendBtnBg: preset.themeColor,
        launcherBg: preset.themeColor
      }
    }));
    handleCssChange(preset.css);
    toast({ title: `Applied ${preset.name} preset` });
  };

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
    e.target.value = "";
  };

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
        const aiValidation = validateCSS(data.css);
        if (aiValidation.error === "This does not appear to be CSS") {
          setAiError("AI returned invalid output (not CSS). Please rephrase your prompt.");
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

  const filteredSelectors = parsedSelectors.filter(s => 
    s.name.toLowerCase().includes(selectorSearch.toLowerCase()) ||
    s.description.toLowerCase().includes(selectorSearch.toLowerCase())
  );

  const calculatedPreviewCss = generateWidgetCss(formData);

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-6 h-6 text-primary" /></div>;

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
        
        {/* Left Column: Redesigned Settings Form */}
        <Card className="bg-card border-border flex flex-col justify-between shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-primary" />
                  Widget Studio
                </CardTitle>
                <CardDescription className="text-xs">
                  Customize the appearance and behavior of your customer chatbot without writing code.
                </CardDescription>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs gap-1.5 h-8 border-border hover:bg-muted"
                onClick={handleResetAppearance}
              >
                <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
                Reset Appearance
              </Button>
            </div>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col justify-between pt-0">
            <Tabs defaultValue="appearance" className="w-full flex-1 flex flex-col justify-between">
              <TabsList className="mb-6 w-full grid grid-cols-4 bg-muted/60 p-1">
                <TabsTrigger value="basic" className="text-xs gap-1.5">
                  <Sliders className="w-3.5 h-3.5" />
                  Basic
                </TabsTrigger>
                <TabsTrigger value="appearance" className="text-xs gap-1.5">
                  <Palette className="w-3.5 h-3.5" />
                  Appearance
                </TabsTrigger>
                <TabsTrigger value="text" className="text-xs gap-1.5">
                  <Type className="w-3.5 h-3.5" />
                  Content / Text
                </TabsTrigger>
                <TabsTrigger value="advanced" className="text-xs gap-1.5">
                  <Code className="w-3.5 h-3.5" />
                  Advanced
                </TabsTrigger>
              </TabsList>

              <form onSubmit={handleSubmit} className="space-y-6 flex-1 flex flex-col justify-between">
                <div className="space-y-6 flex-1">
                  
                  {/* TAB 1: BASIC SETTINGS */}
                  <TabsContent value="basic" className="space-y-6 m-0">
                    <div className="flex items-center justify-between p-4 bg-muted/40 border border-border rounded-lg">
                      <div>
                        <h3 className="text-sm font-medium text-foreground">Enable Widget</h3>
                        <p className="text-xs text-muted-foreground">Allow customer chatbot embed script to render on external websites</p>
                      </div>
                      <Switch
                        checked={formData.isEnabled ?? true}
                        onCheckedChange={(c) => setFormData({ ...formData, isEnabled: c })}
                      />
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
                          <SelectItem value="floating">Floating Bubble (Default FAB)</SelectItem>
                          <SelectItem value="panel">Chat Panel (Slide-out Window)</SelectItem>
                          <SelectItem value="full-screen">Full Screen Mobile Overlay</SelectItem>
                          <SelectItem value="custom">Custom Container Element</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Screen Position</label>
                      <Select 
                        value={formData.position || "bottom-right"} 
                        onValueChange={(val) => setFormData({ ...formData, position: val })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select position" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bottom-right">Bottom Right Corner</SelectItem>
                          <SelectItem value="bottom-left">Bottom Left Corner</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Allowed Domains</label>
                      <p className="text-xs text-muted-foreground">Comma-separated authorized domains (e.g. example.com, mystore.shop)</p>
                      <Input 
                        value={(formData.allowedDomains || []).join(", ")}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          allowedDomains: e.target.value.split(",").map(d => d.trim()).filter(Boolean) 
                        })}
                        placeholder="example.com, localhost"
                      />
                    </div>
                  </TabsContent>

                  {/* TAB 2: APPEARANCE CUSTOMIZATION */}
                  <TabsContent value="appearance" className="space-y-6 m-0">
                    
                    {/* Theme Mode Toggle */}
                    <div className="space-y-3 p-4 bg-muted/30 border border-border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-sm font-medium text-foreground">Color Customization Mode</label>
                          <p className="text-xs text-muted-foreground">Choose simple global theme or individual element color overrides</p>
                        </div>
                        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-1 rounded-md">
                          <Button
                            type="button"
                            size="sm"
                            variant={(formData.appearance?.themeMode || "all") === "all" ? "secondary" : "ghost"}
                            className="h-7 text-xs px-3"
                            onClick={() => setFormData((prev: any) => ({
                              ...prev,
                              appearance: { ...(prev.appearance || {}), themeMode: "all" }
                            }))}
                          >
                            All (Global)
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={(formData.appearance?.themeMode || "all") === "custom" ? "secondary" : "ghost"}
                            className="h-7 text-xs px-3"
                            onClick={() => setFormData((prev: any) => ({
                              ...prev,
                              appearance: { ...(prev.appearance || {}), themeMode: "custom" }
                            }))}
                          >
                            Custom Overrides
                          </Button>
                        </div>
                      </div>

                      {/* Global Theme Color Picker */}
                      <div className="space-y-2 pt-2 border-t border-border">
                        <label className="text-xs font-semibold text-foreground">Global Theme Primary Color</label>
                        <div className="flex items-center gap-3">
                          <Input 
                            type="color" 
                            className="w-14 h-9 p-1 bg-card border border-border rounded cursor-pointer"
                            value={formData.themeColor || "#8B5CF6"}
                            onChange={(e) => {
                              const newHex = e.target.value;
                              setFormData((prev: any) => ({
                                ...prev,
                                themeColor: newHex,
                                appearance: {
                                  ...(prev.appearance || {}),
                                  headerBg: newHex,
                                  userMsgBg: newHex,
                                  sendBtnBg: newHex,
                                  launcherBg: newHex
                                }
                              }));
                            }}
                          />
                          <Input 
                            value={formData.themeColor || "#8B5CF6"}
                            onChange={(e) => {
                              const newHex = e.target.value;
                              setFormData((prev: any) => ({
                                ...prev,
                                themeColor: newHex,
                                appearance: {
                                  ...(prev.appearance || {}),
                                  headerBg: newHex,
                                  userMsgBg: newHex,
                                  sendBtnBg: newHex,
                                  launcherBg: newHex
                                }
                              }));
                            }}
                            placeholder="#8B5CF6"
                            className="font-mono text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Presets */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Theme Presets</label>
                      <div className="flex flex-wrap gap-2">
                        {CSS_THEMES.map((preset) => (
                          <Button
                            key={preset.name}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-xs gap-1.5 h-8 border-border hover:bg-muted"
                            onClick={() => applyThemePreset(preset)}
                          >
                            <span className="w-3 h-3 rounded-full inline-block border border-white/20" style={{ backgroundColor: preset.themeColor }}></span>
                            {preset.name}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* 16 Individual Color Overrides (Visible when Custom Mode is Active) */}
                    {(formData.appearance?.themeMode === "custom") && (
                      <div className="space-y-4 pt-2 border-t border-border animate-in fade-in duration-200">
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">Individual Element Overrides</h4>
                          <p className="text-xs text-muted-foreground">Customize colors for specific chat interface components.</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[320px] overflow-y-auto pr-1">
                          {CUSTOM_COLOR_FIELDS.map((field) => {
                            const val = (formData.appearance && formData.appearance[field.key]) || field.default;
                            return (
                              <div key={field.key} className="space-y-1 p-2 bg-muted/20 border border-border/80 rounded-md">
                                <label className="text-[11px] font-medium text-foreground block truncate">{field.label}</label>
                                <div className="flex items-center gap-2">
                                  <Input 
                                    type="color" 
                                    className="w-8 h-7 p-0.5 bg-card border border-border rounded cursor-pointer shrink-0"
                                    value={val}
                                    onChange={(e) => updateAppearanceColor(field.key, e.target.value)}
                                  />
                                  <Input 
                                    value={val}
                                    onChange={(e) => updateAppearanceColor(field.key, e.target.value)}
                                    placeholder={field.default}
                                    className="font-mono text-[11px] h-7 px-2"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  {/* TAB 3: CONTENT / TEXT CUSTOMIZATION */}
                  <TabsContent value="text" className="space-y-6 m-0">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Bot Name</label>
                      <p className="text-xs text-muted-foreground">Displayed in chat header, avatar badge, and notifications</p>
                      <Input 
                        value={formData.botName || ""}
                        onChange={(e) => setFormData({ ...formData, botName: e.target.value })}
                        placeholder="NexusCRM AI"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Welcome Message</label>
                      <p className="text-xs text-muted-foreground">Initial message shown to visitors when opening the chatbot</p>
                      <Textarea 
                        value={formData.welcomeMessage || ""}
                        onChange={(e) => setFormData({ ...formData, welcomeMessage: e.target.value })}
                        placeholder="Hello 👋 How can I help you today?"
                        className="h-24"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Chat Input Placeholder</label>
                      <p className="text-xs text-muted-foreground">Text displayed inside the pill input box before typing</p>
                      <Input 
                        value={formData.inputPlaceholder || ""}
                        onChange={(e) => setFormData({ ...formData, inputPlaceholder: e.target.value })}
                        placeholder="Ask a question..."
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Online Status Text</label>
                      <p className="text-xs text-muted-foreground">Status text next to the green status indicator dot in the header</p>
                      <Input 
                        value={formData.onlineStatus || ""}
                        onChange={(e) => setFormData({ ...formData, onlineStatus: e.target.value })}
                        placeholder="Online"
                      />
                    </div>
                  </TabsContent>

                  {/* TAB 4: ADVANCED & CUSTOM CSS */}
                  <TabsContent value="advanced" className="space-y-6 m-0">
                    {formData.displayMode === "custom" && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Custom Container Element ID</label>
                        <Input 
                          value={formData.customContainerId || ""}
                          onChange={(e) => setFormData({ ...formData, customContainerId: e.target.value })}
                          placeholder="nova-chat-container"
                        />
                      </div>
                    )}

                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium">Human Support Links (Handoff)</label>
                        <p className="text-xs text-muted-foreground">Direct contact channels provided when a user requests human support</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">WhatsApp Number</label>
                          <Input 
                            value={formData.humanHandoffLinks?.whatsapp || ""}
                            onChange={(e) => setFormData({ ...formData, humanHandoffLinks: { ...formData.humanHandoffLinks, whatsapp: e.target.value } })}
                            placeholder="+1234567890"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Telegram Username</label>
                          <Input 
                            value={formData.humanHandoffLinks?.telegram || ""}
                            onChange={(e) => setFormData({ ...formData, humanHandoffLinks: { ...formData.humanHandoffLinks, telegram: e.target.value } })}
                            placeholder="@support"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Support Email</label>
                          <Input 
                            value={formData.humanHandoffLinks?.email || ""}
                            onChange={(e) => setFormData({ ...formData, humanHandoffLinks: { ...formData.humanHandoffLinks, email: e.target.value } })}
                            placeholder="help@example.com"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Phone Number</label>
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
                          <label className="text-sm font-medium text-foreground">Custom CSS Code</label>
                          <button 
                            type="button" 
                            onClick={() => setIsAssistantOpen(true)}
                            className="text-muted-foreground hover:text-primary transition-colors focus:outline-none"
                            title="Open CSS Assistant System"
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
                        </div>
                      </div>
                      
                      <div className="relative">
                        <Textarea 
                          value={editorCss}
                          onChange={(e) => handleCssChange(e.target.value)}
                          placeholder="/* Type custom CSS overrides here. e.g. */&#10;.chat-panel { border-radius: 20px !important; }"
                          className="font-mono text-[11px] h-44 bg-zinc-950 border-zinc-800 text-zinc-300 focus:border-zinc-700"
                        />
                      </div>

                      {/* Real-time Syntax Validator UI */}
                      <div className="flex items-center text-xs font-semibold mt-1">
                        {editorCss.trim() === "" ? (
                          <span className="text-muted-foreground/60">No custom CSS overrides (using appearance defaults)</span>
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
                    className="w-full gap-2 font-medium"
                  >
                    {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Widget Settings
                  </Button>
                </div>
              </form>
            </Tabs>
          </CardContent>
        </Card>

        {/* Right Column: Reactive Live Preview Pane */}
        <Card className="bg-card border-border overflow-hidden flex flex-col sticky top-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-border bg-muted/30 pb-3 px-6 pt-4">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="w-4 h-4 text-primary" />
                Live Preview
              </CardTitle>
              <CardDescription className="text-xs">Real-time reactive visual rendering of your customized chatbot</CardDescription>
            </div>
            
            {/* Viewport Switcher */}
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
            {/* Inject Unified Calculated CSS into Preview Container */}
            <style dangerouslySetInnerHTML={{ __html: scopeCSS(calculatedPreviewCss, ".preview-container") }} />

            {/* Device Frame */}
            <div 
              className={`preview-container bg-zinc-950 border border-zinc-800 transition-all duration-300 relative overflow-hidden flex flex-col rounded-xl shadow-2xl`}
              style={{ 
                width: previewMode === "mobile" ? "340px" : previewMode === "tablet" ? "450px" : "100%",
                height: previewMode === "mobile" ? "100%" : previewMode === "tablet" ? "480px" : "100%",
                maxHeight: "100%"
              }}
            >
              {/* Background website mockup lines */}
              <div className="p-6 opacity-10 pointer-events-none select-none">
                <div className="w-3/4 h-5 bg-zinc-700 rounded mb-4"></div>
                <div className="w-full h-3 bg-zinc-700 rounded mb-2"></div>
                <div className="w-5/6 h-3 bg-zinc-700 rounded mb-2"></div>
                <div className="w-2/3 h-3 bg-zinc-700 rounded"></div>
              </div>

              {/* Chat Panel preview */}
              {previewMode === "mobile" ? (
                /* Mobile Overlay */
                <div className="chat-panel w-full h-full flex flex-col absolute inset-0 bg-[#18181b] border border-zinc-800 overflow-hidden">
                  <div className="header p-4 flex items-center justify-between">
                    <div className="header-info flex items-center gap-3">
                      <div className="avatar w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
                        {(formData.botName || "A").charAt(0)}
                      </div>
                      <div>
                        <h4 className="title font-semibold text-sm leading-none">{formData.botName || "AI Assistant"}</h4>
                        <span className="subtitle text-[10px] opacity-90 mt-1 flex items-center gap-1">
                          <span className="status-dot w-1.5 h-1.5 rounded-full inline-block"></span>
                          {formData.onlineStatus || "Online"}
                        </span>
                      </div>
                    </div>
                    <button type="button" className="close-btn opacity-80 hover:opacity-100" aria-label="Close">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="messages flex-1 p-4 bg-zinc-950 overflow-y-auto flex flex-col gap-3">
                    <div className="message bot bg-zinc-900 text-zinc-200 text-xs p-3 rounded-2xl rounded-tl-none border border-zinc-800 max-w-[85%] self-start">
                      {formData.welcomeMessage || "Hello 👋 How can I help you today?"}
                    </div>

                    {previewMessages.map((msg, idx) => (
                      <div 
                        key={idx} 
                        className={`message ${msg.role === 'bot' ? 'bot self-start rounded-tl-none bg-zinc-900 border border-zinc-800 text-zinc-200' : 'user self-end rounded-tr-none text-white'} text-xs p-3 rounded-2xl max-w-[85%]`}
                      >
                        {msg.text}
                      </div>
                    ))}

                    {/* Icon-Only Feedback controls inside preview */}
                    <div className="feedback-actions flex gap-1.5 pt-2 border-t border-zinc-800/60 mt-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="fb-btn text-xs hover:scale-110 transition-transform p-1 opacity-70 hover:opacity-100" aria-label="Like">👍</button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-zinc-800 text-zinc-100 text-[10px] px-2 py-0.5">Like</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="fb-btn text-xs hover:scale-110 transition-transform p-1 opacity-70 hover:opacity-100" aria-label="Dislike">👎</button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-zinc-800 text-zinc-100 text-[10px] px-2 py-0.5">Dislike</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="fb-btn text-xs hover:scale-110 transition-transform p-1 opacity-70 hover:opacity-100" aria-label="Suggestion">💡</button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-zinc-800 text-zinc-100 text-[10px] px-2 py-0.5">Suggestion</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  <form onSubmit={handleSendPreviewMessage} className="input-area p-3 bg-zinc-950 border-t border-zinc-800">
                    <div className="input-wrapper bg-zinc-900 rounded-full flex items-center px-4 py-1.5 border border-zinc-800">
                      <input 
                        type="text" 
                        className="flex-1 bg-transparent border-none text-zinc-200 text-xs focus:outline-none" 
                        placeholder={formData.inputPlaceholder || "Ask a question..."} 
                        value={previewInput}
                        onChange={(e) => setPreviewInput(e.target.value)}
                        aria-label="Preview chat input"
                      />
                      <button type="submit" className="send-btn ml-2 text-white shrink-0" aria-label="Send message">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                /* Desktop & Tablet Floating Overlay Frame */
                <div className="absolute inset-0 p-4 flex flex-col items-end justify-end pointer-events-none">
                  <div className="chat-panel w-full bg-[#18181b] border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl mb-4 flex flex-col pointer-events-auto" style={{ height: "370px", maxWidth: "310px" }}>
                    <div className="header p-3.5 flex items-center justify-between">
                      <div className="header-info flex items-center gap-2.5">
                        <div className="avatar w-7 h-7 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs">
                          {(formData.botName || "A").charAt(0)}
                        </div>
                        <div>
                          <h4 className="title font-semibold text-xs leading-none">{formData.botName || "AI Assistant"}</h4>
                          <span className="subtitle text-[9px] opacity-90 mt-0.5 flex items-center gap-1">
                            <span className="status-dot w-1.5 h-1.5 rounded-full inline-block"></span>
                            {formData.onlineStatus || "Online"}
                          </span>
                        </div>
                      </div>
                      <button type="button" className="close-btn opacity-80 hover:opacity-100" aria-label="Close">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    
                    <div className="messages flex-1 p-3 bg-zinc-950 overflow-y-auto flex flex-col gap-2.5">
                      <div className="message bot bg-zinc-900 text-zinc-200 text-[11px] p-2.5 rounded-2xl rounded-tl-none border border-zinc-800 max-w-[85%] self-start">
                        {formData.welcomeMessage || "Hello 👋 How can I help you today?"}
                      </div>

                      {previewMessages.map((msg, idx) => (
                        <div 
                          key={idx} 
                          className={`message ${msg.role === 'bot' ? 'bot self-start rounded-tl-none bg-zinc-900 border border-zinc-800 text-zinc-200' : 'user self-end rounded-tr-none text-white'} text-[11px] p-2.5 rounded-2xl max-w-[85%]`}
                        >
                          {msg.text}
                        </div>
                      ))}

                      {/* Icon-Only Feedback Controls */}
                      <div className="feedback-actions flex gap-1 pt-1.5 border-t border-zinc-800/60 mt-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="fb-btn text-[11px] hover:scale-110 transition-transform p-0.5 opacity-70 hover:opacity-100" aria-label="Like">👍</button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="bg-zinc-800 text-zinc-100 text-[10px] px-2 py-0.5">Like</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="fb-btn text-[11px] hover:scale-110 transition-transform p-0.5 opacity-70 hover:opacity-100" aria-label="Dislike">👎</button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="bg-zinc-800 text-zinc-100 text-[10px] px-2 py-0.5">Dislike</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="fb-btn text-[11px] hover:scale-110 transition-transform p-0.5 opacity-70 hover:opacity-100" aria-label="Suggestion">💡</button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="bg-zinc-800 text-zinc-100 text-[10px] px-2 py-0.5">Suggestion</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>

                    <form onSubmit={handleSendPreviewMessage} className="input-area p-2.5 bg-zinc-950 border-t border-zinc-800">
                      <div className="input-wrapper bg-zinc-900 rounded-full flex items-center px-3 py-1 border border-zinc-800">
                        <input 
                          type="text" 
                          className="flex-1 bg-transparent border-none text-zinc-200 text-[11px] focus:outline-none" 
                          placeholder={formData.inputPlaceholder || "Ask a question..."} 
                          value={previewInput}
                          onChange={(e) => setPreviewInput(e.target.value)}
                          aria-label="Preview chat input"
                        />
                        <button type="submit" className="send-btn ml-1.5 text-white shrink-0" aria-label="Send message">
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                        </button>
                      </div>
                    </form>
                  </div>

                  {formData.displayMode === "floating" && (
                    <div 
                      className="floating-button w-11 h-11 rounded-full shadow-lg flex items-center justify-center text-white cursor-pointer pointer-events-auto shrink-0"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* CSS Assistant Sheet */}
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

              {/* SELECTORS TAB */}
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

                <div className="space-y-1.5 max-h-[280px] overflow-y-auto border border-zinc-800 p-2 rounded-lg bg-zinc-900/40">
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
                            <span className="text-[9px] opacity-75 font-sans">Details →</span>
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

                {selectedSelector && (
                  <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg space-y-3 relative animate-in fade-in duration-150">
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
                          <span key={p} className="text-[10px] bg-zinc-950 text-zinc-400 px-1.5 py-0.5 rounded font-mono border border-zinc-800">{p}</span>
                        ))}
                      </div>
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
                          toast({ title: `Injected CSS example for ${selectedSelector.name}` });
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
Please generate custom CSS code for "${selectedSelector.name}".`;
                          navigator.clipboard.writeText(promptText);
                          toast({ title: "Prompt template copied to clipboard!" });
                        }}
                      >
                        <Copy className="w-3 h-3" />
                        Copy Prompt
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* THEMES TAB */}
              <TabsContent value="themes" className="space-y-4 flex-1 m-0">
                <div className="space-y-3">
                  {CSS_THEMES.map((theme) => (
                    <div key={theme.name} className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-semibold text-zinc-200">{theme.name}</h4>
                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{theme.description}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          type="button"
                          size="sm"
                          className="text-xs gap-1 h-7.5 w-full bg-primary text-white"
                          onClick={() => applyThemePreset(theme)}
                        >
                          <Play className="w-3 h-3" />
                          Apply Preset
                        </Button>
                        <Button 
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1 h-7.5 w-full border-zinc-800 hover:bg-zinc-800 bg-transparent"
                          onClick={() => handleCopyText(theme.css, theme.name, 'template')}
                        >
                          {copiedTemplate === theme.name ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                          Copy CSS
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* AI GENERATOR TAB */}
              <TabsContent value="ai" className="space-y-4 flex-1 m-0">
                {aiDisabled ? (
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-lg text-xs leading-relaxed flex gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">AI Assistant Offline</p>
                      <p className="mt-1 opacity-90">No Gemini API keys configured. You can use appearance controls and theme presets directly.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <form onSubmit={handleGenerateCSS} className="space-y-2">
                      <label className="text-xs font-semibold text-zinc-300">Describe desired widget appearance</label>
                      <Textarea 
                        placeholder="Make the header background dark blue, apply 16px rounded corners to messages..."
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
                      <div className="space-y-2 animate-in fade-in duration-150">
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
                        <pre className="text-[10px] bg-zinc-950 p-3 rounded-lg border border-zinc-800 text-zinc-300 font-mono overflow-x-auto max-h-[180px]">
                          {aiCssResult}
                        </pre>
                        
                        <div className="flex gap-2">
                          <Button 
                            type="button"
                            size="sm"
                            className="w-full text-xs"
                            onClick={() => {
                              handleCssChange(aiCssResult);
                              toast({ title: "Applied generated CSS to editor!" });
                            }}
                          >
                            Apply to Editor
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
