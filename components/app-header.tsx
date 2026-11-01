'use client';

import { ChevronDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
        <Button onClick={onLog}><Plus aria-hidden="true" />Log today</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="account-button" disabled={busy}>
              <span className="account-initial" aria-hidden="true">{Array.from(name.trim())[0]?.toUpperCase() || '?'}</span>
              <span className="account-name">{name}</span>
              <ChevronDown aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="menu">
            <DropdownMenuItem onSelect={onProfile}>Profile and goals</DropdownMenuItem>
            <DropdownMenuItem onSelect={onSignOut}>Sign out</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onClear}>Clear journal…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  </header>;
}
