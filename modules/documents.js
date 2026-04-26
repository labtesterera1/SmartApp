/* ============================================================
   modules/documents.js
   Document Hub — photos, PDFs, AI extract, OneDrive sync, share.
   STUB: real logic comes in Step 2.
   ============================================================ */

export default {
  id: 'documents',
  name: 'Document Hub',
  tagline: 'capture · extract · sync · share',
  status: 'coming-soon',

  render(root) {
    root.innerHTML = `
      <div class="placeholder">
        <div class="placeholder__icon">D</div>
        <div><strong>Document Hub</strong> coming next.</div>
        <div style="margin-top:8px; font-size:11px; line-height:1.6;">
          Snap or upload receipts/PDFs.<br>
          Gemini extracts merchant, date, total, items.<br>
          Auto-syncs to OneDrive · shares to WhatsApp / Email / Print / CSV.
        </div>
      </div>
    `;
  },

  cleanup() {},
};
