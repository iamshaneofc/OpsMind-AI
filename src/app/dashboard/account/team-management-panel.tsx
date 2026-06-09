"use client";

import { useEffect, useState } from "react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Users, Shield, Loader2, Check } from "lucide-react";

type RoleRecord = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
};

export function TeamManagementPanel({ currentEmail }: { currentEmail: string }) {
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("MANAGER");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    try {
      const res = await fetch("/api/roles");
      if (res.ok) {
        const data = await res.json();
        setRoles(data);
      }
    } catch (error) {
      console.error("Failed to fetch roles:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async (email: string, role: string) => {
    try {
      setSubmitting(true);
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      if (res.ok) {
        await fetchRoles();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddUser = async () => {
    if (!newEmail.trim()) return;
    await handleUpdateRole(newEmail.trim(), newRole);
    setNewEmail("");
    setNewRole("MANAGER");
  };

  const handleDelete = async (email: string) => {
    if (!confirm(`Are you sure you want to remove role access for ${email}?`)) return;
    try {
      setSubmitting(true);
      const res = await fetch(`/api/roles?email=${encodeURIComponent(email)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchRoles();
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield className="text-primary" size={24} />
          Team Management
        </h3>
        <p className="text-sm text-muted-foreground mt-1">Manage users and assign system roles.</p>
      </div>

      <Card className="glass-card p-6 border-white/10">
        <CardTitle className="text-lg font-semibold text-white mb-4">Invite New Member</CardTitle>
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="space-y-2 flex-1">
            <label className="text-sm font-medium text-white">Email Address</label>
            <Input 
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="colleague@example.com" 
              className="bg-black/20 border-white/10 text-white" 
            />
          </div>
          <div className="space-y-2 w-full sm:w-48">
            <label className="text-sm font-medium text-white">Role</label>
            <select 
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="w-full h-10 rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              <option value="ADMIN">Admin</option>
              <option value="MANAGER">Manager</option>
              <option value="ANALYST">Analyst</option>
            </select>
          </div>
          <Button 
            onClick={handleAddUser} 
            disabled={submitting || !newEmail.trim()}
            className="bg-primary hover:bg-primary/90 text-primary-foreground h-10"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : "Invite"}
          </Button>
        </div>
      </Card>

      <Card className="glass-card p-0 border-white/10 overflow-hidden">
        <div className="p-6 border-b border-white/10 flex items-center gap-2">
          <Users size={18} className="text-muted-foreground" />
          <CardTitle className="text-lg font-semibold text-white">Current Team Members</CardTitle>
        </div>
        <div className="divide-y divide-white/5">
          {roles.map((r) => (
            <div key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors">
              <div className="space-y-1">
                <p className="font-medium text-white text-sm">{r.email} {r.email === currentEmail && <Badge variant="secondary" className="ml-2 text-xs border border-primary/30 text-primary bg-transparent hover:bg-transparent">You</Badge>}</p>
                <p className="text-xs text-muted-foreground">Added {new Date(r.createdAt).toLocaleDateString()}</p>
              </div>
              
              <div className="flex items-center gap-3">
                <select 
                  value={r.role}
                  onChange={(e) => handleUpdateRole(r.email, e.target.value)}
                  disabled={submitting || r.email === currentEmail}
                  className="w-32 h-8 rounded-md border border-white/10 bg-black/40 px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
                >
                  <option value="ADMIN">Admin</option>
                  <option value="MANAGER">Manager</option>
                  <option value="ANALYST">Analyst</option>
                </select>
                
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => handleDelete(r.email)}
                  disabled={submitting || r.email === currentEmail}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8"
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          {roles.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No team members found.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
