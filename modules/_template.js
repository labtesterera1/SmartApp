/* ============================================================
   modules/_template.js
   Copy this file to make a new module.
   Then add an import + entry in core/router.js MODULES array.
   That's it.
   ============================================================ */

export default {
  // Required ----------------------------------------------------
  id: 'example',                      // unique, kebab-case
  name: 'Example',                    // shown big on the tile
  tagline: 'short · description · here',  // shown under the name
  status: 'ready',                    // 'ready' or 'coming-soon'

  // Required: render the module's UI into the given container
  render(root) {
    root.innerHTML = `
      <div class="placeholder">
        <div class="placeholder__icon">·</div>
        <div>Hello from the example module.</div>
      </div>
    `;
  },

  // Optional: clean up timers, camera streams, listeners, etc.
  cleanup() {
    // e.g. clearInterval(this._timer);
    //      this._stream?.getTracks().forEach(t => t.stop());
  },
};
