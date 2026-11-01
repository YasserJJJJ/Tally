'use client';

import { ChevronDown, Plus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Wordmark } from '@/components/wordmark';

/** The account's photo, or the first letter of its name when there is none. */
export function AccountAvatar({ name, photo, className }: { name: string; photo: string | null; className?: string }) {
  return <Avatar className={className} aria-hidden="true">
    {photo ? <AvatarImage src={photo} alt="" /> : null}
    <AvatarFallback>{Array.from(name.trim())[0]?.toUpperCase() || '?'}</AvatarFallback>
  </Avatar>;
}

export function AppHeader({ name, photo, busy, onLog, onProfile, onClear, onSignOut }: {
  name: string; photo: string | null; busy: boolean;
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
              <AccountAvatar name={name} photo={photo} className="account-initial" />
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
