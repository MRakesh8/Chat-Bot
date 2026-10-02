import React, { memo, useCallback, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../contexts/AuthContext";
import { MessageSquare, Plus, Settings, LogOut, Search, Trash2, Edit2, MoreVertical, Check, X, FolderKanban, Heart, FolderPlus, RotateCcw, PanelLeftClose, ArrowLeft, Loader2, Shield, User } from "lucide-react";
import { useListGeminiConversations, useDeleteGeminiConversation, useUpdateGeminiConversation, getListGeminiConversationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
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
  onDelete: (id: string, isFavorite: boolean, e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-300 ease-out cursor-pointer mx-1 mb-1",
        isActive
          ? "bg-primary/15 text-primary font-medium shadow-2xs ring-1 ring-primary/20" 
          : "text-sidebar-foreground/70 hover:bg-foreground/5 hover:text-sidebar-foreground"
      )}
      onClick={() => onLocationChange(conv.id)}
    >
      <MessageSquare className="w-4 h-4 flex-shrink-0 text-muted-foreground group-hover:text-foreground" />
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
          <Button variant="ghost" size="icon" className="h-6 w-6 text-emerald-500" onClick={() => onSaveEdit(conv.id)}><Check className="w-3 h-3" /></Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-rose-500" onClick={onCancelEdit}><X className="w-3 h-3" /></Button>
        </div>
      ) : (
        <span className="flex-1 truncate select-none text-xs leading-relaxed">{conv.title}</span>
      )}
      
      {/* Always-visible favorite indicator */}
      {conv.isFavorite && !isEditing && (
        <Button
          variant="ghost" size="icon"
          className="h-6 w-6 shrink-0 group-hover:hidden"
          onClick={(e) => onToggleFavorite(conv.id, true, e)}
          title="Remove from favorites"
        >
          <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
        </Button>
      )}

      {!isEditing && (
        <div className={cn(
          "flex items-center gap-0.5 transition-all duration-200 shrink-0",
          conv.isFavorite ? "opacity-0 group-hover:opacity-100" : "opacity-0 group-hover:opacity-100",
          isActive && "opacity-100" // Always show for active conversation
        )}>
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6"
            onClick={(e) => onToggleFavorite(conv.id, !!conv.isFavorite, e)}
            title={conv.isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Heart className={cn(
              "w-3.5 h-3.5 transition-colors",
              conv.isFavorite ? "fill-rose-500 text-rose-500" : "text-muted-foreground hover:text-rose-500",
              pendingFavorite && "opacity-70",
            )} />
          </Button>
          
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
              <DropdownMenuItem onClick={(e) => onDelete(conv.id, !!conv.isFavorite, e)} className="text-destructive focus:bg-destructive focus:text-destructive-foreground hover:bg-destructive/10 hover:text-destructive cursor-pointer transition-colors group">
                <Trash2 className="w-4 h-4 mr-2 group-hover:text-destructive group-focus:text-destructive-foreground" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
});


export function Sidebar({ className, onClose, onDesktopClose }: { className?: string, onClose?: () => void, onDesktopClose?: () => void }) {
  const [location, setLocation] = useLocation();
  const { user, dbUser, session, signOut } = useAuth();
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

  const [conversationToDelete, setConversationToDelete] = useState<{ id: string, isFavorite?: boolean } | null>(null);

  const confirmDelete = useCallback(() => {
    if (!conversationToDelete) return;
    const { id, isFavorite } = conversationToDelete;
    
    if (isFavorite) {
      toast({
        title: "This conversation is marked as a favorite.",
        description: "To delete it, please remove it from Favorites first and then try again.",
        variant: "destructive"
      });
      setConversationToDelete(null);
      return;
    }

    queryClient.setQueryData(getListGeminiConversationsQueryKey(), (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.filter((conv: any) => conv.id !== id);
    });

    deleteConversation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Conversation deleted successfully." });
        if (location === `/chat/${id}`) {
          setLocation("/chat");
        }
      },
      onError: () => {
        toast({ title: "Unable to delete the conversation.", description: "Please try again.", variant: "destructive" });
        queryClient.invalidateQueries({ queryKey: getListGeminiConversationsQueryKey() });
      }
    });

    setConversationToDelete(null);
  }, [conversationToDelete, deleteConversation, queryClient, location, setLocation, toast]);

  const handleDeleteRequest = useCallback((id: string, isFavorite: boolean, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isFavorite) {
      toast({
        title: "This conversation is marked as a favorite.",
        description: "To delete it, please remove it from Favorites first and then try again.",
        variant: "destructive"
      });
      return;
    }

    setConversationToDelete({ id, isFavorite });
  }, [toast]);

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
      setLocation('/chat');
    } else if (location.startsWith('/projects/') || location.startsWith('/admin/projects/')) {
      setLocation('/projects');
    } else {
      setLocation('/');
    }
    if (onClose) onClose();
  }, [location, setLocation, onClose]);

  const reloadSidebar = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const startTime = Date.now();
    try {
      await queryClient.refetchQueries();
    } catch (err) {
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
    <div className={cn("w-full md:w-64 bg-sidebar backdrop-blur-2xl border-r border-sidebar-border/80 flex flex-col h-full shadow-[4px_0_24px_rgba(0,0,0,0.2)] z-20", className)}>
      {/* Brand Header */}
      <div className="p-4 border-b border-border/40">
        <div className="flex items-center justify-between">
          <Link href="/chat" onClick={() => onClose?.()} className="flex items-center gap-2.5 px-1 group cursor-pointer">
            <div className="bg-primary/10 p-1.5 rounded-xl border border-primary/20 shadow-xs flex items-center justify-center transition-transform group-hover:scale-105">
               <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/logo.svg`} alt="NOVA Business AI" className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm text-sidebar-foreground tracking-tight flex items-center gap-1">
                NOVA <span className="text-primary text-xs font-semibold">AI</span>
              </span>
              <span className="text-[10px] text-muted-foreground leading-none font-medium">Business Agent</span>
            </div>
          </Link>
          <div className="flex items-center gap-1">
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground md:hidden transition-colors">
                <X className="w-4 h-4" />
              </Button>
            )}
            {onDesktopClose && (
              <Button variant="ghost" size="icon" onClick={onDesktopClose} className="hidden h-8 w-8 rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground md:inline-flex transition-colors" title="Close sidebar">
                <PanelLeftClose className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Primary Navigation Section */}
      <div className="px-3 py-2 space-y-0.5 border-b border-border/40">
        <Link
          href="/chat"
          onClick={() => onClose?.()}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200",
            location === "/" || location.startsWith("/chat")
              ? "bg-primary/15 text-primary shadow-2xs"
              : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-foreground/5"
          )}
        >
          <MessageSquare className="w-4 h-4 text-primary" />
          <span>Chat</span>
        </Link>

        <Link
          href="/projects"
          onClick={() => onClose?.()}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200",
            location.startsWith("/projects")
              ? "bg-primary/15 text-primary shadow-2xs"
              : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-foreground/5"
          )}
        >
          <FolderKanban className="w-4 h-4 text-blue-400" />
          <span>Projects</span>
        </Link>

        <Link
          href="/services"
          onClick={() => onClose?.()}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200",
            location.startsWith("/services")
              ? "bg-primary/15 text-primary shadow-2xs"
              : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-foreground/5"
          )}
        >
          <Heart className="w-4 h-4 text-pink-400" />
          <span>Connected Services</span>
        </Link>

        <Link
          href="/settings"
          onClick={() => onClose?.()}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200",
            location.startsWith("/settings")
              ? "bg-primary/15 text-primary shadow-2xs"
              : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-foreground/5"
          )}
        >
          <Settings className="w-4 h-4 text-slate-400" />
          <span>Settings</span>
        </Link>
      </div>

      {/* New Chat & Actions */}
      <div className="p-3 space-y-2 border-b border-border/40">
        <div className="flex gap-2">
          <Button 
            onClick={handleNewChat}
            className="flex-1 justify-center gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary text-primary-foreground border-0 h-9 rounded-xl font-medium text-xs shadow-sm transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
          >
            <Plus className="w-3.5 h-3.5" />
            New Chat
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={isRefreshing}
            onClick={reloadSidebar}
            className="w-9 h-9 rounded-xl bg-foreground/5 hover:bg-foreground/10 border-border/40 text-muted-foreground hover:text-foreground shrink-0 transition-all duration-200"
            title="Refresh"
          >
            {isRefreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
          </Button>
        </div>

        {/* Search and Secondary Actions */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 group">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <Input 
              placeholder="Search chats..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 h-8 text-xs rounded-lg bg-foreground/5 border-transparent hover:bg-foreground/10 focus:bg-foreground/10 focus:border-primary/30 text-foreground placeholder:text-muted-foreground/70 transition-all duration-200 focus-visible:ring-0"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowFavorites(!showFavorites)}
            className={cn("h-8 w-8 rounded-lg transition-all duration-200 border border-transparent", showFavorites ? "bg-rose-500/10 text-rose-500 hover:bg-rose-500/20" : "bg-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground")}
            title="Toggle Favorites"
          >
            <Heart className={cn("w-3.5 h-3.5", showFavorites && "fill-current")} />
          </Button>
        </div>
      </div>

      {/* Recent Conversations List */}
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Recent Conversations</span>
      </div>
      <ScrollArea className="flex-1 px-2 py-1">
        <div className="space-y-0.5">
          {isLoading ? (
            <div className="text-xs text-muted-foreground p-3 text-center">Loading chats...</div>
          ) : filteredConversations?.length === 0 ? (
            <div className="text-xs text-muted-foreground p-3 text-center">No chats found</div>
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
                onDelete={handleDeleteRequest}
              />
            ))
          )}
        </div>
      </ScrollArea>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!conversationToDelete} onOpenChange={(open) => !open && setConversationToDelete(null)}>
        <AlertDialogContent className="bg-popover border-border text-popover-foreground sm:max-w-[425px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete this conversation?
              <br/><br/>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="hover:bg-accent border-border text-foreground">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Compact Account Footer */}
      <div className="p-3 mt-auto flex-shrink-0 border-t border-border/40 bg-sidebar/50">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              aria-label="User Account Menu"
              className="w-full justify-start px-2 py-2 h-auto rounded-xl hover:bg-foreground/5 transition-all duration-200 group border border-transparent hover:border-border/40 focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <div className="flex items-center gap-2.5 w-full min-w-0">
                <Avatar className="h-8 w-8 ring-1 ring-border shadow-xs shrink-0">
                  <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email}`} />
                  <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">{user?.email?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left truncate flex flex-col justify-center min-w-0">
                  <p className="text-xs font-semibold text-sidebar-foreground truncate leading-tight">{user?.email?.split('@')[0] || user?.email}</p>
                  <p className="text-[10px] text-muted-foreground truncate leading-tight">{user?.email}</p>
                </div>
                <MoreVertical className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-48 bg-popover border-border text-popover-foreground mb-1 rounded-xl shadow-xl p-1 z-50">
            <div className="px-2.5 py-1.5 border-b border-border/50 mb-1">
              <p className="text-xs font-semibold text-foreground truncate">{user?.email?.split('@')[0] || user?.email}</p>
              <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
            </div>
            <DropdownMenuItem 
              onClick={() => signOut()}
              className="cursor-pointer text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 focus:bg-rose-500/10 focus:text-rose-600 rounded-lg py-1.5 text-xs transition-colors font-medium flex items-center gap-2"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

