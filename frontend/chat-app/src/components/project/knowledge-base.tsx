import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, File as FileIcon, Link as LinkIcon, Youtube, Plus, Upload, RotateCcw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiUrl } from "@/lib/api-url";

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

type ProjectFile = {
  id: string;
  projectId: string;
  filename: string;
  fileUrl: string;
  type: string;
  status: "pending" | "processed" | "error";
  createdAt: string;
};

export function KnowledgeBase({ projectId }: { projectId: string }) {
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [url, setUrl] = useState("");
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const { data: files, isLoading } = useQuery({
    queryKey: ["project-files", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/files/project/${projectId}`));
      if (!res.ok) throw new Error("Failed to load files");
      return res.json() as Promise<ProjectFile[]>;
    },
    refetchInterval: (query) => {
      // Refetch if any files are pending
      return query.state.data?.some((f) => f.status === "pending") ? 3000 : false;
    },
  });

  const uploadUrlMutation = useMutation({
    mutationFn: async (submitUrl: string) => {
      const res = await authFetch(apiUrl("/api/files/url"), {
        method: "POST",
        body: JSON.stringify({ url: submitUrl, projectId }),
      });
      if (!res.ok) throw new Error("Failed to add URL");
      return res.json();
    },
    onSuccess: () => {
      setUrl("");
      toast({ title: "URL Added", description: "The content is being processed in the background." });
      queryClient.invalidateQueries({ queryKey: ["project-files", projectId] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const res = await authFetch(apiUrl(`/api/files/${fileId}`), { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete file");
    },
    onSuccess: () => {
      toast({ title: "File deleted" });
      queryClient.invalidateQueries({ queryKey: ["project-files", projectId] });
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const res = await authFetch(apiUrl(`/api/files/${fileId}/reprocess`), { method: "POST" });
      if (!res.ok) throw new Error("Failed to retry processing");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Retry started", description: "The file is being processed again." });
      queryClient.invalidateQueries({ queryKey: ["project-files", projectId] });
    },
    onError: (err: any) => toast({ title: "Retry Error", description: err.message, variant: "destructive" }),
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("projectId", projectId);

    setIsUploadingFile(true);
    try {
      const res = await authFetch(apiUrl("/api/files/upload"), {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed to upload file");
      toast({ title: "File Uploaded", description: "The file is being processed in the background." });
      queryClient.invalidateQueries({ queryKey: ["project-files", projectId] });
    } catch (err: any) {
      toast({ title: "Upload Error", description: err.message, variant: "destructive" });
    } finally {
      setIsUploadingFile(false);
      e.target.value = ""; // reset file input
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "youtube": return <Youtube className="w-4 h-4 text-red-500" />;
      case "website": return <LinkIcon className="w-4 h-4 text-blue-400" />;
      case "pdf": return <FileIcon className="w-4 h-4 text-red-400" />;
      case "docx": return <FileIcon className="w-4 h-4 text-blue-500" />;
      default: return <FileIcon className="w-4 h-4 text-zinc-400" />;
    }
  };

  return (
    <Card className="bg-card border-border text-card-foreground mt-8">
      <CardHeader>
        <CardTitle>Knowledge Base</CardTitle>
        <CardDescription className="text-muted-foreground">
          Upload documents (PDF, DOCX) or link websites and YouTube videos for your AI to learn from.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upload Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Add Web Link or YouTube URL</label>
            <div className="flex gap-2">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="bg-muted border-border"
              />
              <Button
                variant="outline"
                className="border-border bg-card hover:bg-muted"
                onClick={() => {
                  if (url.trim()) uploadUrlMutation.mutate(url.trim());
                }}
                disabled={!url.trim() || uploadUrlMutation.isPending}
              >
                {uploadUrlMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Upload File (PDF, DOCX, TXT, PPT, Images)</label>
            <div className="flex items-center gap-2">
              <label className="cursor-pointer flex items-center justify-center gap-2 border border-border bg-card hover:bg-muted h-10 px-4 rounded-md w-full transition-colors">
                {isUploadingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span className="text-sm font-medium">{isUploadingFile ? "Uploading..." : "Choose File"}</span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.txt,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/*"
                  onChange={handleFileUpload}
                  disabled={isUploadingFile}
                />
              </label>
            </div>
          </div>
        </div>

        {/* File List */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold mb-3">Project Files</h3>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : files?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
              No files uploaded yet.
            </div>
          ) : (
            <div className="space-y-2">
              {files?.map((f) => (
                <div key={f.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted hover:bg-muted/80 transition-colors">
                  <div className="flex items-center gap-3 overflow-hidden">
                    {getIcon(f.type)}
                    <div className="flex flex-col truncate">
                      <span className="text-sm font-medium truncate">{f.filename}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(f.createdAt).toLocaleDateString()} &middot;{" "}
                        <span className={
                          f.status === "processed" ? "text-green-400" :
                          f.status === "error" ? "text-red-400" : "text-yellow-400"
                        }>
                          {f.status}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {f.status !== "pending" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground hover:bg-muted"
                        onClick={() => reprocessMutation.mutate(f.id)}
                        disabled={reprocessMutation.isPending}
                        title={f.status === "error" ? "Retry processing" : "Reprocess knowledge"}
                      >
                        {reprocessMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => deleteMutation.mutate(f.id)}
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
