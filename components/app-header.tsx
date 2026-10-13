'use client';

import { ChevronDown, Plus } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Wordmark } from '@/components/wordmark';

export function AppHeader({ name, busy, onLog, onProfile, onClear, onSignOut }: {
  name: string; busy: boolean;
  onLog: () => void; onProfile: () => void; onClear: () => void; onSignOut: () => void;
}) {
  return <header className="app-header">
    <div className="app-header-inner">
      <Wordmark />
      <div className="app-header-actions">
        <button type="button" className="btn btn-primary" onClick={onLog}><Plus size={16} aria-hidden="true" />Log today</button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="account-button" disabled={busy}>
              <span className="account-initial" aria-hidden="true">{Array.from(name.trim())[0]?.toUpperCase() || '?'}</span>
              <span className="account-name">{name}</span>
              <ChevronDown size={15} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="menu">
            <DropdownMenuItem className="menu-item" onSelect={onProfile}>Profile and goals</DropdownMenuItem>
            <DropdownMenuItem className="menu-item" onSelect={onSignOut}>Sign out</DropdownMenuItem>
            <DropdownMenuSeparator className="menu-separator" />
            <DropdownMenuItem className="menu-item menu-danger" onSelect={onClear}>Clear journal…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  </header>;
}
