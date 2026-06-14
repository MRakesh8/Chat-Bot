import React, { memo, useCallback, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../contexts/AuthContext";
import { MessageSquare, Plus, Settings, LogOut, Search, Trash2, Edit2, MoreVertical, Check, X, FolderKanban, Heart, FolderPlus, RotateCcw, PanelLeftClose, ArrowLeft, Loader2, BarChart3 } from "lucide-react";
import { useListGeminiConversations, useDeleteGeminiConversation, useUpdateGeminiConversation, getListGeminiConversationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuPortal, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/api-url";
import { useToast } from "@/hooks/use-toast";

const MemoizedConversationItem = memo(function MemoizedConversationItem({
  conv,
  isActive,
  isEditing,
  editTitle,
  pendingFavorite,
  projectList,
  onLocationChange,
  onSaveEdit,
  onCancelEdit,
  onEditTitleChange,
  onStartEdit,
  onToggleFavorite,
  onMoveToProject,
  onDelete,
}: {
  conv: any;
  isActive: boolean;
  isEditing: boolean;
  editTitle: string;
  pendingFavorite: boolean;
  projectList: any[];
  onLocationChange: (id: string) => void;
  onSaveEdit: (id: string, e?: React.MouseEvent) => void;
  onCancelEdit: () => void;
  onEditTitleChange: (title: string) => void;
  onStartEdit: (id: string, title: string, e: React.MouseEvent) => void;
  onToggleFavorite: (id: string, currentStatus: boolean, e: React.MouseEvent) => void;
  onMoveToProject: (id: string, projectId: string | null, e: React.MouseEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all cursor-pointer",
        isActive
          ? "bg-primary/10 text-primary font-medium shadow-sm ring-1 ring-primary/20" 
          : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-sidebar-foreground"
      )}
      onClick={() => onLocationChange(conv.id)}
    >
      <MessageSquare className="w-4 h-4 flex-shrink-0" />
      {isEditing ? (
        <div className="flex-1 flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <Input
            autoFocus
            value={editTitle}
            onChange={e => onEditTitleChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') onSaveEdit(conv.id);
              if (e.key === 'Escape') onCancelEdit();
            }}
            className="h-6 px-1.5 py-0 bg-sidebar-accent border-border text-sidebar-foreground"
          />
          <Button variant="ghost" size="icon" className="h-6 w-6 text-green-500" onClick={() => onSaveEdit(conv.id)}><Check className="w-3 h-3" /></Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={onCancelEdit}><X className="w-3 h-3" /></Button>
        </div>
      ) : (
        <span className="flex-1 truncate select-none">{conv.title}</span>
      )}
      
      <div className={cn(
        "flex items-center transition-opacity",
        isActive || conv.isFavorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      )}>
        <Button
          variant="ghost" size="icon"
          className="h-6 w-6 mr-1"
          onClick={(e) => onToggleFavorite(conv.id, !!conv.isFavorite, e)}
        >
          <Heart className={cn(
            "w-3.5 h-3.5 transition-colors",
            conv.isFavorite ? "fill-red-500 text-red-500" : "text-muted-foreground hover:text-red-500",
            pendingFavorite && "opacity-70",
          )} />
        </Button>
        
        {!isEditing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 text-muted-foreground hover:text-sidebar-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover border-border text-popover-foreground">
              <DropdownMenuItem onClick={(e) => onStartEdit(conv.id, conv.title, e)} className="hover:bg-accent cursor-pointer">
                <Edit2 className="w-4 h-4 mr-2" /> Rename
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="hover:bg-accent cursor-pointer">
                  <FolderPlus className="w-4 h-4 mr-2" /> Move to Project
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="bg-popover border-border text-popover-foreground">
                    <DropdownMenuItem onClick={(e) => onMoveToProject(conv.id, null, e)} className="hover:bg-accent cursor-pointer italic text-muted-foreground">
                      None
                    </DropdownMenuItem>
                    {projectList?.filter(p => p.isActive).map(p => (
                      <DropdownMenuItem key={p.id} onClick={(e) => onMoveToProject(conv.id, p.id, e)} className="hover:bg-accent cursor-pointer">
                        {p.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <DropdownMenuItem onClick={(e) => onDelete(conv.id, e)} className="text-destructive hover:bg-destructive/10 cursor-pointer">
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
});

export function Sidebar({ className, onClose, onDesktopClose }: { className?: string, onClose?: () => void, onDesktopClose?: () => void }) {
  const [location, setLocation] = useLocation();
  const { user, session, signOut } = useAuth();
  const { data: conversations, isLoading } = useListGeminiConversations();
  const deleteConversation = useDeleteGeminiConversation();
  const updateConversation = useUpdateGeminiConversation();
  const queryClient = useQueryClient();
  
  const [search, setSearch] = useState("");
  const [showFavorites, setShowFavorites] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [pendingFavoriteIds, setPendingFavoriteIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const authFetch = useCallback(async (url: string, options: RequestInit = {}) => {
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
  }, [session]);

  const { data: projectList } = useQuery({
    queryKey: ["admin-projects"],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/api/projects"));
      if (!res.ok) throw new Error("Failed to load projects");
      return res.json() as Promise<{id: string, name: string, isActive: boolean}[]>;
    },
  });

  const handleNewChat = () => {
    setLocation("/chat");
    if (onClose) onClose();
  };

  const handleLocationChange = useCallback((id: string) => {
    setLocation(`/chat/${id}`);
    if (onClose) onClose();
  }, [setLocation, onClose]);

  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    deleteConversation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGeminiConversationsQueryKey() });
        if (location === `/chat/${id}`) {
          setLocation("/chat");
        }
      }
    });
  }, [deleteConversation, queryClient, location, setLocation]);

  const startEdit = useCallback((id: string, title: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(id);
    setEditTitle(title);
  }, []);

  const saveEdit = useCallback((id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (editTitle.trim()) {
      updateConversation.mutate({ id, data: { title: editTitle } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListGeminiConversationsQueryKey() });
          setEditingId(null);
        }
      });
    } else {
      setEditingId(null);
    }
  }, [editTitle, updateConversation, queryClient]);

  const handleToggleFavorite = useCallback((id: string, currentStatus: boolean, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nextStatus = !currentStatus;

    queryClient.setQueryData(getListGeminiConversationsQueryKey(), (previous: any) => {
      if (!Array.isArray(previous)) return previous;
      return previous.map((conversation) =>
        conversation.id === id ? { ...conversation, isFavorite: nextStatus } : conversation,
      );
    });
    setPendingFavoriteIds((prev) => new Set(prev).add(id));

    authFetch(apiUrl(`/api/gemini/conversations/${id}/favorite`), {
      method: "PATCH",
      body: JSON.stringify({ isFavorite: nextStatus }),
    }).then(async (res) => {
      if (!res.ok) {
        queryClient.setQueryData(getListGeminiConversationsQueryKey(), (previous: any) => {
          if (!Array.isArray(previous)) return previous;
          return previous.map((conversation) =>
            conversation.id === id ? { ...conversation, isFavorite: currentStatus } : conversation,
          );
        });
      }
      await queryClient.refetchQueries({ queryKey: getListGeminiConversationsQueryKey() });
    }).finally(() => {
      setPendingFavoriteIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  }, [queryClient, authFetch]);

  const handleMoveToProject = useCallback((id: string, projectId: string | null, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    updateConversation.mutate({ id, data: { projectId } as any }, {
      onSuccess: () => {
        toast({ title: "Conversation moved successfully." });
        queryClient.invalidateQueries({ queryKey: getListGeminiConversationsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["admin-projects"] });
      },
      onError: () => {
        toast({ title: "Unable to move conversation.", variant: "destructive" });
      }
    });
  }, [updateConversation, queryClient, toast]);

  const cancelEdit = useCallback(() => setEditingId(null), []);

  const handleBack = useCallback(() => {
    if (location.startsWith('/chat/')) {
      setLocation('/');
    } else if (location.startsWith('/admin/projects/')) {
      setLocation('/admin/projects');
    } else {
      setLocation('/');
    }
    if (onClose) onClose();
  }, [location, setLocation, onClose]);

  const reloadSidebar = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const startTime = Date.now();
    console.log('SIDEBAR_REFRESH_START');
    
    try {
      await queryClient.refetchQueries();
      const duration = Date.now() - startTime;
      console.log(`SIDEBAR_REFRESH_SUCCESS\nDuration: ${duration} ms`);
    } catch (err) {
      const duration = Date.now() - startTime;
      console.error(`SIDEBAR_REFRESH_FAILED\nDuration: ${duration} ms`, err);
      toast({ title: "Unable to refresh. Please try again.", variant: "destructive" });
    } finally {
      setIsRefreshing(false);
    }
  };

  const typedConversations = conversations as Array<(NonNullable<typeof conversations>[number]) & { isFavorite?: boolean }> | undefined;

  const filteredConversations = useMemo(() => typedConversations?.filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(search.toLowerCase());
    const matchesFavorite = showFavorites ? c.isFavorite : true;
    return matchesSearch && matchesFavorite;
  }), [typedConversations, search, showFavorites]);

  return (
    <div className={cn("w-full md:w-64 bg-sidebar/95 backdrop-blur-xl border-r border-white/5 flex flex-col h-full shadow-[4px_0_24px_rgba(0,0,0,0.2)]", className)}>
      <div className="p-4 border-b border-sidebar-border space-y-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/logo.svg`} alt="Aria AI" className="w-6 h-6" />
            <span className="font-bold text-sidebar-foreground">Aria AI</span>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} className="text-muted-foreground hover:text-sidebar-foreground md:hidden">
              <X className="w-5 h-5" />
            </Button>
          )}
          {onDesktopClose && (
            <Button variant="ghost" size="icon" onClick={onDesktopClose} className="hidden text-muted-foreground hover:text-sidebar-foreground md:inline-flex" title="Close sidebar">
              <PanelLeftClose className="w-5 h-5" />
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleBack}
            className="w-10 h-10 bg-sidebar-accent hover:bg-sidebar-accent/80 border-border text-muted-foreground hover:text-sidebar-foreground shrink-0"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Button 
            onClick={handleNewChat}
            className="flex-1 justify-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 px-0 shadow-sm transition-all"
            variant="outline"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={isRefreshing}
            onClick={reloadSidebar}
            className="w-10 h-10 bg-sidebar-accent hover:bg-sidebar-accent/80 border-border text-muted-foreground hover:text-sidebar-foreground shrink-0"
            title="Refresh"
          >
            {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          </Button>
        </div>
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-12 h-9 bg-sidebar-accent/50 border-border text-sidebar-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-sidebar-ring"
            />
            <div className="absolute right-2 top-2 pointer-events-none hidden md:block">
              <kbd className="inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                <span className="text-xs">⌘</span>K
              </kbd>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowFavorites(!showFavorites)}
            className={cn("h-9 w-9 border border-border", showFavorites ? "bg-sidebar-accent text-red-500" : "bg-sidebar-accent/50 text-muted-foreground hover:text-sidebar-foreground")}
            title="Toggle Favorites"
          >
            <Heart className={cn("w-4 h-4", showFavorites && "fill-current")} />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-1 pr-4">
          {isLoading ? (
            <div className="text-sm text-muted-foreground p-2">Loading...</div>
          ) : filteredConversations?.length === 0 ? (
            <div className="text-sm text-muted-foreground p-2">No conversations</div>
          ) : (
            filteredConversations?.map((conv) => (
              <MemoizedConversationItem
                key={conv.id}
                conv={conv}
                isActive={location === `/chat/${conv.id}`}
                isEditing={editingId === conv.id}
                editTitle={editTitle}
                pendingFavorite={pendingFavoriteIds.has(conv.id)}
                projectList={projectList || []}
                onLocationChange={handleLocationChange}
                onSaveEdit={saveEdit}
                onCancelEdit={cancelEdit}
                onEditTitleChange={setEditTitle}
                onStartEdit={startEdit}
                onToggleFavorite={handleToggleFavorite}
                onMoveToProject={handleMoveToProject}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-white/5 bg-sidebar/50 mt-auto flex-shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start px-2 py-6 h-auto hover:bg-white/5 group">
              <div className="flex items-center gap-3 w-full">
                <Avatar className="h-8 w-8 ring-2 ring-white/10 shadow-sm transition-transform group-hover:scale-105">
                  <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email}`} />
                  <AvatarFallback className="bg-sidebar-accent">{user?.email?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left truncate">
                  <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.email}</p>
                </div>
                <MoreVertical className="w-4 h-4 text-muted-foreground opacity-50 group-hover:opacity-100" />
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[240px] bg-popover border-border text-popover-foreground mb-2">
            {user?.email === "rakesh837m@gmail.com" && (
              <DropdownMenuItem asChild className="cursor-pointer hover:bg-accent">
                <Link href="/admin/clarity" className="flex items-center gap-3 w-full">
                  <BarChart3 className="w-4 h-4" />
                  Admin Analytics
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild className="cursor-pointer hover:bg-accent">
              <Link href="/admin/projects" className="flex items-center gap-3 w-full">
                <FolderKanban className="w-4 h-4" />
                Projects
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer hover:bg-accent">
              <Link href="/services" className="flex items-center gap-3 w-full">
                <Heart className="w-4 h-4" />
                Connected Services
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer hover:bg-accent">
              <Link href="/settings" className="flex items-center gap-3 w-full">
                <Settings className="w-4 h-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => signOut()}
              className="cursor-pointer text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive mt-1 border-t border-border"
            >
              <LogOut className="w-4 h-4 mr-3" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
