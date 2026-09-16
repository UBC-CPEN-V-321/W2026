export function formatGmtOffsetTime(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');

  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());

  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const offsetHours = pad(Math.floor(Math.abs(offsetMinutes) / 60));
  const offsetRemainderMinutes = pad(Math.abs(offsetMinutes) % 60);

  return `${hh}:${mm}:${ss} GMT${sign}${offsetHours}:${offsetRemainderMinutes}`;
}
