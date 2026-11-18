// Badge classes (admin.css) by status

export function redemptionStatusClass(status: string) {
  const s = status.toUpperCase();
  if (['SUCCESS', 'RECEIVED'].includes(s)) return 'badge-success';
  if (s.includes('PENDING')) return 'badge-warning';
  return 'badge-danger';
}

export function queueStatusClass(status: string) {
  switch (status) {
    case 'pending': return 'badge-warning';
    case 'processing': return 'badge-info';
    case 'failed': return 'badge-danger';
    default: return 'badge-muted';
  }
}

export function codeStatusClass(status: string) {
  switch (status) {
    case 'validated': return 'badge-success';
    case 'pending': return 'badge-warning';
    case 'expired': case 'invalid': return 'badge-danger';
    default: return 'badge-muted';
  }
}

export const activeBadgeClass = (active: number | boolean | undefined) => (active ? 'badge-success' : 'badge-danger');
