import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../contexts/AuthContext";
import { MessageSquare, Plus, Settings, LogOut, Search, Trash2, Edit2, MoreVertical, Check, X, FolderKanban, Heart, FolderPlus, RotateCcw } from "lucide-react";
import { useListGeminiConversations, useCreateGeminiConversation, useDeleteGeminiConversation, useUpdateGeminiConversation, useToggleGeminiConversationFavorite, getListGeminiConversationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuPortal, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useCallback } from "react";
import { apiUrl } from "@/lib/api-url";

export function Sidebar({ className, onClose }: { className?: string, onClose?: () => void }) {
  const [location, setLocation] = useLocation();
  const { user, signOut } = useAuth();
  const { data: conversations, isLoading } = useListGeminiConversations();
  const createConversation = useCreateGeminiConversation();
  const deleteConversation = useDeleteGeminiConversation();
  const updateConversation = useUpdateGeminiConversation();
  const queryClient = useQueryClient();
  
  const [search, setSearch] = useState("");
  const [showFavorites, setShowFavorites] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const toggleFavorite = useToggleGeminiConversationFavorite();

  const authFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const token = user?.access_token || (window as any).session?.access_token;
    return fetch(url, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  }, [user]);

  const { data: projectList } = useQuery({
    queryKey: ["admin-projects"],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/api/projects"));
      if (!res.ok) throw new Error("Failed to load projects");
      return res.json() as Promise<{id: string, name: string, isActive: boolean}[]>;
    },
  });

  const handleNewChat = () => {
    createConversation.mutate(
      { data: { title: "New Chat", projectId: null } },
      {
        onSuccess: (newConv) => {
          queryClient.invalidateQueries({ queryKey: getListGeminiConversationsQueryKey() });
          setLocation(`/chat/${newConv.id}`);
          if (onClose) onClose();
        },
      }
    );
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
    toggleFavorite.mutate({ id, data: { isFavorite: !currentStatus } }, {
      onSuccess: () => {
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

  const filteredConversations = conversations?.filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(search.toLowerCase());
    const matchesFavorite = showFavorites ? c.isFavorite : true;
    return matchesSearch && matchesFavorite;
  });

  return (
    <div className={cn("w-full md:w-64 bg-sidebar border-r border-sidebar-border flex flex-col h-full", className)}>
      <div className="p-4 border-b border-sidebar-border space-y-4">
        <div className="flex items-center justify-between md:hidden mb-2">
          <div className="flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/logo.svg`} alt="Aria AI" className="w-6 h-6" />
            <span className="font-bold text-white">Aria AI</span>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} className="text-zinc-400 hover:text-white">
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={handleNewChat}
            className="flex-1 justify-start gap-2 bg-white/5 hover:bg-white/10 text-white border border-white/10"
            variant="outline"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => queryClient.invalidateQueries({ queryKey: getListGeminiConversationsQueryKey() })}
            className="w-10 h-10 bg-white/5 hover:bg-white/10 border-white/10 text-zinc-400 hover:text-white shrink-0"
            title="Reload chats"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
            <Input 
              placeholder="Search..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-black/50 border-white/10 text-white placeholder:text-zinc-500" 
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowFavorites(!showFavorites)}
            className={cn("h-10 w-10 border border-white/10 shrink-0", showFavorites ? "bg-red-500/20 text-red-500 hover:text-red-400 hover:bg-red-500/30" : "bg-black/50 text-zinc-400 hover:text-white")}
          >
            <Heart className={cn("w-5 h-5", showFavorites && "fill-current")} />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-1">
          {isLoading ? (
            <div className="text-sm text-muted-foreground p-2">Loading...</div>
          ) : filteredConversations?.length === 0 ? (
            <div className="text-sm text-muted-foreground p-2">No conversations</div>
          ) : (
            filteredConversations?.map((conv) => {
              const isActive = location === `/chat/${conv.id}` || (location === "/chat" && conversations?.[0]?.id === conv.id);
              return (
                <Link key={conv.id} href={`/chat/${conv.id}`}>
                  <div 
                    onClick={() => onClose && onClose()}
                    className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer group relative",
                    isActive ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"
                  )}>
                    <MessageSquare className="w-4 h-4 opacity-70 flex-shrink-0" />
                    
                    {editingId === conv.id ? (
                      <div className="flex-1 flex items-center gap-1" onClick={e => e.preventDefault()}>
                        <input 
                          autoFocus
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveEdit(conv.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="flex-1 bg-black/50 border border-primary/50 rounded px-1 text-white text-sm focus:outline-none"
                        />
                        <button onClick={(e) => saveEdit(conv.id, e)} className="text-green-400 hover:text-green-300">
                          <Check className="w-3 h-3" />
                        </button>
                        <button onClick={(e) => { e.preventDefault(); setEditingId(null); }} className="text-zinc-400 hover:text-white">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="truncate flex-1">{conv.title}</span>
                        <div className="flex items-center gap-1 absolute right-2 bg-sidebar pl-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={(e) => handleToggleFavorite(conv.id, !!conv.isFavorite, e)} 
                            className={cn("h-6 w-6", conv.isFavorite ? "text-red-500 hover:text-red-400" : "text-zinc-400 hover:text-white")}
                          >
                            <Heart className={cn("h-3 w-3", conv.isFavorite && "fill-current")} />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white">
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-popover border-white/10 text-white">
                              <DropdownMenuItem onClick={(e) => startEdit(conv.id, conv.title, e)} className="hover:bg-white/10 cursor-pointer">
                                <Edit2 className="w-4 h-4 mr-2" /> Rename
                              </DropdownMenuItem>
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger className="hover:bg-white/10 cursor-pointer">
                                  <FolderPlus className="w-4 h-4 mr-2" /> Move to Project
                                </DropdownMenuSubTrigger>
                                <DropdownMenuPortal>
                                  <DropdownMenuSubContent className="bg-popover border-white/10 text-white">
                                    <DropdownMenuItem onClick={(e) => handleMoveToProject(conv.id, null, e)} className="hover:bg-white/10 cursor-pointer italic text-zinc-400">
                                      None
                                    </DropdownMenuItem>
                                    {projectList?.filter(p => p.isActive).map(p => (
                                      <DropdownMenuItem key={p.id} onClick={(e) => handleMoveToProject(conv.id, p.id, e)} className="hover:bg-white/10 cursor-pointer">
                                        {p.name}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuSubContent>
                                </DropdownMenuPortal>
                              </DropdownMenuSub>
                              <DropdownMenuItem onClick={(e) => handleDelete(conv.id, e)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer">
                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </>
                    )}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-sidebar-border">
        <div className="flex flex-col gap-1">
          <Link href="/profile">
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-white/5 hover:text-white transition-colors cursor-pointer" onClick={() => onClose && onClose()}>
              <Avatar className="w-6 h-6 border border-white/10">
                <AvatarImage src={user?.user_metadata?.avatar_url} />
                <AvatarFallback className="bg-primary/20 text-primary text-xs">
                  {user?.email?.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="truncate flex-1">{user?.email || 'User'}</span>
            </div>
          </Link>
          <Link href="/admin/projects">
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-white/5 hover:text-white transition-colors cursor-pointer" onClick={() => onClose && onClose()}>
              <FolderKanban className="w-4 h-4 opacity-70" />
              <span>Projects</span>
            </div>
          </Link>
          <Link href="/settings">
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-white/5 hover:text-white transition-colors cursor-pointer" onClick={() => onClose && onClose()}>
              <Settings className="w-4 h-4 opacity-70" />
              <span>Settings</span>
            </div>
          </Link>
          <div 
            onClick={() => signOut()}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 opacity-70" />
            <span>Log out</span>
          </div>
        </div>
      </div>
    </div>
  );
}
