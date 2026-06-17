import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, File as FileIcon, Link as LinkIcon, Youtube, Plus, Upload, RotateCcw, Folder, Github, StickyNote, MoreVertical, Search, Pencil, Edit2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiUrl } from "@/lib/api-url";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

function useAuthFetch() {
  const { session } = useAuth();
  return async (url: string, options: RequestInit = {}) => {
    const token = session?.access_token;
    const headers: Record<string, string> = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    if (!(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }
    return fetch(url, {
      ...options,
      headers: { ...headers, ...(options.headers as any) },
    });
  };
}

async function parseApiError(res: Response, fallback: string) {
  try {
    const data = await res.json();
    return (data as { error?: string; message?: string }).error
      || (data as { error?: string; message?: string }).message
      || fallback;
  } catch {
    return fallback;
  }
}

function isYouTubeUrl(url: string) {
  return /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)/i.test(url);
}

function isGitHubRepoUrl(url: string) {
  return /^https?:\/\/(www\.)?github\.com\/[\w.-]+\/[\w.-]+/i.test(url.trim());
}

type KnowledgeCategory = {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
};

type KnowledgeSource = {
  id: string;
  projectId: string;
  categoryId: string;
  tag: string | null;
  title: string | null;
  filename: string | null;
  fileId: string | null;
  sourceType: string;
  sourceUrl: string | null;
  websiteLinks: string[];
  videoLinks: string[];
  githubLinks: string[];
  tools: string[];
  steps: string[];
  notes: string | null;
  summary: string | null;
  status: "pending" | "processing" | "processed" | "error" | "FAILED" | "PARTIAL_SUCCESS" | "STORED";
  lastError: string | null;
  retryCount: number;
  createdAt: string;
  isWidgetExposed: boolean;
};

export function KnowledgeBase({ projectId }: { projectId: string }) {
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [isAddKnowledgeOpen, setIsAddKnowledgeOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<KnowledgeSource | null>(null);
  
  // Category Form State
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false);
  const [renameCategoryName, setRenameCategoryName] = useState("");
  const [renameCategoryId, setRenameCategoryId] = useState("");
  const [isRenameCategoryOpen, setIsRenameCategoryOpen] = useState(false);

  // Knowledge Form State
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [tag, setTag] = useState("");
  const [draftData, setDraftData] = useState<{ title: string; tags: string; notes: string; file?: File; sourceUrl?: string; sourceType?: string } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit Form State
  const [editTag, setEditTag] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");

  // --- QUERIES ---
  const { data: categories = [], isLoading: isLoadingCategories } = useQuery({
    queryKey: ["knowledge-categories", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/categories/project/${projectId}`));
      if (!res.ok) throw new Error("Failed to load categories");
      const data = await res.json() as KnowledgeCategory[];
      if (data.length > 0 && !activeCategoryId) {
        setActiveCategoryId(data[0].id);
      }
      return data;
    },
  });

  const { data: sources = [], isLoading: isLoadingSources } = useQuery({
    queryKey: ["knowledge-sources", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/files/project/${projectId}`));
      if (!res.ok) throw new Error("Failed to load sources");
      return res.json() as Promise<KnowledgeSource[]>;
    },
    refetchInterval: (query) => {
      return query.state.data?.some((f) => f.status === "pending" || f.status === "processing") ? 3000 : false;
    },
  });

  // --- MUTATIONS: CATEGORY ---
  const createCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await authFetch(apiUrl("/api/categories"), {
        method: "POST",
        body: JSON.stringify({ projectId, name }),
      });
      if (!res.ok) throw new Error("Failed to create category");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Category Created" });
      setNewCategoryName("");
      setIsCreateCategoryOpen(false);
      setActiveCategoryId(data.id);
      queryClient.invalidateQueries({ queryKey: ["knowledge-categories", projectId] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const renameCategoryMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await authFetch(apiUrl(`/api/categories/${id}`), {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to rename category");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Category Renamed" });
      setRenameCategoryName("");
      setIsRenameCategoryOpen(false);
      queryClient.invalidateQueries({ queryKey: ["knowledge-categories", projectId] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(apiUrl(`/api/categories/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete category");
    },
    onSuccess: (_, id) => {
      toast({ title: "Category Deleted" });
      if (activeCategoryId === id) setActiveCategoryId(categories[0]?.id || null);
      queryClient.invalidateQueries({ queryKey: ["knowledge-categories", projectId] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-sources", projectId] });
    },
  });

  // --- MUTATIONS: KNOWLEDGE ---
  const analyzeMutation = useMutation({
    mutationFn: async (payload: any) => {
      let res;
      if (payload instanceof FormData) {
        res = await authFetch(apiUrl("/api/files/analyze"), { method: "POST", body: payload });
      } else {
        res = await authFetch(apiUrl("/api/files/analyze"), { method: "POST", body: JSON.stringify(payload) });
      }
      if (!res.ok) throw new Error(await parseApiError(res, "Analysis failed"));
      return res.json();
    },
    onSuccess: (data, variables) => {
      let sourceType = "";
      let sourceUrl = "";
      let file = undefined;
      
      if (variables instanceof FormData) {
        sourceType = "file";
        file = variables.get("file") as File;
      } else {
        sourceType = variables.sourceType;
        sourceUrl = variables.sourceUrl;
      }
      
      setDraftData({
        title: data.title || "",
        tags: data.tags || "",
        notes: data.notes || "",
        file,
        sourceType,
        sourceUrl
      });
      setIsAnalyzing(false);
    },
    onError: (err: any) => {
      setIsAnalyzing(false);
      toast({ title: "Analysis Error", description: err.message, variant: "destructive" });
    }
  });

  const handleAnalyze = async (type: string, url?: string, file?: File) => {
    setIsAnalyzing(true);
    if (file) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sourceType", "file");
      analyzeMutation.mutate(formData);
    } else if (url) {
      analyzeMutation.mutate({ sourceType: type, sourceUrl: url });
    }
  };

  const handleSaveDraft = async () => {
    if (!draftData || !activeCategoryId) return;
    
    if (draftData.file) {
      const formData = new FormData();
      formData.append("file", draftData.file);
      formData.append("projectId", projectId);
      formData.append("categoryId", activeCategoryId);
      formData.append("title", draftData.title);
      if (draftData.tags) formData.append("tag", draftData.tags);
      if (draftData.notes) formData.append("notes", draftData.notes);
      
      setIsUploadingFile(true);
      try {
        const res = await authFetch(apiUrl("/api/files/upload"), {
          method: "POST",
          body: formData,
        });
        if (!res.ok) throw new Error(await parseApiError(res, "Failed to upload file"));
        toast({ title: "File Uploaded", description: "Processing in the background." });
        resetAddForm();
      } catch (err: any) {
        toast({ title: "Upload Error", description: err.message, variant: "destructive" });
      } finally {
        setIsUploadingFile(false);
      }
    } else {
      addSourceUrlMutation.mutate({
        sourceType: draftData.sourceType!,
        sourceUrl: draftData.sourceUrl!,
        notesText: draftData.notes,
        // @ts-ignore
        title: draftData.title,
        tag: draftData.tags
      });
    }
  };

  const resetAddForm = () => {
    setIsAddKnowledgeOpen(false);
    setDraftData(null);
    setWebsiteUrl("");
    setVideoUrl("");
    setGithubUrl("");
    setNotes("");
    setTag("");
    queryClient.invalidateQueries({ queryKey: ["knowledge-sources", projectId] });
  };

  const addSourceUrlMutation = useMutation({
    mutationFn: async ({ sourceUrl, sourceUrls, sourceType, notesText, title, tag }: any) => {
      if (!activeCategoryId) throw new Error("Please select a category first");
      const res = await authFetch(apiUrl("/api/files/url"), {
        method: "POST",
        body: JSON.stringify({
          projectId,
          categoryId: activeCategoryId,
          tag: tag?.trim() || undefined,
          sourceType,
          sourceUrl: sourceUrl?.trim(),
          sourceUrls,
          notes: notesText?.trim(),
          title: title?.trim(),
        }),
      });
      if (!res.ok) throw new Error(await parseApiError(res, "Failed to add source"));
      return res.json();
    },
    onSuccess: () => {
      resetAddForm();
      toast({ title: "Knowledge Added", description: "Processing in the background." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteSourceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(apiUrl(`/api/files/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete source");
    },
    onSuccess: () => {
      toast({ title: "Source deleted" });
      queryClient.invalidateQueries({ queryKey: ["knowledge-sources", projectId] });
    },
  });

  const reprocessSourceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(apiUrl(`/api/files/${id}/reprocess`), { method: "POST" });
      if (!res.ok) throw new Error("Failed to retry processing");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Retry started" });
      queryClient.invalidateQueries({ queryKey: ["knowledge-sources", projectId] });
    },
  });

  const toggleWidgetExposureMutation = useMutation({
    mutationFn: async (data: { id: string; isWidgetExposed: boolean }) => {
      const res = await authFetch(apiUrl(`/api/files/${data.id}`), {
        method: "PATCH",
        body: JSON.stringify({ isWidgetExposed: data.isWidgetExposed }),
      });
      if (!res.ok) throw new Error("Failed to update widget exposure");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-sources", projectId] });
    },
    onError: () => toast({ title: "Error", description: "Failed to update exposure", variant: "destructive" }),
  });

  const updateSourceMutation = useMutation({
    mutationFn: async ({
      id,
      tag: nextTag,
      sourceUrl,
      notes: nextNotes,
      categoryId,
    }: {
      id: string;
      tag?: string;
      sourceUrl?: string;
      notes?: string;
      categoryId?: string;
    }) => {
      const res = await authFetch(apiUrl(`/api/files/${id}`), {
        method: "PATCH",
        body: JSON.stringify({
          tag: nextTag,
          sourceUrl,
          notes: nextNotes,
          categoryId,
        }),
      });
      if (!res.ok) throw new Error(await parseApiError(res, "Failed to update source"));
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Source updated", description: "Changes saved. Reprocessing if content changed." });
      setIsEditOpen(false);
      setEditingSource(null);
      queryClient.invalidateQueries({ queryKey: ["knowledge-sources", projectId] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const openEditDialog = (source: KnowledgeSource) => {
    setEditingSource(source);
    setEditTag(source.tag || "");
    setEditUrl(source.sourceUrl || "");
    setEditNotes(source.notes || "");
    setEditCategoryId(source.categoryId);
    setIsEditOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingSource) return;

    if (editingSource.sourceType === "note" && !editNotes.trim()) {
      toast({ title: "Error", description: "Note content cannot be empty", variant: "destructive" });
      return;
    }

    if (editingSource.sourceType === "youtube" && !isYouTubeUrl(editUrl)) {
      toast({ title: "Error", description: "Please enter a valid YouTube URL", variant: "destructive" });
      return;
    }

    if (editingSource.sourceType === "github" && !isGitHubRepoUrl(editUrl)) {
      toast({ title: "Error", description: "Please enter a valid GitHub repository URL", variant: "destructive" });
      return;
    }

    updateSourceMutation.mutate({
      id: editingSource.id,
      tag: editTag.trim(),
      categoryId: editCategoryId,
      ...(editingSource.sourceType === "note" ? { notes: editNotes.trim() } : {}),
      ...(["website", "youtube", "github"].includes(editingSource.sourceType)
        ? { sourceUrl: editUrl.trim() }
        : {}),
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeCategoryId) {
      toast({ title: "Error", description: "Please create/select a category first", variant: "destructive" });
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    handleAnalyze("file", undefined, file);
    e.target.value = "";
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "youtube": return <Youtube className="w-5 h-5 text-red-500" />;
      case "website": return <LinkIcon className="w-5 h-5 text-blue-400" />;
      case "github": return <Github className="w-5 h-5 text-foreground" />;
      case "note": return <StickyNote className="w-5 h-5 text-yellow-500" />;
      case "video": return <Youtube className="w-5 h-5 text-purple-500" />;
      case "image": return <FileIcon className="w-5 h-5 text-emerald-400" />;
      default: return <FileIcon className="w-5 h-5 text-zinc-400" />;
    }
  };

  const activeSources = sources.filter(s => s.categoryId === activeCategoryId);

  return (
    <div className="flex flex-col md:flex-row gap-6 mt-8 h-[calc(100vh-200px)] min-h-[500px]">
      
      {/* Sidebar: Categories */}
      <Card className="w-full md:w-64 flex-shrink-0 flex flex-col border-border bg-card overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Categories</h3>
          <Dialog open={isCreateCategoryOpen} onOpenChange={setIsCreateCategoryOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Category</DialogTitle>
                <DialogDescription>Organize your project knowledge.</DialogDescription>
              </DialogHeader>
              <div className="flex gap-2 mt-4">
                <Input 
                  placeholder="e.g., Frontend Docs" 
                  value={newCategoryName} 
                  onChange={(e) => setNewCategoryName(e.target.value)} 
                />
                <Button 
                  onClick={() => createCategoryMutation.mutate(newCategoryName)}
                  disabled={!newCategoryName.trim() || createCategoryMutation.isPending}
                >
                  {createCategoryMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={isRenameCategoryOpen} onOpenChange={setIsRenameCategoryOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Rename Category</DialogTitle>
                <DialogDescription>Enter a new name for this category.</DialogDescription>
              </DialogHeader>
              <div className="flex gap-2 mt-4">
                <Input 
                  placeholder="e.g., AI Tools" 
                  value={renameCategoryName} 
                  onChange={(e) => setRenameCategoryName(e.target.value)} 
                />
                <Button 
                  onClick={() => renameCategoryMutation.mutate({ id: renameCategoryId, name: renameCategoryName })}
                  disabled={!renameCategoryName.trim() || renameCategoryName === categories.find(c => c.id === renameCategoryId)?.name || renameCategoryMutation.isPending}
                >
                  {renameCategoryMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {isLoadingCategories ? (
               <div className="flex justify-center p-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            ) : categories.length === 0 ? (
               <div className="text-center p-4 text-xs text-muted-foreground">No categories yet.</div>
            ) : (
              categories.map(cat => (
                <div 
                  key={cat.id}
                  className={`group flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors ${
                    activeCategoryId === cat.id 
                      ? "bg-primary/10 text-primary font-medium" 
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setActiveCategoryId(cat.id)}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Folder className={`w-4 h-4 ${activeCategoryId === cat.id ? "text-primary" : ""}`} />
                    <span className="truncate text-sm">{cat.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 text-muted-foreground hover:text-primary"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setRenameCategoryId(cat.id); 
                        setRenameCategoryName(cat.name); 
                        setIsRenameCategoryOpen(true); 
                      }}
                      title="Rename Category"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        deleteCategoryMutation.mutate(cat.id); 
                      }}
                      title="Delete Category"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </Card>

      {/* Main Content: Sources */}
      <Card className="flex-1 flex flex-col border-border bg-card shadow-sm overflow-hidden">
        {activeCategoryId ? (
          <>
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {categories.find(c => c.id === activeCategoryId)?.name || "Knowledge"}
                </h2>
                <p className="text-sm text-muted-foreground">Manage files, links, and notes in this category.</p>
              </div>
              
              <Dialog open={isAddKnowledgeOpen} onOpenChange={setIsAddKnowledgeOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2 shadow-sm">
                    <Plus className="w-4 h-4" /> Add Knowledge
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>Add Knowledge Source</DialogTitle>
                    <DialogDescription>Upload files, add web links, or create text notes.</DialogDescription>
                  </DialogHeader>
                  <div className="mt-4">
                    <div className="mb-4">
                      <label className="text-xs font-medium text-foreground mb-1 block">Tag (Optional)</label>
                      <Input placeholder="e.g. documentation, reference" value={tag} onChange={(e) => setTag(e.target.value)} />
                    </div>
                    
                    <Tabs defaultValue="file" className="w-full">
                      {draftData ? (
                        <div className="space-y-4 mt-4">
                          <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground border border-border">
                            Review the AI-suggested metadata before saving. You can edit these fields.
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Title</label>
                            <Input value={draftData.title} onChange={(e) => setDraftData({ ...draftData, title: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Tags (Comma-separated)</label>
                            <Input value={draftData.tags} onChange={(e) => setDraftData({ ...draftData, tags: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Summary Notes</label>
                            <Textarea className="min-h-[100px]" value={draftData.notes} onChange={(e) => setDraftData({ ...draftData, notes: e.target.value })} />
                          </div>
                          <div className="flex gap-2 justify-end pt-4">
                            <Button variant="ghost" onClick={() => setDraftData(null)}>Cancel</Button>
                            <Button onClick={handleSaveDraft} disabled={isUploadingFile || addSourceUrlMutation.isPending}>
                              {isUploadingFile || addSourceUrlMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                              Save Knowledge
                            </Button>
                          </div>
                        </div>
                      ) : isAnalyzing ? (
                        <div className="py-12 flex flex-col items-center justify-center space-y-4">
                           <Loader2 className="w-8 h-8 animate-spin text-primary" />
                           <p className="text-sm font-medium text-muted-foreground animate-pulse">AI is analyzing content and generating suggestions...</p>
                        </div>
                      ) : (
                        <>
                          <TabsList className="grid w-full grid-cols-5 mb-4 h-auto">
                            <TabsTrigger value="file" className="text-xs sm:text-sm">File</TabsTrigger>
                            <TabsTrigger value="website" className="text-xs sm:text-sm">Website</TabsTrigger>
                            <TabsTrigger value="video" className="text-xs sm:text-sm">Video</TabsTrigger>
                            <TabsTrigger value="github" className="text-xs sm:text-sm">GitHub</TabsTrigger>
                            <TabsTrigger value="note" className="text-xs sm:text-sm">Note</TabsTrigger>
                          </TabsList>
                          
                          <TabsContent value="file" className="space-y-4">
                            <div className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center justify-center text-center bg-muted/30 hover:bg-muted/50 transition-colors">
                              <Upload className="w-8 h-8 text-muted-foreground mb-4" />
                              <p className="text-sm font-medium mb-1">Click to upload a file</p>
                              <p className="text-xs text-muted-foreground mb-4">Supports PDF, DOCX, TXT, CSV, MP4, MP3, Images, ZIP</p>
                              <Button
                                type="button"
                                disabled={isUploadingFile}
                                onClick={() => fileInputRef.current?.click()}
                              >
                                {isUploadingFile ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                {isUploadingFile ? "Uploading..." : "Select File"}
                              </Button>
                              <input
                                ref={fileInputRef}
                                type="file"
                                className="hidden"
                                accept=".pdf,.docx,.txt,.md,.csv,.pptx,.mp4,.mp3,.wav,.mov,.webm,.png,.jpg,.jpeg,.webp,.zip"
                                onChange={handleFileUpload}
                                disabled={isUploadingFile}
                              />
                            </div>
                          </TabsContent>
                          
                          <TabsContent value="website" className="space-y-4">
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Website URL</label>
                              <Textarea placeholder="https://example.com/docs&#10;https://example.com/guide&#10;(one URL per line)" className="min-h-[100px]" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} />
                              <p className="text-xs text-muted-foreground">Add web pages to scrape and index their content.</p>
                            </div>
                            <Button
                              className="w-full"
                              onClick={() => {
                                const urls = websiteUrl.split('\n').filter(u => u.trim());
                                if (urls.length === 1) {
                                  handleAnalyze("website", urls[0]);
                                } else {
                                  addSourceUrlMutation.mutate({ sourceType: "website", sourceUrls: urls } as any);
                                }
                              }}
                              disabled={!websiteUrl.trim() || addSourceUrlMutation.isPending || isAnalyzing}
                            >
                              {(addSourceUrlMutation.isPending || isAnalyzing) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                              Add Website
                            </Button>
                          </TabsContent>

                      <TabsContent value="video" className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">YouTube Video URL</label>
                          <Input placeholder="https://youtube.com/watch?v=... or https://youtu.be/..." value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
                          <p className="text-xs text-muted-foreground">Supports youtube.com and youtu.be links. The video transcript will be indexed.</p>
                        </div>
                        <Button
                          className="w-full"
                          onClick={() => {
                            if (!isYouTubeUrl(videoUrl)) {
                              toast({ title: "Error", description: "Please enter a valid YouTube URL", variant: "destructive" });
                              return;
                            }
                            handleAnalyze("youtube", videoUrl);
                          }}
                          disabled={!videoUrl.trim() || addSourceUrlMutation.isPending || isAnalyzing}
                        >
                          {(addSourceUrlMutation.isPending || isAnalyzing) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                          Add Video
                        </Button>
                      </TabsContent>

                      <TabsContent value="github" className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">GitHub Repository URL</label>
                          <Input placeholder="https://github.com/owner/repo" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} />
                        </div>
                        <Button 
                          className="w-full" 
                          onClick={() => {
                            if (!isGitHubRepoUrl(githubUrl)) {
                              toast({ title: "Error", description: "Please enter a valid GitHub repository URL", variant: "destructive" });
                              return;
                            }
                            handleAnalyze("github", githubUrl);
                          }}
                          disabled={!githubUrl.trim() || addSourceUrlMutation.isPending || isAnalyzing}
                        >
                          {(addSourceUrlMutation.isPending || isAnalyzing) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                          Add Repository
                        </Button>
                      </TabsContent>

                      <TabsContent value="note" className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Text Content</label>
                          <Textarea 
                            placeholder="Paste your text here..." 
                            className="min-h-[150px]"
                            value={notes} 
                            onChange={(e) => setNotes(e.target.value)} 
                          />
                        </div>
                        <Button 
                          className="w-full" 
                          onClick={() => addSourceUrlMutation.mutate({ sourceType: "note", notesText: notes })}
                          disabled={!notes.trim() || addSourceUrlMutation.isPending}
                        >
                          {addSourceUrlMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                          Save Note
                        </Button>
                      </TabsContent>
                        </>
                      )}
                    </Tabs>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            
            <ScrollArea className="flex-1 p-4">
              {isLoadingSources ? (
                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
              ) : activeSources.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Search className="w-8 h-8 text-muted-foreground/50" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground">No knowledge sources</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mt-1">
                    Upload files, add links, or write notes to build the brain for this category.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col border-t border-border">
                  {activeSources.map((source) => {
                    const statusConfig = {
                      processed: { color: "bg-emerald-500", text: "text-emerald-500", label: "Processed" },
                      error: { color: "bg-destructive", text: "text-destructive", label: "Failed" },
                      FAILED: { color: "bg-destructive", text: "text-destructive", label: "Failed" },
                      PARTIAL_SUCCESS: { color: "bg-amber-500", text: "text-amber-500", label: "Partial Success" },
                      STORED: { color: "bg-blue-500", text: "text-blue-500", label: "Stored" },
                      pending: { color: "bg-blue-500 animate-pulse", text: "text-blue-500", label: "Pending" },
                      processing: { color: "bg-blue-500 animate-pulse", text: "text-blue-500", label: "Processing" },
                    }[source.status] || { color: "bg-muted-foreground", text: "text-muted-foreground", label: source.status };

                    const previewText = source.summary || source.notes || (source.sourceType === "website" || source.sourceType === "youtube" || source.sourceType === "github" ? source.sourceUrl : source.filename) || "No preview available.";

                    return (
                    <div 
                      key={source.id} 
                      onClick={() => openEditDialog(source)}
                      className="group flex flex-col sm:flex-row items-start sm:items-center p-3 border-b border-border bg-card hover:bg-muted/30 cursor-pointer transition-colors w-full gap-4"
                    >
                      {/* Left: Source Icon & Title */}
                      <div className="flex items-start gap-3 w-full sm:w-[25%] sm:min-w-[200px]">
                        <div className="p-1.5 rounded-md bg-muted text-muted-foreground mt-0.5 shadow-sm border border-border">
                          {getIcon(source.sourceType)}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium text-foreground truncate" title={source.tag || source.title || source.filename || "Knowledge Item"}>
                            {source.tag ? source.tag.split(',')[0].trim() : source.title || source.filename || source.sourceUrl || "Knowledge Item"}
                          </span>
                          <span className="text-xs text-muted-foreground capitalize mt-0.5">
                            {source.sourceType} • {new Date(source.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                      </div>

                      {/* Center: Preview Content */}
                      <div className="flex-1 min-w-0 w-full mt-2 sm:mt-0">
                        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed whitespace-pre-line">
                          {previewText}
                        </p>
                      </div>

                      {/* Right: Status & Actions */}
                      <div className="flex items-center justify-end w-full sm:w-auto sm:flex-none mt-2 sm:mt-0 gap-3 pl-2">
                        
                        <div className="flex items-center gap-2 mr-2" onClick={(e) => e.stopPropagation()} title="Expose to Widget">
                           <Switch 
                             checked={source.isWidgetExposed ?? true} 
                             onCheckedChange={(val) => toggleWidgetExposureMutation.mutate({ id: source.id, isWidgetExposed: val })} 
                           />
                           <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Widget</span>
                        </div>

                        <div 
                          className="flex items-center gap-1.5 px-2 py-1 bg-muted/50 rounded-full border border-border/50"
                          title={source.lastError || "Status details"}
                        >
                          <div className={`w-2 h-2 rounded-full ${statusConfig.color}`} />
                          <span className={`text-[10px] font-semibold uppercase tracking-wider ${statusConfig.text}`}>
                            {statusConfig.label}
                          </span>
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 relative z-10">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="z-[1050]">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditDialog(source); }}>
                              <FileIcon className="w-4 h-4 mr-2" /> View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditDialog(source); }}>
                              <Pencil className="w-4 h-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {source.status !== "pending" && source.status !== "processing" && (
                              <DropdownMenuItem 
                                onClick={(e) => { e.stopPropagation(); reprocessSourceMutation.mutate(source.id); }}
                                disabled={reprocessSourceMutation.isPending}
                              >
                                {reprocessSourceMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />} 
                                Reprocess
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem 
                              className="text-destructive focus:text-destructive"
                              onClick={(e) => { e.stopPropagation(); deleteSourceMutation.mutate(source.id); }}
                              disabled={deleteSourceMutation.isPending}
                            >
                              {deleteSourceMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} 
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  )})}
                </div>
              )}
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col">
            <Folder className="w-12 h-12 mb-4 opacity-20" />
            <p>Create or select a category to manage knowledge.</p>
          </div>
        )}
      </Card>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Knowledge Source</DialogTitle>
            <DialogDescription>
              Update metadata or content. Content changes will trigger reprocessing.
            </DialogDescription>
          </DialogHeader>
          {editingSource && (
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <Select value={editCategoryId} onValueChange={setEditCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Tag (Optional)</label>
                <Input placeholder="e.g. documentation, reference" value={editTag} onChange={(e) => setEditTag(e.target.value)} />
              </div>

              {editingSource.sourceType === "note" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Note Content</label>
                  <Textarea
                    placeholder="Paste your text here..."
                    className="min-h-[150px]"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                  />
                </div>
              )}

              {["website", "youtube", "github"].includes(editingSource.sourceType) && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {editingSource.sourceType === "youtube" ? "YouTube URL" :
                     editingSource.sourceType === "github" ? "GitHub Repository URL" : "Website URL"}
                  </label>
                  <Input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} />
                </div>
              )}

              {editingSource.fileId && (
                <p className="text-xs text-muted-foreground rounded-md border border-border bg-muted/30 p-3">
                  File: <span className="font-medium text-foreground">{editingSource.filename}</span>
                  <br />
                  To replace the file, delete this source and upload a new one.
                </p>
              )}

              <Button
                className="w-full"
                onClick={handleSaveEdit}
                disabled={updateSourceMutation.isPending}
              >
                {updateSourceMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
