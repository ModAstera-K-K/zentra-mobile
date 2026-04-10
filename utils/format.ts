export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatMinutes(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  if (!hours) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

export function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(0)}%`;
}

