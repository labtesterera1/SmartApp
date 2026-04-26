/* ============================================================
   modules/sweep.js
   Sweep — hidden camera detection helper (live camera + AI loop).
   STUB: real logic comes in Step 4.
   ============================================================ */

export default {
  id: 'sweep',
  name: 'Sweep',
  tagline: 'lens · glint · reflection scan',
  status: 'coming-soon',

  render(root) {
    root.innerHTML = `
      <div class="placeholder">
        <div class="placeholder__icon">S</div>
        <div><strong>Sweep</strong> coming next.</div>
        <div style="margin-top:8px; font-size:11px; line-height:1.6;">
          Live camera view, scanned every 2 seconds by Gemini.<br>
          Flags suspicious reflections / dark patches.<br>
          Buzzes the phone + draws an alert box on screen.
        </div>
        <div style="margin-top:12px; font-size:9px; color: var(--warn); letter-spacing:0.12em;">
          ⚠ AID, NOT GUARANTEE — VERIFY VISUALLY
        </div>
      </div>
    `;
  },

  cleanup() {},
};
