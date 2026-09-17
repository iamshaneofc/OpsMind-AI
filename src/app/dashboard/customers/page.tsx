"use client";

import { useState, useEffect, useMemo } from "react";
import { Mail, Phone, MapPin, CheckCircle, XCircle, TrendingUp, AlertTriangle, Building2, UserCircle, Star, BrainCircuit, X, Loader2, Check } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AnimatePresence, motion } from "framer-motion";


export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", email: "", phone: "", address: "" });
  const [creating, setCreating] = useState(false);

  const fetchCustomers = () => {
    fetch('/api/dashboard/customers')
      .then(res => res.json())
      .then(data => {
        setCustomers(data);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c =>
      (c.name ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").toLowerCase().includes(q) ||
      (c.address ?? "").toLowerCase().includes(q) ||
      (c.location ?? "").toLowerCase().includes(q)
    );
  }, [customers, searchQuery]);

  const handleAddCustomer = async () => {
    if (!newCustomer.name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/dashboard/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCustomer),
      });
      if (res.ok) {
        setShowAddModal(false);
        setNewCustomer({ name: "", email: "", phone: "", address: "" });
        fetchCustomers();
      }
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

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
          <Input
            placeholder="Search accounts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-[250px] bg-black/20 border-white/10"
          />
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-9"
            onClick={() => setShowAddModal(true)}
          >
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
          <p className="text-xs font-medium text-primary uppercase tracking-wider mb-1">Active Accounts</p>
          <p className="text-2xl font-bold text-white">{customers.filter(c => c.status === 'ACTIVE').length}</p>
        </Card>
        <Card className="glass-card p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">With Email</p>
          <p className="text-2xl font-bold text-white">{customers.filter(c => c.email).length}</p>
        </Card>
        <Card className="glass-card p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Filtered</p>
          <p className="text-2xl font-bold text-white">{filtered.length}</p>
        </Card>
      </div>

      <Card className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-black/40 border-b border-white/10">
              <tr>
                <th className="px-6 py-4 font-medium text-white">Account Name</th>
                <th className="px-6 py-4 font-medium text-white">Contact</th>
                <th className="px-6 py-4 font-medium text-white">Location</th>
                <th className="px-6 py-4 font-medium text-white">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((customer) => (
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
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center space-x-2 text-muted-foreground">
                        <Mail className="w-3.5 h-3.5" />
                        <span className="text-xs">{customer.email || "—"}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-muted-foreground">
                        <Phone className="w-3.5 h-3.5" />
                        <span className="text-xs">{customer.phone || "—"}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground text-sm">
                    {customer.location || customer.address || '—'}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="default" className={customer.status === 'ACTIVE' ? 'border-success/30 text-success bg-success/10' : 'border-white/10 bg-white/5 text-muted-foreground'}>
                      {customer.status || "ACTIVE"}
                    </Badge>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                    No customers found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Customer Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowAddModal(false)}
            />
            <div className="fixed inset-0 flex items-center justify-center p-4">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-slate-950 border border-white/10 rounded-xl shadow-2xl w-full max-w-md p-6"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-white">Add New Customer</h3>
                  <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-white">
                    <X size={20} />
                  </button>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Name *</label>
                    <Input
                      value={newCustomer.name}
                      onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                      placeholder="Company name"
                      className="bg-black/20 border-white/10 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Email</label>
                    <Input
                      value={newCustomer.email}
                      onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                      placeholder="contact@company.com"
                      className="bg-black/20 border-white/10 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Phone</label>
                    <Input
                      value={newCustomer.phone}
                      onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                      placeholder="+1 (555) 000-0000"
                      className="bg-black/20 border-white/10 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Address</label>
                    <Input
                      value={newCustomer.address}
                      onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                      placeholder="123 Main St, City, State"
                      className="bg-black/20 border-white/10 text-white"
                    />
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <Button
                    variant="outline"
                    className="flex-1 bg-transparent border-white/10 hover:bg-white/5"
                    onClick={() => setShowAddModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={handleAddCustomer}
                    disabled={creating || !newCustomer.name.trim()}
                  >
                    {creating ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Check size={16} className="mr-2" />}
                    {creating ? "Creating..." : "Create Account"}
                  </Button>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Customer Detail Drawer */}
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
                            <Badge variant="default" className="border-white/10 bg-white/5 text-xs font-normal">
                              {selectedCustomer.status || "ACTIVE"}
                            </Badge>
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
                    <div>
                      <h3 className="text-sm font-medium text-white mb-3 uppercase tracking-wider flex items-center gap-2">
                        <UserCircle size={16} className="text-muted-foreground"/> Contact Information
                      </h3>
                      <div className="space-y-3 p-4 rounded-xl bg-black/20 border border-white/5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 flex justify-center text-muted-foreground"><Mail size={16} /></div>
                          <div className="flex-1 text-sm text-white">{selectedCustomer.email || "—"}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-8 flex justify-center text-muted-foreground"><Phone size={16} /></div>
                          <div className="flex-1 text-sm text-white">{selectedCustomer.phone || "—"}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-8 flex justify-center text-muted-foreground"><MapPin size={16} /></div>
                          <div className="flex-1 text-sm text-white">{selectedCustomer.address || "—"}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-6 border-t border-white/5 bg-black/20 flex gap-3">
                    <Button
                      className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => {
                        const email = selectedCustomer.email;
                        if (email) {
                          window.open(`mailto:${email}?subject=Follow-up regarding your account`, "_blank");
                        }
                      }}
                      disabled={!selectedCustomer.email}
                    >
                      <Mail size={16} className="mr-2" />
                      Draft Email
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 bg-transparent border-white/10 hover:bg-white/5"
                      onClick={() => setSelectedCustomer(null)}
                    >
                      Close
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
