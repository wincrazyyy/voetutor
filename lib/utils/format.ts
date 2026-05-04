export function getInitials(firstName: string | null, lastName: string | null, displayName: string | null): string {
  if (firstName && lastName) {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  }
  if (displayName) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return displayName.slice(0, 2).toUpperCase();
  }
  return "??";
}

export function getDisplayName(firstName: string | null, lastName: string | null, displayName: string | null): string {
  if (displayName) return displayName;
  if (firstName && lastName) return `${firstName} ${lastName}`;
  return firstName ?? lastName ?? "Unknown User";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function intervalToSeconds(interval: string | null): number {
  if (!interval) return 0;
  const match = interval.match(/(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/);
  if (match) {
    const h = parseInt(match[1] ?? "0", 10);
    const m = parseInt(match[2], 10);
    const s = parseFloat(match[3]);
    return h * 3600 + m * 60 + s;
  }
  const tokens = interval.match(/(\d+)\s*(hour|minute|second|day)s?/g);
  if (tokens) {
    let total = 0;
    for (const t of tokens) {
      const [n, unit] = t.split(/\s+/);
      const v = parseInt(n, 10);
      if (unit.startsWith("day")) total += v * 86400;
      else if (unit.startsWith("hour")) total += v * 3600;
      else if (unit.startsWith("minute")) total += v * 60;
      else total += v;
    }
    return total;
  }
  return 0;
}

export function formatDuration(interval: string | null): string {
  const seconds = intervalToSeconds(interval);
  if (seconds === 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  if (m > 0) return `${m}m`;
  return `${Math.round(seconds)}s`;
}

export function formatShortDuration(interval: string | null): string {
  const seconds = intervalToSeconds(interval);
  if (seconds === 0) return "—";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} ${min === 1 ? "minute" : "minutes"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${hr === 1 ? "hour" : "hours"} ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d} ${d === 1 ? "day" : "days"} ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w} ${w === 1 ? "week" : "weeks"} ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} ${mo === 1 ? "month" : "months"} ago`;
  const y = Math.floor(d / 365);
  return `${y} ${y === 1 ? "year" : "years"} ago`;
}
