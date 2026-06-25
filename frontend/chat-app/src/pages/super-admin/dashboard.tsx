import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiUrl } from "@/lib/api-url";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Users, LayoutDashboard, Shield, FolderOpen } from "lucide-react";
import { useLocation } from "wouter";

function useAuthFetch() {
  const { session } = useAuth();
  return async (url: string, options: RequestInit = {}) => {
    const token = session?.access_token;
    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  };
}

export default function SuperAdminDashboard() {
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["super-admin-users"],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/api/super-admin/users"));
      if (!res.ok) throw new Error("Failed to load users");
      return res.json() as Promise<any[]>;
    },
  });

  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ["super-admin-projects"],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/api/super-admin/projects"));
      if (!res.ok) throw new Error("Failed to load projects");
      return res.json() as Promise<any[]>;
    },
  });

  const updateFeaturesMutation = useMutation({
    mutationFn: async ({ id, features }: { id: string; features: any }) => {
      const res = await authFetch(apiUrl(`/api/super-admin/users/${id}`), {
        method: "PATCH",
        body: JSON.stringify({ features }),
      });
      if (!res.ok) throw new Error("Failed to update features");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-users"] });
      toast({ title: "Features updated successfully" });
    },
    onError: () => toast({ title: "Failed to update features", variant: "destructive" }),
  });

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Shield className="w-10 h-10 text-primary" />
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Super Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">Manage all platform users, roles, and feature gates.</p>
        </div>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="mb-8 h-12">
          <TabsTrigger value="users" className="px-6 gap-2">
            <Users className="w-4 h-4" /> Users
          </TabsTrigger>
          <TabsTrigger value="projects" className="px-6 gap-2">
            <LayoutDashboard className="w-4 h-4" /> Global Projects
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          {usersLoading ? (
            <div className="flex justify-center p-12"><Loader2 className="animate-spin text-muted-foreground w-8 h-8" /></div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="p-4 font-medium">User Email</th>
                    <th className="p-4 font-medium">Role</th>
                    <th className="p-4 font-medium">Create Projects</th>
                    <th className="p-4 font-medium">Widget Studio</th>
                    <th className="p-4 font-medium">Context Engine</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users?.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/30">
                      <td className="p-4">{u.email}</td>
                      <td className="p-4 font-medium capitalize">{u.role.replace("_", " ")}</td>
                      <td className="p-4">
                        <Switch
                          checked={u.features?.canCreateProject ?? true}
                          onCheckedChange={(c) => updateFeaturesMutation.mutate({ id: u.id, features: { ...u.features, canCreateProject: c }})}
                        />
                      </td>
                      <td className="p-4">
                        <Switch
                          checked={u.features?.canUseWidgetStudio ?? false}
                          onCheckedChange={(c) => updateFeaturesMutation.mutate({ id: u.id, features: { ...u.features, canUseWidgetStudio: c }})}
                        />
                      </td>
                      <td className="p-4">
                        <Switch
                          checked={u.features?.canUseContextEngine ?? false}
                          onCheckedChange={(c) => updateFeaturesMutation.mutate({ id: u.id, features: { ...u.features, canUseContextEngine: c }})}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="projects" className="space-y-4">
          {projectsLoading ? (
             <div className="flex justify-center p-12"><Loader2 className="animate-spin text-muted-foreground w-8 h-8" /></div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="p-4 font-medium">Project Name</th>
                    <th className="p-4 font-medium">Owner ID</th>
                    <th className="p-4 font-medium">Created</th>
                    <th className="p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {projects?.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="p-4 font-medium">{p.name}</td>
                      <td className="p-4 text-xs font-mono text-muted-foreground">{p.userId}</td>
                      <td className="p-4 text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</td>
                      <td className="p-4">
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => setLocation(`/admin/projects/${p.id}/edit`)}>
                          <FolderOpen className="w-4 h-4" /> Open Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
