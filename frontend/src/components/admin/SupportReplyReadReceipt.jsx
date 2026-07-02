function formatSeenTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** WhatsApp-style delivery / seen indicator for admin support replies. */
export default function SupportReplyReadReceipt({ readAt, className = '' }) {
  if (readAt) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-medium text-blue-500 dark:text-blue-400 ${className}`}
        title={`Seen ${formatSeenTime(readAt)}`}
      >
        <span aria-hidden className="tracking-tighter font-bold">✓✓</span>
        <span>Seen{formatSeenTime(readAt) ? ` · ${formatSeenTime(readAt)}` : ''}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium text-gray-400 dark:text-gray-500 ${className}`}
      title="Delivered — customer has not opened this reply yet"
    >
      <span aria-hidden className="tracking-tighter opacity-80">✓✓</span>
      <span>Delivered</span>
    </span>
  );
}
