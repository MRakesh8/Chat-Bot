import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../contexts/AuthContext";
import { MessageSquare, Plus, Settings, LogOut, Search, Trash2, Edit2, MoreVertical, Check, X, FolderKanban } from "lucide-react";
import { useListGeminiConversations, useCreateGeminiConversation, useDeleteGeminiConversation, useUpdateGeminiConversation, getListGeminiConversationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function Sidebar({ className, onClose }: { className?: string, onClose?: () => void }) {
  const [location, setLocation] = useLocation();
  const { user, signOut } = useAuth();
  const { data: conversations, isLoading } = useListGeminiConversations();
  const createConversation = useCreateGeminiConversation();
  const deleteConversation = useDeleteGeminiConversation();
  const updateConversation = useUpdateGeminiConversation();
  const queryClient = useQueryClient();
  
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

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

  const filteredConversations = conversations?.filter(c => c.title.toLowerCase().includes(search.toLowerCase()));

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
        <Button 
          onClick={handleNewChat}
          className="w-full justify-start gap-2 bg-white/5 hover:bg-white/10 text-white border border-white/10"
          variant="outline"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </Button>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
          <Input 
            placeholder="Search..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-black/50 border-white/10 text-white placeholder:text-zinc-500" 
          />
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
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 absolute right-2 bg-sidebar md:bg-transparent pl-2">
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
