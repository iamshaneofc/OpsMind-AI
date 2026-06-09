"use client";

import { useState } from "react";
import { User, Key, Shield, Building, Users, UserCheck, Activity, Settings } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { ApiKeysPanel } from "./api-keys-panel";
import { TeamManagementPanel } from "./team-management-panel";

interface AccountClientProps {
  initialName: string | null;
  email: string;
  role: string;
}

export function AccountClient({ initialName, email, role }: AccountClientProps) {
  const [activeTab, setActiveTab] = useState("profile");
  
  const fullName = initialName || email.split('@')[0];
  const nameParts = fullName.split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
  const initials = (firstName.charAt(0) + (lastName.charAt(0) || '')).toUpperCase() || 'U';

  const tabs = [
    { id: "profile", label: "Profile", icon: User },
    { id: "workspace", label: "Workspace", icon: Building },
    { id: "security", label: "Security", icon: Shield },
    { id: "api", label: "API Keys", icon: Key },
    ...(role === "admin" ? [{ id: "team", label: "Team Management", icon: Users }] : []),
    { id: "roles", label: "Role Permissions", icon: UserCheck },
    { id: "audit", label: "Audit Logs", icon: Activity },
    { id: "preferences", label: "System Preferences", icon: Settings },
  ];

  return (
    <div className="flex h-[calc(100vh-6rem)] animate-fade-in overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r border-white/5 bg-black/10 p-6 space-y-8 flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white mb-6">Settings</h2>
          <nav className="space-y-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary/20 text-primary border border-primary/20"
                      : "text-muted-foreground hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        <div className="mx-auto max-w-3xl space-y-8">
          
          {activeTab === "profile" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div>
                <h3 className="text-2xl font-bold text-white">Profile Settings</h3>
                <p className="text-sm text-muted-foreground mt-1">Manage your personal information and preferences.</p>
              </div>
              <Card className="glass-card p-6 border-white/10">
                <div className="flex items-center gap-6 mb-8">
                  <div className="h-24 w-24 rounded-full bg-gradient-to-br from-primary to-primary/30 flex items-center justify-center text-3xl font-bold text-white border-4 border-black/50 uppercase">
                    {initials}
                  </div>
                  <div>
                    <Button variant="outline" className="bg-white/5 border-white/10 text-white hover:bg-white/10">Change Avatar</Button>
                    <p className="text-xs text-muted-foreground mt-2">JPG, GIF or PNG. 1MB max.</p>
                  </div>
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">First Name</label>
                    <Input defaultValue={firstName} className="bg-black/20 border-white/10 text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Last Name</label>
                    <Input defaultValue={lastName} className="bg-black/20 border-white/10 text-white" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-white">Email Address</label>
                    <Input defaultValue={email} disabled className="bg-black/40 border-white/5 text-muted-foreground" />
                  </div>
                </div>
                <div className="mt-8 flex justify-end">
                  <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">Save Changes</Button>
                </div>
              </Card>
            </motion.div>
          )}

          {activeTab === "api" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <ApiKeysPanel />
            </motion.div>
          )}

          {activeTab === "team" && role === "admin" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <TeamManagementPanel currentEmail={email} />
            </motion.div>
          )}

          {/* Placeholder for other tabs */}
          {["workspace", "security", "users", "roles", "audit", "preferences"].includes(activeTab) && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 rounded-full bg-white/5 flex items-center justify-center text-muted-foreground mb-4">
                <Settings size={24} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Coming Soon</h3>
              <p className="text-muted-foreground max-w-sm">
                The {tabs.find(t => t.id === activeTab)?.label} panel is currently under development. Check back later.
              </p>
            </motion.div>
          )}

        </div>
      </div>
    </div>
  );
}
