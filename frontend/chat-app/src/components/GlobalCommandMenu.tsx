import * as React from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Folder, MessageSquare, Settings, Search, Sparkle } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { apiUrl } from "@/lib/api-url";
import { useAuth } from "@/contexts/AuthContext";

export function GlobalCommandMenu() {
  const [open, setOpen] = React.useState(false);
  const [, setLocation] = useLocation();
  const { session } = useAuth();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const authFetch = React.useCallback(
    async (url: string) => {
      const token = session?.access_token;
      return fetch(url, {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    },
    [session]
  );

  const { data: projects } = useQuery({
    queryKey: ["command-menu-projects"],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/api/projects"));
      if (!res.ok) return [];
      return res.json() as Promise<{ id: string; name: string }[]>;
    },
    enabled: !!session,
  });

  const { data: chats } = useQuery({
    queryKey: ["command-menu-chats"],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/api/gemini/conversations"));
      if (!res.ok) return [];
      return res.json() as Promise<{ id: string; title: string }[]>;
    },
    enabled: !!session,
  });

  const runCommand = React.useCallback((command: () => unknown) => {
    setOpen(false);
    command();
  }, []);

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          
          <CommandGroup heading="Projects">
            {projects?.map((project) => (
              <CommandItem
                key={project.id}
                onSelect={() => runCommand(() => setLocation(`/admin/projects/${project.id}/edit`))}
              >
                <Folder className="mr-2 h-4 w-4" />
                <span>{project.name}</span>
              </CommandItem>
            ))}
            <CommandItem onSelect={() => runCommand(() => setLocation("/admin/projects/new"))}>
              <Sparkle className="mr-2 h-4 w-4" />
              <span>Create New Project</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Recent Chats">
            {chats?.slice(0, 5).map((chat) => (
              <CommandItem
                key={chat.id}
                onSelect={() => runCommand(() => setLocation(`/chat/${chat.id}`))}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                <span>{chat.title}</span>
              </CommandItem>
            ))}
            <CommandItem onSelect={() => runCommand(() => setLocation("/"))}>
              <MessageSquare className="mr-2 h-4 w-4" />
              <span>New Chat</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Settings">
            <CommandItem onSelect={() => runCommand(() => setLocation("/settings"))}>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
