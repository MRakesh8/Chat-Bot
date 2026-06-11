import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, File as FileIcon, Link as LinkIcon, Youtube, Plus, Upload, RotateCcw, Folder, Github, StickyNote, MoreVertical, Search, Pencil } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiUrl } from "@/lib/api-url";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  filename: string | null;
  fileId: string | null;
  sourceType: string;
  sourceUrl: string | null;
  notes: string | null;
  status: "pending" | "processing" | "processed" | "error";
  createdAt: string;
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

  // Knowledge Form State
  const [url, setUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [tag, setTag] = useState("");
  const [isUploadingFile, setIsUploadingFile] = useState(false);

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
  const addSourceUrlMutation = useMutation({
    mutationFn: async ({ sourceUrl, sourceType, notesText }: { sourceUrl?: string; sourceType: string; notesText?: string }) => {
      if (!activeCategoryId) throw new Error("Please select a category first");
      const res = await authFetch(apiUrl("/api/files/url"), {
        method: "POST",
        body: JSON.stringify({ url: sourceUrl, projectId, categoryId: activeCategoryId, tag, sourceType, sourceUrl, notes: notesText }),
      });
      if (!res.ok) throw new Error("Failed to add source");
      return res.json();
    },
    onSuccess: () => {
      setUrl("");
      setVideoUrl("");
      setNotes("");
      setTag("");
      setIsAddKnowledgeOpen(false);
      toast({ title: "Knowledge Added", description: "Processing in the background." });
      queryClient.invalidateQueries({ queryKey: ["knowledge-sources", projectId] });
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
      if (!res.ok) throw new Error("Failed to update source");
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
    updateSourceMutation.mutate({
      id: editingSource.id,
      tag: editTag,
      categoryId: editCategoryId,
      ...(editingSource.sourceType === "note" ? { notes: editNotes } : {}),
      ...(["website", "youtube", "github"].includes(editingSource.sourceType)
        ? { sourceUrl: editUrl }
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

    const formData = new FormData();
    formData.append("file", file);
    formData.append("projectId", projectId);
    formData.append("categoryId", activeCategoryId);
    if (tag) formData.append("tag", tag);

    setIsUploadingFile(true);
    try {
      const res = await authFetch(apiUrl("/api/files/upload"), {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed to upload file");
      toast({ title: "File Uploaded", description: "Processing in the background." });
      setIsAddKnowledgeOpen(false);
      setTag("");
      queryClient.invalidateQueries({ queryKey: ["knowledge-sources", projectId] });
    } catch (err: any) {
      toast({ title: "Upload Error", description: err.message, variant: "destructive" });
    } finally {
      setIsUploadingFile(false);
      e.target.value = "";
    }
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem 
                        className="text-destructive focus:text-destructive"
                        onClick={(e) => { e.stopPropagation(); deleteCategoryMutation.mutate(cat.id); }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
                          <label className="cursor-pointer">
                            <Button asChild disabled={isUploadingFile}>
                              <span>
                                {isUploadingFile ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                {isUploadingFile ? "Uploading..." : "Select File"}
                              </span>
                            </Button>
                            <input type="file" className="hidden" onChange={handleFileUpload} disabled={isUploadingFile} />
                          </label>
                        </div>
                      </TabsContent>
                      
                      <TabsContent value="website" className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Website URL</label>
                          <Input placeholder="https://example.com/docs" value={url} onChange={(e) => setUrl(e.target.value)} />
                          <p className="text-xs text-muted-foreground">Add a web page to scrape and index its content.</p>
                        </div>
                        <Button
                          className="w-full"
                          onClick={() => addSourceUrlMutation.mutate({ sourceUrl: url, sourceType: "website" })}
                          disabled={!url || addSourceUrlMutation.isPending}
                        >
                          {addSourceUrlMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
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
                          onClick={() => addSourceUrlMutation.mutate({ sourceUrl: videoUrl, sourceType: "youtube" })}
                          disabled={!videoUrl || addSourceUrlMutation.isPending}
                        >
                          {addSourceUrlMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                          Add Video
                        </Button>
                      </TabsContent>

                      <TabsContent value="github" className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">GitHub Repository URL</label>
                          <Input placeholder="https://github.com/owner/repo" value={url} onChange={(e) => setUrl(e.target.value)} />
                        </div>
                        <Button 
                          className="w-full" 
                          onClick={() => addSourceUrlMutation.mutate({ sourceUrl: url, sourceType: "github" })}
                          disabled={!url || addSourceUrlMutation.isPending}
                        >
                          {addSourceUrlMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
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
                          disabled={!notes || addSourceUrlMutation.isPending}
                        >
                          {addSourceUrlMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                          Save Note
                        </Button>
                      </TabsContent>
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
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {activeSources.map((source) => (
                    <div 
                      key={source.id} 
                      className="group flex flex-col p-4 rounded-xl border border-border bg-card hover:bg-muted/50 transition-all shadow-sm hover:shadow-md"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 overflow-hidden">
                          <div className="p-2 rounded-lg bg-background border border-border shadow-sm">
                            {getIcon(source.sourceType)}
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span
                              className="text-sm font-medium text-foreground truncate"
                              title={source.filename || source.sourceUrl || "Text Note"}
                            >
                              {source.filename || source.sourceUrl || "Text Note"}
                            </span>
                            {source.tag && (
                              <span className="inline-flex w-fit max-w-full mt-1.5 text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 font-medium truncate">
                                {source.tag}
                              </span>
                            )}
                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                              <span className="text-xs text-muted-foreground capitalize">
                                {source.sourceType}
                              </span>
                              <span className="text-muted-foreground text-[10px]">•</span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(source.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => openEditDialog(source)}
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          {source.status !== "pending" && source.status !== "processing" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => reprocessSourceMutation.mutate(source.id)}
                              disabled={reprocessSourceMutation.isPending}
                              title="Reprocess"
                            >
                              {reprocessSourceMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => deleteSourceMutation.mutate(source.id)}
                            disabled={deleteSourceMutation.isPending}
                            title="Delete"
                          >
                            {deleteSourceMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                      
                      {/* Status indicator bar at bottom */}
                      <div className="mt-4 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden relative">
                          {source.status === "processed" && <div className="absolute inset-y-0 left-0 bg-emerald-500 w-full"></div>}
                          {source.status === "error" && <div className="absolute inset-y-0 left-0 bg-destructive w-full"></div>}
                          {(source.status === "pending" || source.status === "processing") && (
                            <div className="absolute inset-y-0 left-0 bg-blue-500 w-1/2 animate-pulse rounded-full"></div>
                          )}
                        </div>
                        <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                          source.status === "processed" ? "text-emerald-500" :
                          source.status === "error" ? "text-destructive" : "text-blue-500"
                        }`}>
                          {source.status}
                        </span>
                      </div>
                    </div>
                  ))}
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
