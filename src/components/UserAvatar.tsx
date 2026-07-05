import { Avatar } from '@mui/material';

/** Twee letters uit een naam: initialen van eerste twee woorden, anders eerste twee letters. */
export function initialsFromName(name?: string | null): string {
  const n = (name ?? '').trim();
  if (!n) return '?';
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

/** Stabiele achtergrondkleur op basis van de naam (voor de initialen-fallback). */
function colorFromName(name?: string | null): string {
  const n = (name ?? '').trim() || '?';
  let hash = 0;
  for (let i = 0; i < n.length; i++) hash = n.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 45%, 45%)`;
}

interface UserAvatarProps {
  name?: string | null;
  photoURL?: string | null;
  size?: number;
}

export function UserAvatar({ name, photoURL, size = 40 }: UserAvatarProps) {
  const initials = initialsFromName(name);
  return (
    <Avatar
      src={photoURL || undefined}
      alt={name || 'Profielfoto'}
      sx={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        fontWeight: 600,
        bgcolor: photoURL ? undefined : colorFromName(name),
        color: '#fff',
      }}
    >
      {initials}
    </Avatar>
  );
}
