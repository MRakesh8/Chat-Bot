import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../contexts/AuthContext";
import { MessageSquare, Plus, Settings, LogOut, Search, Trash2, Edit2, MoreVertical, Check, X, FolderKanban, Heart, FolderPlus, RotateCcw, PanelLeftClose } from "lucide-react";
import { useListGeminiConversations, useDeleteGeminiConversation, useUpdateGeminiConversation, getListGeminiConversationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuPortal, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useCallback } from "react";
import { apiUrl } from "@/lib/api-url";

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

  const handleDelete = (id: string, e: React.MouseEvent) => {
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
  };

  const startEdit = (id: string, title: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(id);
    setEditTitle(title);
  };

  const saveEdit = (id: string, e?: React.MouseEvent) => {
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
  };

  const handleToggleFavorite = (id: string, currentStatus: boolean, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    authFetch(apiUrl(`/api/gemini/conversations/${id}/favorite`), {
      method: "PATCH",
      body: JSON.stringify({ isFavorite: !currentStatus }),
    }).then((res) => {
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: getListGeminiConversationsQueryKey() });
      }
    });
  };

  const handleMoveToProject = (id: string, projectId: string | null, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    updateConversation.mutate({ id, data: { title: undefined, projectId } as any }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGeminiConversationsQueryKey() });
      }
    });
  };

  const typedConversations = conversations as Array<(NonNullable<typeof conversations>[number]) & { isFavorite?: boolean }> | undefined;

  const filteredConversations = typedConversations?.filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(search.toLowerCase());
    const matchesFavorite = showFavorites ? c.isFavorite : true;
    return matchesSearch && matchesFavorite;
  });

  return (
    <div className={cn("w-full md:w-64 bg-sidebar border-r border-sidebar-border flex flex-col h-full", className)}>
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
            onClick={handleNewChat}
            className="flex-1 justify-start gap-2 bg-sidebar-accent hover:bg-sidebar-accent/80 text-sidebar-foreground border border-border"
            variant="outline"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => queryClient.invalidateQueries({ queryKey: getListGeminiConversationsQueryKey() })}
            className="w-10 h-10 bg-sidebar-accent hover:bg-sidebar-accent/80 border-border text-muted-foreground hover:text-sidebar-foreground shrink-0"
            title="Reload chats"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 bg-sidebar-accent/50 border-border text-sidebar-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-sidebar-ring"
            />
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
              <div
                key={conv.id}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer",
                  location === `/chat/${conv.id}` 
                    ? "bg-sidebar-accent text-sidebar-foreground" 
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
                onClick={() => { setLocation(`/chat/${conv.id}`); if (onClose) onClose(); }}
              >
                <MessageSquare className="w-4 h-4 flex-shrink-0" />
                {editingId === conv.id ? (
                  <div className="flex-1 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <Input
                      autoFocus
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveEdit(conv.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="h-6 px-1.5 py-0 bg-sidebar-accent border-border text-sidebar-foreground"
                    />
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-green-500" onClick={() => saveEdit(conv.id)}><Check className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => setEditingId(null)}><X className="w-3 h-3" /></Button>
                  </div>
                ) : (
                  <span className="flex-1 truncate select-none">{conv.title}</span>
                )}
                
                <div className={cn(
                  "flex items-center transition-opacity",
                  location === `/chat/${conv.id}` || conv.isFavorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}>
                  <Button
                    variant="ghost" size="icon"
                    className="h-6 w-6 mr-1"
                    onClick={(e) => handleToggleFavorite(conv.id, !!conv.isFavorite, e)}
                  >
                    <Heart className={cn("w-3.5 h-3.5", conv.isFavorite ? "fill-red-500 text-red-500" : "text-muted-foreground hover:text-red-500")} />
                  </Button>
                  
                  {editingId !== conv.id && (
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
                        <DropdownMenuItem onClick={(e) => startEdit(conv.id, conv.title, e)} className="hover:bg-accent cursor-pointer">
                          <Edit2 className="w-4 h-4 mr-2" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className="hover:bg-accent cursor-pointer">
                            <FolderPlus className="w-4 h-4 mr-2" /> Move to Project
                          </DropdownMenuSubTrigger>
                          <DropdownMenuPortal>
                            <DropdownMenuSubContent className="bg-popover border-border text-popover-foreground">
                              <DropdownMenuItem onClick={(e) => handleMoveToProject(conv.id, null, e)} className="hover:bg-accent cursor-pointer italic text-muted-foreground">
                                None
                              </DropdownMenuItem>
                              {projectList?.filter(p => p.isActive).map(p => (
                                <DropdownMenuItem key={p.id} onClick={(e) => handleMoveToProject(conv.id, p.id, e)} className="hover:bg-accent cursor-pointer">
                                  {p.name}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuPortal>
                        </DropdownMenuSub>
                        <DropdownMenuItem onClick={(e) => handleDelete(conv.id, e)} className="text-destructive hover:bg-destructive/10 cursor-pointer">
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-border bg-sidebar mt-auto flex-shrink-0">
        <div className="flex items-center gap-3 mb-4 px-2">
          <Avatar className="h-8 w-8 ring-1 ring-border">
            <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email}`} />
            <AvatarFallback className="bg-sidebar-accent">{user?.email?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 truncate">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.email}</p>
          </div>
        </div>
        
        <div className="space-y-1">
          <Link href="/admin/projects" className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground rounded-lg transition-colors">
            <FolderKanban className="w-4 h-4" />
            Projects
          </Link>
          <Link href="/settings" className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground rounded-lg transition-colors">
            <Settings className="w-4 h-4" />
            Settings
          </Link>
          <button 
            onClick={() => signOut()}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
