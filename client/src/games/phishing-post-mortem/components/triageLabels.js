export const TYPE_LABELS = {
  lookalike: 'Lookalike domain',
  spoof: 'Spoofed sender',
  replyTo: 'Reply-to mismatch',
  linkMismatch: 'Link goes elsewhere',
  bec: 'Payment-change request',
  qr: 'QR code to a fake site',
  attachment: 'Risky attachment',
  legit: 'Genuine email',
}

export function typeLabel(type) {
  return TYPE_LABELS[type] ?? 'Email'
}
