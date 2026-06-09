"use client";

import { useState, useEffect } from "react";
import { Code, Plus, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type ProviderConfig = {
  id: string;
  provider: string;
  isActive: boolean;
  updatedAt: string;
  maskedKey: string;
};

export function ApiKeysPanel() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [providerName, setProviderName] = useState("OpenAI");
  const [apiKey, setApiKey] = useState("");
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [testMessage, setTestMessage] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/settings/ai-providers");
      if (!res.ok) {
        if (res.status === 401) throw new Error("Unauthorized: Only administrators can view API keys.");
        throw new Error("Failed to load providers");
      }
      const data = await res.json();
      setProviders(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!apiKey) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/ai-providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerName, apiKey }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult("success");
        setTestMessage("Connection successful");
      } else {
        setTestResult("error");
        setTestMessage(data.error || "Connection failed");
      }
    } catch (err: any) {
      setTestResult("error");
      setTestMessage(err.message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!apiKey) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings/ai-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerName, apiKey, isActive: true }),
      });
      if (res.ok) {
        setIsEditing(false);
        setApiKey("");
        setTestResult(null);
        await fetchProviders();
      } else {
        const data = await res.json();
        setTestResult("error");
        setTestMessage(data.error || "Failed to save key");
      }
    } catch (err: any) {
      setTestResult("error");
      setTestMessage(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleActivate = async (pName: string) => {
    try {
      await fetch("/api/settings/ai-providers/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: pName }),
      });
      await fetchProviders();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return <div className="flex h-32 items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  }

  if (error) {
    return (
      <div className="rounded-lg bg-destructive/10 p-6 border border-destructive/20 text-center">
        <AlertCircle className="mx-auto mb-2 text-destructive" size={32} />
        <p className="text-destructive font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-white">AI Provider Keys</h3>
          <p className="text-sm text-muted-foreground mt-1">Configure backend AI intelligence providers.</p>
        </div>
        <Button 
          onClick={() => setIsEditing(!isEditing)}
          className="bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-2"
        >
          <Plus size={16} /> Add Configuration
        </Button>
      </div>

      {isEditing && (
        <Card className="glass-card p-6 border-white/10 bg-white/5 space-y-4 animate-in fade-in slide-in-from-top-4">
          <h4 className="font-semibold text-white">New Provider Configuration</h4>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-white">Provider</label>
              <select 
                className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white outline-none"
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
              >
                <option value="OpenAI">OpenAI</option>
                <option value="Anthropic" disabled>Anthropic (Coming Soon)</option>
                <option value="Gemini" disabled>Gemini (Coming Soon)</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-white">API Key</label>
              <Input 
                type="password"
                placeholder="sk-..." 
                className="bg-black/40 border-white/10 text-white font-mono"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>

            {testResult && (
              <div className={`p-3 rounded-md flex items-center gap-2 text-sm ${testResult === "success" ? "bg-success/10 text-success border border-success/20" : "bg-destructive/10 text-destructive border border-destructive/20"}`}>
                {testResult === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                {testMessage}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" className="border-white/10 text-white hover:bg-white/10" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button 
                variant="outline" 
                className="border-primary/50 text-primary hover:bg-primary/10"
                onClick={handleTest}
                disabled={!apiKey || isTesting}
              >
                {isTesting ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
                Test Connection
              </Button>
              <Button 
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={handleSave}
                disabled={!apiKey || isSaving || testResult === "error"}
              >
                {isSaving ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
                Save & Activate
              </Button>
            </div>
          </div>
        </Card>
      )}

      {providers.length > 0 ? (
        <Card className="glass-card overflow-hidden border-white/10">
          <table className="w-full text-sm text-left">
            <thead className="bg-black/40 text-xs text-muted-foreground uppercase border-b border-white/10">
              <tr>
                <th className="px-6 py-4 font-medium">Provider</th>
                <th className="px-6 py-4 font-medium">API Key</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Last Updated</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {providers.map(p => (
                <tr key={p.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 text-white font-medium flex items-center gap-2">
                    <Code size={14} className={p.isActive ? "text-primary" : "text-muted-foreground"}/> 
                    {p.provider}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground font-mono">{p.maskedKey}</td>
                  <td className="px-6 py-4">
                    {p.isActive ? (
                      <Badge variant="default" className="border-success/30 text-success bg-success/10 font-normal">Active</Badge>
                    ) : (
                      <Badge variant="default" className="border-white/10 text-muted-foreground bg-white/5 font-normal">Inactive</Badge>
                    )}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {new Date(p.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {!p.isActive && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-primary hover:bg-primary/10 hover:text-primary"
                        onClick={() => handleActivate(p.provider)}
                      >
                        Activate
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        !isEditing && (
          <div className="p-8 text-center border border-dashed border-white/10 rounded-lg">
            <Code className="mx-auto mb-3 text-muted-foreground" size={32} />
            <p className="text-white font-medium mb-1">No API Keys Configured</p>
            <p className="text-sm text-muted-foreground mb-4">You need to configure an AI provider for the Copilot to function.</p>
            <Button onClick={() => setIsEditing(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
              Configure OpenAI
            </Button>
          </div>
        )
      )}
    </div>
  );
}
