import React, { memo, useCallback, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../contexts/AuthContext";
import { MessageSquare, Plus, Settings, LogOut, Search, Trash2, Edit2, MoreVertical, Check, X, FolderKanban, Heart, FolderPlus, RotateCcw, PanelLeftClose, ArrowLeft, Loader2, Shield, Globe } from "lucide-react";
import { useListGeminiConversations, useDeleteGeminiConversation, useUpdateGeminiConversation, getListGeminiConversationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { NovaBrand } from "@/components/ui/nova-brand";
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div
      className={cn(
        "group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-all duration-200 ease-out cursor-pointer mx-1 mb-1 min-w-0",
        isActive
          ? "bg-primary/15 text-primary font-medium shadow-2xs ring-1 ring-primary/20" 
          : "text-sidebar-foreground/70 hover:bg-foreground/5 hover:text-sidebar-foreground",
        isMenuOpen && "bg-foreground/5 text-sidebar-foreground"
      )}
      onClick={() => onLocationChange(conv.id)}
    >
      <MessageSquare className={cn(
        "w-4 h-4 shrink-0 transition-colors",
        isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
      )} />
      {isEditing ? (
        <div className="flex-1 min-w-0 flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <Input
            autoFocus
            value={editTitle}
            onChange={e => onEditTitleChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') onSaveEdit(conv.id);
              if (e.key === 'Escape') onCancelEdit();
            }}
            className="h-6 px-1.5 py-0 text-xs bg-sidebar-accent border-border text-sidebar-foreground"
            aria-label="Edit conversation title"
          />
          <Button variant="ghost" size="icon" aria-label="Save title" className="h-6 w-6 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 shrink-0" onClick={() => onSaveEdit(conv.id)}><Check className="w-3 h-3" /></Button>
          <Button variant="ghost" size="icon" aria-label="Cancel editing" className="h-6 w-6 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 shrink-0" onClick={onCancelEdit}><X className="w-3 h-3" /></Button>
        </div>
      ) : (
        <span
          className="flex-1 min-w-0 truncate select-none text-xs leading-normal pr-1"
          title={conv.title}
        >
          {conv.title}
        </span>
      )}

      {!isEditing && (
        <div
          className={cn(
            "flex items-center gap-0.5 shrink-0 transition-opacity duration-150 ml-auto",
            conv.isFavorite || isActive || isMenuOpen
              ? "opacity-100"
              : "opacity-75 md:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Favorite Toggle Button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={conv.isFavorite ? "Remove from favorites" : "Add to favorites"}
            title={conv.isFavorite ? "Remove from favorites" : "Add to favorites"}
            className={cn(
              "h-7 w-7 rounded-lg transition-colors flex items-center justify-center",
              conv.isFavorite
                ? "text-rose-500 hover:text-rose-400 hover:bg-rose-500/10"
                : "text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10",
              pendingFavorite && "opacity-50 cursor-wait",
              "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus:outline-none"
            )}
            onClick={(e) => onToggleFavorite(conv.id, !!conv.isFavorite, e)}
          >
            <Heart
              className={cn(
                "w-3.5 h-3.5 transition-transform active:scale-90",
                conv.isFavorite ? "fill-rose-500 text-rose-500" : "text-muted-foreground group-hover:text-rose-500"
              )}
            />
          </Button>

          {/* Three-Dot Menu */}
          <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Conversation actions"
                title="Conversation actions"
                className={cn(
                  "h-7 w-7 rounded-lg text-muted-foreground hover:text-sidebar-foreground hover:bg-foreground/10 transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus:outline-none",
                  isMenuOpen && "opacity-100 bg-foreground/10 text-sidebar-foreground"
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="bottom"
              sideOffset={6}
              className="w-48 bg-popover/95 backdrop-blur-xl border border-border/80 text-popover-foreground shadow-xl rounded-xl p-1 z-50 animate-in fade-in-0 zoom-in-95"
            >
              <DropdownMenuItem
                onClick={(e) => {
                  setIsMenuOpen(false);
                  onStartEdit(conv.id, conv.title, e);
                }}
                className="cursor-pointer rounded-lg text-xs py-2 px-2.5 hover:bg-accent focus:bg-accent flex items-center gap-2.5 transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Rename</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={(e) => {
                  setIsMenuOpen(false);
                  onToggleFavorite(conv.id, !!conv.isFavorite, e);
                }}
                className="cursor-pointer rounded-lg text-xs py-2 px-2.5 hover:bg-accent focus:bg-accent flex items-center gap-2.5 transition-colors"
              >
                <Heart
                  className={cn(
                    "w-3.5 h-3.5",
                    conv.isFavorite ? "fill-rose-500 text-rose-500" : "text-muted-foreground"
                  )}
                />
                <span>{conv.isFavorite ? "Remove from Favorites" : "Add to Favorites"}</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator className="my-1 bg-border/50" />

              <DropdownMenuItem
                onClick={(e) => {
                  setIsMenuOpen(false);
                  onDelete(conv.id, !!conv.isFavorite, e);
                }}
                className="cursor-pointer rounded-lg text-xs py-2 px-2.5 text-destructive hover:bg-destructive/10 focus:bg-destructive/10 focus:text-destructive flex items-center gap-2.5 transition-colors font-medium group"
              >
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                <span>Delete</span>
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
  const { user, dbUser, session, signOut, defaultLandingScreen } = useAuth();
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
          <Link href={defaultLandingScreen || "/projects"} onClick={() => onClose?.()} className="flex items-center px-1 group cursor-pointer transition-opacity hover:opacity-90">
            <NovaBrand variant="full" theme="dark" height={26} />
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
      <div className="px-3 py-2 space-y-1 border-b border-border/40">
        <Link
          href="/projects"
          onClick={() => onClose?.()}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150",
            location === "/projects" || location === "/"
              ? "bg-primary/10 text-primary font-bold shadow-2xs"
              : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-foreground/5"
          )}
        >
          <FolderKanban className="w-4 h-4 text-primary" />
          <span>Projects</span>
        </Link>

        <Link
          href="/chat"
          onClick={() => onClose?.()}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150",
            location.startsWith("/chat")
              ? "bg-primary/10 text-primary font-bold shadow-2xs"
              : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-foreground/5"
          )}
        >
          <MessageSquare className="w-4 h-4 text-primary" />
          <span>NOVA Chat</span>
        </Link>

        <Link
          href="/services"
          onClick={() => onClose?.()}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150",
            location.startsWith("/services")
              ? "bg-primary/10 text-primary font-bold shadow-2xs"
              : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-foreground/5"
          )}
        >
          <Globe className="w-4 h-4 text-primary" />
          <span>Connected Services</span>
        </Link>

        <Link
          href="/settings"
          onClick={() => onClose?.()}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150",
            location.startsWith("/settings")
              ? "bg-primary/10 text-primary font-bold shadow-2xs"
              : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-foreground/5"
          )}
        >
          <Settings className="w-4 h-4 text-primary" />
          <span>Settings</span>
        </Link>
      </div>

      {/* New Chat & Actions */}
      <div className="p-3 space-y-2 border-b border-border/40">
        <div className="flex gap-2">
          <Button 
            onClick={handleNewChat}
            className="flex-1 justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground h-9 rounded-xl font-semibold text-xs shadow-xs transition-all"
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
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setShowFavorites(!showFavorites)}
            aria-label={showFavorites ? "Favorites filter active. Click to show all conversations." : "Filter conversations by favorites"}
            aria-pressed={showFavorites}
            title={showFavorites ? "Favorites: Active (Click to show all)" : "Filter by Favorites"}
            className={cn(
              "relative h-8 w-8 shrink-0 rounded-lg flex items-center justify-center transition-all duration-200 border",
              showFavorites
                ? "bg-rose-500/15 border-rose-500/40 text-rose-400 hover:bg-rose-500/25 shadow-xs ring-1 ring-rose-500/30"
                : "bg-foreground/5 border-border/40 text-muted-foreground hover:text-foreground hover:bg-foreground/10 hover:border-border/60",
              "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar focus:outline-none"
            )}
          >
            <Heart
              className={cn(
                "w-4 h-4 transition-transform duration-200",
                showFavorites ? "fill-rose-500 text-rose-400 scale-105" : "text-muted-foreground/90 group-hover:text-foreground"
              )}
            />
            {showFavorites && (
              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500 ring-2 ring-sidebar" />
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Recent Conversations List Header */}
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 truncate">
            {showFavorites ? "Favorite Conversations" : "Recent Conversations"}
          </span>
          {showFavorites && (
            <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">
              Filtered
            </span>
          )}
        </div>
        {showFavorites && (
          <button
            type="button"
            onClick={() => setShowFavorites(false)}
            className="text-[11px] text-muted-foreground hover:text-rose-400 transition-colors flex items-center gap-1 shrink-0 ml-1"
            title="Clear favorites filter"
            aria-label="Clear favorites filter and show all conversations"
          >
            <span>Show all</span>
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      <ScrollArea className="flex-1 px-2 py-1">
        <div className="space-y-0.5">
          {isLoading ? (
            <div className="text-xs text-muted-foreground p-3 text-center">Loading chats...</div>
          ) : filteredConversations?.length === 0 ? (
            <div className="text-xs text-muted-foreground p-4 text-center space-y-1.5">
              {showFavorites ? (
                <>
                  <Heart className="w-5 h-5 text-muted-foreground/40 mx-auto" />
                  <p className="font-medium text-foreground/80">No favorite conversations</p>
                  <p className="text-[11px] text-muted-foreground/70">Click the heart on any conversation to add it here.</p>
                </>
              ) : search ? (
                <p>No conversations match &ldquo;{search}&rdquo;</p>
              ) : (
                <p>No chats found</p>
              )}
            </div>
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
                  <p className="text-xs font-semibold text-sidebar-foreground truncate leading-tight">
                    {user?.user_metadata?.full_name || (user?.email ? user.email.split('@')[0].charAt(0).toUpperCase() + user.email.split('@')[0].slice(1) : "User")}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate leading-tight">{user?.email}</p>
                </div>
                <MoreVertical className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-56 bg-popover border-border text-popover-foreground mb-1 rounded-2xl shadow-xl p-1.5 z-50">
            <div className="px-2.5 py-2 border-b border-border/50 mb-1">
              <p className="text-xs font-semibold text-foreground truncate">
                {user?.user_metadata?.full_name || (user?.email ? user.email.split('@')[0].charAt(0).toUpperCase() + user.email.split('@')[0].slice(1) : "User")}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
            </div>
            {dbUser?.role === "super_admin" && (
              <DropdownMenuItem 
                onClick={() => { setLocation("/admin/clarity"); onClose?.(); }}
                className="cursor-pointer rounded-xl text-xs py-2 hover:bg-accent focus:bg-accent text-amber-500 font-medium flex items-center gap-2.5 transition-colors"
              >
                <Shield className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Admin Console</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="my-1 bg-border/60" />
            <DropdownMenuItem 
              onClick={() => signOut()}
              className="cursor-pointer rounded-xl text-xs py-2 text-rose-500 hover:bg-rose-500/10 focus:bg-rose-500/10 focus:text-rose-600 flex items-center gap-2.5 transition-colors font-medium"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Sign Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

