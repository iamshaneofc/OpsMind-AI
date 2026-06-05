"use client";

import { useState, useEffect } from "react";
import { Mail, Phone, MapPin, CheckCircle, XCircle, TrendingUp, AlertTriangle, Building2, UserCircle, Star, BrainCircuit, X } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AnimatePresence, motion } from "framer-motion";

// Mock API call simulation
export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);

  useEffect(() => {
    // Fetch real data but we mock the extra CRM fields
    fetch('/api/dashboard/customers')
      .then(res => res.json())
      .then(data => {
        // Hydrate with CRM mock data
        const hydrated = data.map((c: any, i: number) => ({
          ...c,
          ltv: (i * 12500 + 45000) % 350000 + 10000,
          churnRisk: i % 7 === 0 ? 'High' : i % 3 === 0 ? 'Medium' : 'Low',
          lastActive: new Date(Date.now() - (i * 86400000 * 2)).toLocaleDateString(),
          sentiment: i % 4 === 0 ? 'Negative' : 'Positive',
          tier: i % 5 === 0 ? 'Enterprise' : 'Professional',
        }));
        setCustomers(hydrated);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading CRM database...</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="bg-gradient-to-br from-white to-white/50 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
            Customer Intelligence
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            CRM database enhanced with predictive churn modeling.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input placeholder="Search accounts..." className="h-9 w-[250px] bg-black/20 border-white/10" />
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90 h-9">
            Add Account
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card className="glass-card p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Total Accounts</p>
          <p className="text-2xl font-bold text-white">{customers.length}</p>
        </Card>
        <Card className="glass-card p-5 border-primary/20 bg-primary/5">
          <p className="text-xs font-medium text-primary uppercase tracking-wider mb-1">Enterprise Tier</p>
          <p className="text-2xl font-bold text-white">{customers.filter(c => c.tier === 'Enterprise').length}</p>
        </Card>
        <Card className="glass-card p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Avg LTV</p>
          <p className="text-2xl font-bold text-white">$142.5k</p>
        </Card>
        <Card className="glass-card p-5 border-destructive/20 bg-destructive/5">
          <p className="text-xs font-medium text-destructive uppercase tracking-wider mb-1">High Churn Risk</p>
          <p className="text-2xl font-bold text-white">{customers.filter(c => c.churnRisk === 'High').length}</p>
        </Card>
      </div>

      <Card className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-black/40 border-b border-white/10">
              <tr>
                <th className="px-6 py-4 font-medium text-white">Account Name</th>
                <th className="px-6 py-4 font-medium text-white">Contact</th>
                <th className="px-6 py-4 font-medium text-white">Lifetime Value</th>
                <th className="px-6 py-4 font-medium text-white">Churn Risk</th>
                <th className="px-6 py-4 font-medium text-white">Last Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {customers.map((customer) => (
                <tr
                  key={customer.id}
                  className="hover:bg-white/5 transition-colors cursor-pointer group"
                  onClick={() => setSelectedCustomer(customer)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">
                        {customer.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-white group-hover:text-primary transition-colors">{customer.name}</p>
                        <p className="text-xs text-muted-foreground">{customer.tier}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center space-x-2 text-muted-foreground">
                        <Mail className="w-3.5 h-3.5" />
                        <span className="text-xs">{customer.email}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-muted-foreground">
                        <Phone className="w-3.5 h-3.5" />
                        <span className="text-xs">{customer.phone}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-medium text-emerald-400">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(customer.ltv)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="outline" className={`
                      ${customer.churnRisk === 'High' ? 'border-destructive/30 text-destructive bg-destructive/10' : 
                        customer.churnRisk === 'Medium' ? 'border-warning/30 text-warning bg-warning/10' : 
                        'border-success/30 text-success bg-success/10'}
                    `}>
                      {customer.churnRisk}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {customer.lastActive}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Client Intel Drawer */}
      <AnimatePresence>
        {selectedCustomer && (
          <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
              onClick={() => setSelectedCustomer(null)} 
            />
            
            <div className="fixed inset-y-0 right-0 max-w-full flex">
              <motion.div 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="w-screen max-w-md transform transition-all"
              >
                <div className="flex h-full flex-col overflow-y-auto bg-slate-950 border-l border-white/10 shadow-2xl">
                  {/* Header */}
                  <div className="px-6 py-6 sm:px-8 border-b border-white/5 bg-black/20">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-primary/40 to-primary/10 text-primary flex items-center justify-center font-bold text-2xl border border-primary/20">
                          {selectedCustomer.name.charAt(0)}
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-white">{selectedCustomer.name}</h2>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="border-white/10 bg-white/5 text-xs font-normal">
                              {selectedCustomer.tier}
                            </Badge>
                            <span className="flex items-center gap-1 text-xs text-success">
                              <CheckCircle size={12} /> Active
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-md text-muted-foreground hover:text-white focus:outline-none bg-white/5 p-1.5"
                        onClick={() => setSelectedCustomer(null)}
                      >
                        <span className="sr-only">Close panel</span>
                        <X className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="relative flex-1 px-6 py-6 sm:px-8 space-y-8">
                    {/* AI Intel Card */}
                    <div className="relative rounded-xl border border-primary/20 bg-gradient-to-b from-primary/10 to-transparent p-5 overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-10">
                        <BrainCircuit size={100} />
                      </div>
                      <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-3">
                          <BrainCircuit size={16} className="text-primary" />
                          <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">AI Copilot Intel</h3>
                        </div>
                        <p className="text-sm text-white/90 leading-relaxed">
                          {selectedCustomer.churnRisk === 'High' 
                            ? "Engagement has dropped by 45% in the last 30 days. Recommend immediate outreach offering Q4 promotional pricing to retain account."
                            : "Account is healthy. Predict 85% probability of successful upsell to the new Analytics Add-on based on usage patterns."}
                        </p>
                        <div className="mt-4 flex gap-2">
                          <Button size="sm" className="bg-primary hover:bg-primary/90 text-xs h-8">Draft Email</Button>
                          <Button size="sm" variant="outline" className="bg-transparent border-primary/30 text-primary hover:bg-primary/10 text-xs h-8">View Usage Logs</Button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><TrendingUp size={14} /> Lifetime Value</p>
                        <p className="text-lg font-medium text-emerald-400">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(selectedCustomer.ltv)}
                        </p>
                      </div>
                      <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><AlertTriangle size={14} /> Churn Risk</p>
                        <p className={`text-lg font-medium ${selectedCustomer.churnRisk === 'High' ? 'text-destructive' : 'text-success'}`}>
                          {selectedCustomer.churnRisk}
                        </p>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-white mb-3 uppercase tracking-wider flex items-center gap-2">
                        <UserCircle size={16} className="text-muted-foreground"/> Contact Information
                      </h3>
                      <div className="space-y-3 p-4 rounded-xl bg-black/20 border border-white/5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 flex justify-center text-muted-foreground"><Mail size={16} /></div>
                          <div className="flex-1 text-sm text-white">{selectedCustomer.email}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-8 flex justify-center text-muted-foreground"><Phone size={16} /></div>
                          <div className="flex-1 text-sm text-white">{selectedCustomer.phone}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-8 flex justify-center text-muted-foreground"><MapPin size={16} /></div>
                          <div className="flex-1 text-sm text-white">{selectedCustomer.address}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-6 border-t border-white/5 bg-black/20">
                    <Button className="w-full bg-white text-black hover:bg-white/90">
                      Open Full Profile
                    </Button>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
