import React, { memo, useCallback, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../contexts/AuthContext";
import { MessageSquare, Plus, Settings, LogOut, Search, Trash2, Edit2, MoreVertical, Check, X, FolderKanban, Heart, FolderPlus, RotateCcw, PanelLeftClose, ArrowLeft, Loader2, BarChart3, Shield, CreditCard } from "lucide-react";
import { useListGeminiConversations, useDeleteGeminiConversation, useUpdateGeminiConversation, getListGeminiConversationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuPortal, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
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
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-300 ease-out cursor-pointer mx-2 mb-1",
        isActive
          ? "bg-gradient-to-r from-primary/20 to-primary/5 text-primary font-medium shadow-sm ring-1 ring-primary/30" 
          : "text-sidebar-foreground/70 hover:bg-foreground/5 hover:text-sidebar-foreground"
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
      
      {/* Always-visible favorite indicator */}
      {conv.isFavorite && !isEditing && (
        <Button
          variant="ghost" size="icon"
          className="h-6 w-6 shrink-0 group-hover:hidden"
          onClick={(e) => onToggleFavorite(conv.id, true, e)}
          title="Remove from favorites"
        >
          <Heart className="w-3.5 h-3.5 fill-red-500 text-red-500" />
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
              conv.isFavorite ? "fill-red-500 text-red-500" : "text-muted-foreground hover:text-red-500",
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

    // Optimistically remove from cache
    queryClient.setQueryData(getListGeminiConversationsQueryKey(), (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.filter((conv: any) => conv.id !== id);
    });

    deleteConversation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Conversation deleted successfully." });
        // Handle redirect if currently active conversation was deleted
        if (location === `/chat/${id}`) {
          setLocation("/chat");
        }
      },
      onError: () => {
        toast({ title: "Unable to delete the conversation.", description: "Please try again.", variant: "destructive" });
        queryClient.invalidateQueries({ queryKey: getListGeminiConversationsQueryKey() }); // Restore if failed
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
      setLocation('/');
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
    <div className={cn("w-full md:w-64 bg-sidebar backdrop-blur-2xl border-r border-sidebar-border flex flex-col h-full shadow-[8px_0_32px_rgba(0,0,0,0.5)] z-20", className)}>
      <div className="p-4 space-y-4 border-b border-foreground/[0.05]">
        {/* Logo and window controls */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3 px-1">
            <div className="bg-gradient-to-br from-primary/40 to-primary/10 p-1.5 rounded-lg border border-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.2)]">
               <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/logo.svg`} alt="RAGHUB" className="w-5 h-5" />
            </div>
            <span className="font-bold text-lg bg-clip-text text-transparent bg-gradient-to-r from-sidebar-foreground to-sidebar-foreground/70">RAGHUB</span>
          </div>
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

        {/* Primary Actions */}
        <div className="flex gap-2">
          <Button 
            onClick={handleNewChat}
            className="flex-1 justify-center gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary shadow-[0_0_20px_rgba(var(--primary),0.3)] text-primary-foreground border-0 h-10 rounded-xl font-medium transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={isRefreshing}
            onClick={reloadSidebar}
            className="w-10 h-10 rounded-xl bg-foreground/5 hover:bg-foreground/10 border-foreground/5 text-muted-foreground hover:text-foreground shrink-0 transition-all duration-300"
            title="Refresh"
          >
            {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          </Button>
        </div>

        {/* Search and Secondary Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleBack}
            className="w-9 h-9 rounded-lg bg-transparent border-0 hover:bg-foreground/5 text-muted-foreground hover:text-foreground shrink-0 transition-colors"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="relative flex-1 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <Input 
              placeholder="Search..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-8 h-9 rounded-lg bg-foreground/5 border-transparent hover:bg-foreground/10 focus:bg-foreground/10 focus:border-primary/30 text-sm text-foreground placeholder:text-muted-foreground/70 transition-all duration-300 focus-visible:ring-0"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowFavorites(!showFavorites)}
            className={cn("h-9 w-9 rounded-lg transition-all duration-300 border border-transparent", showFavorites ? "bg-red-500/10 text-red-500 hover:bg-red-500/20" : "bg-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground")}
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

      <div className="p-3 mt-auto flex-shrink-0 bg-gradient-to-t from-background/80 to-transparent">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start px-3 py-6 h-auto rounded-xl hover:bg-foreground/10 transition-all duration-300 group border border-transparent hover:border-foreground/5 shadow-sm hover:shadow-md">
              <div className="flex items-center gap-3 w-full">
                <Avatar className="h-9 w-9 ring-2 ring-foreground/10 shadow-lg transition-transform duration-300 group-hover:scale-105 group-hover:ring-primary/30">
                  <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email}`} />
                  <AvatarFallback className="bg-primary/20 text-primary">{user?.email?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left truncate flex flex-col justify-center">
                  <p className="text-sm font-semibold text-foreground truncate">{user?.email?.split('@')[0] || user?.email}</p>
                </div>
                <div className="bg-foreground/5 rounded-full p-1 transition-opacity duration-300">
                  <MoreVertical className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[240px] bg-popover backdrop-blur-xl border-border text-popover-foreground mb-2 rounded-xl shadow-2xl p-1">
            {dbUser?.role === "super_admin" && (
              <DropdownMenuItem asChild className="cursor-pointer hover:bg-foreground/10 rounded-lg my-0.5 transition-colors">
                <Link href="/admin/clarity" className="flex items-center gap-3 w-full py-2">
                  <Shield className="w-4 h-4 text-primary" />
                  Admin Console
                </Link>
              </DropdownMenuItem>
            )}

            <DropdownMenuItem asChild className="cursor-pointer hover:bg-foreground/10 rounded-lg my-0.5 transition-colors">
              <Link href="/projects" className="flex items-center gap-3 w-full py-2">
                <FolderKanban className="w-4 h-4 text-blue-400" />
                Projects
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer hover:bg-foreground/10 rounded-lg my-0.5 transition-colors">
              <Link href="/services" className="flex items-center gap-3 w-full py-2">
                <Heart className="w-4 h-4 text-pink-400" />
                Connected Services
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer hover:bg-foreground/10 rounded-lg my-0.5 transition-colors">
              <Link href="/billing" className="flex items-center gap-3 w-full py-2">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                Billing & Subscription
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer hover:bg-foreground/10 rounded-lg my-0.5 transition-colors">
              <Link href="/settings" className="flex items-center gap-3 w-full py-2">
                <Settings className="w-4 h-4 text-gray-400" />
                Settings
              </Link>
            </DropdownMenuItem>
            <div className="h-px bg-foreground/10 my-1 mx-2" />
            <DropdownMenuItem 
              onClick={() => signOut()}
              className="cursor-pointer text-red-400 hover:bg-red-500/10 hover:text-red-300 focus:bg-red-500/10 focus:text-red-300 rounded-lg my-0.5 transition-colors"
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
