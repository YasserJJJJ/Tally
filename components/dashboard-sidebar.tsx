'use client';

import { useState } from 'react';
import { LayoutDashboard, LogOut, Menu, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { TallyBrand } from '@/components/account-flow';

type SidebarProps = { name: string; busy: boolean; onProfile: () => void; onReset: () => void; onSignOut: () => void };

export function DashboardSidebar({ name, busy, onProfile, onReset, onSignOut }: SidebarProps) {
  const [open, setOpen] = useState(false);
  function act(action: () => void) { setOpen(false); action(); }
  const contents = <>
    <div className="sidebar-brand"><TallyBrand /></div>
    <p className="sidebar-label">WORKSPACE</p>
    <nav aria-label="Dashboard navigation" className="sidebar-nav">
      <button type="button" className="sidebar-active" aria-current="page" onClick={() => setOpen(false)}><LayoutDashboard size={19} />Journal</button>
      <button type="button" onClick={() => act(onProfile)} disabled={busy}><SlidersHorizontal size={19} />Profile &amp; goals</button>
      <button type="button" onClick={() => act(onReset)} disabled={busy}><RotateCcw size={19} />Start an empty journal</button>
    </nav>
    <div className="sidebar-bottom">
      <div className="sidebar-account"><span className="sidebar-avatar">{Array.from(name.trim())[0]?.toUpperCase() || '?'}</span><div><strong>{name}</strong><span>Your account</span></div></div>
      <button type="button" className="sidebar-signout" disabled={busy} onClick={() => act(onSignOut)}><LogOut size={18} />Sign out</button>
    </div>
  </>;
  return <>
    <aside className="dashboard-sidebar">{contents}</aside>
    <header className="mobile-dashboard-header"><TallyBrand /><Button variant="outline" size="icon" aria-label="Open sidebar" onClick={() => setOpen(true)}><Menu size={20} /></Button></header>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="mobile-sidebar-panel"><DialogTitle className="sr-only">Dashboard menu</DialogTitle><DialogDescription className="sr-only">Your journal and account settings.</DialogDescription>{contents}</DialogContent></Dialog>
  </>;
}
