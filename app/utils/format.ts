export const formatDateTime = (d: string) => new Date(d).toLocaleString();

export const formatDate = (d: string) => new Date(d).toLocaleDateString();

const KST_FORMATS = new Map<string, Intl.DateTimeFormat>();

function kstFormat(locale: string) {
  let format = KST_FORMATS.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    KST_FORMATS.set(locale, format);
  }
  return format;
}

// ISO 8601 UTC time from the API, shown in KST in the given locale's date format
export const formatKST = (time: string, locale = 'ko-KR') => (time ? kstFormat(locale).format(new Date(time)) : '');
