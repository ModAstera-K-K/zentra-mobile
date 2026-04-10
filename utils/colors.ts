export function hexToRgba(hex: string, alpha: number): string {
  const sanitized = hex.replace('#', '');
  const normalized = sanitized.length === 3
    ? sanitized.split('').map((char) => char + char).join('')
    : sanitized;

  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

