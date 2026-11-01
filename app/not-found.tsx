import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/wordmark';

export const metadata: Metadata = { title: 'Page not found | Tally' };

export default function NotFound() {
  return <main className="not-found">
    <Wordmark />
    <h1>Page not found</h1>
    <p className="lede">This address doesn’t exist in Tally.</p>
    <Button asChild><Link href="/">Back to Tally</Link></Button>
  </main>;
}
