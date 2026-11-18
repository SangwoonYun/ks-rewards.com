export const formatDateTime = (d: string) => new Date(d).toLocaleString();

export const formatDate = (d: string) => new Date(d).toLocaleDateString();

const KST_FORMAT = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

// ISO 8601 UTC time from the API, shown in KST
export const formatKST = (time: string) => (time ? KST_FORMAT.format(new Date(time)) : '');
