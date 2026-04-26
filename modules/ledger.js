/* ============================================================
   modules/ledger.js
   Account tracker — username suggester, recovery info, share.
   STUB: real logic comes in Step 3.
   ============================================================ */

export default {
  id: 'ledger',
  name: 'Ledger',
  tagline: 'accounts · recovery · share',
  status: 'coming-soon',

  render(root) {
    root.innerHTML = `
      <div class="placeholder">
        <div class="placeholder__icon">L</div>
        <div><strong>Ledger</strong> coming next.</div>
        <div style="margin-top:8px; font-size:11px; line-height:1.6;">
          Will let you log accounts you create on Gmail, Groq, Gemini, etc.<br>
          Suggests usernames, stores recovery email + phone,<br>
          shares the summary to WhatsApp.
        </div>
      </div>
    `;
  },

  cleanup() {},
};
