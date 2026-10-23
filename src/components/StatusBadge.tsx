import type { LibrarySource } from '../lib/library';

const STALE_DAYS = 7;

function relative(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

function absolute(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  online: boolean;
  source: LibrarySource | null;
  generatedAt: string | null;
  now: number;
}

/** "Online · library updated 2 min ago" or "Offline · using library from 21 Oct, 14:02". */
export function StatusBadge({ online, source, generatedAt, now }: Props) {
  if (!generatedAt) {
    return <span className={`badge ${online ? 'badge-ok' : 'badge-warn'}`}>{online ? 'Online' : 'Offline'}</span>;
  }
  const ageMs = now - Date.parse(generatedAt);
  const stale = source === 'cache' && ageMs > STALE_DAYS * 86_400_000;
  const live = online && source === 'online';
  const label = live
    ? `Online · library updated ${relative(ageMs)}`
    : `${online ? 'Online' : 'Offline'} · using saved library from ${absolute(generatedAt)}`;
  return (
    <span
      className={`badge ${stale ? 'badge-bad' : live ? 'badge-ok' : 'badge-warn'}`}
      title={stale ? `The saved library is more than ${STALE_DAYS} days old. Connect to refresh it.` : undefined}
    >
      <span className="badge-dot" aria-hidden="true" />
      {label}
      {stale && ' · may be outdated'}
    </span>
  );
}
