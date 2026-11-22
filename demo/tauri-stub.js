/* Tauri stub: lets the real Pomeowdoro UI run inside a web page as a live demo. */
(() => {
  try { if (!localStorage.getItem('p2s')) localStorage.setItem('p2s', JSON.stringify({ idleHide: false, scale: 1, sound: false, lyrics: false })); } catch (e) {}
  const handlers = {};
  let media = { has: true, title: 'Lo-fi Focus Beats', artist: 'Pomeow Radio', playing: true, pos_ms: 0, dur_ms: 200000 };
  const emitMedia = () => (handlers.media || []).forEach(h => h({ payload: { ...media } }));
  class Size { constructor(w, h) { this.w = w; this.h = h; } }
  const win = { setSize: async s => { try { parent.postMessage({ pomeow: 'size', w: s.w, h: s.h }, '*'); } catch (e) {} }, setPosition: async () => {}, hide: async () => {}, show: async () => {} };
  window.__TAURI__ = {
    core: { invoke: async (cmd, args = {}) => {
      if (cmd === 'media_cmd') {
        if (args.cmd === 'play_pause') media.playing = !media.playing;
        if (args.cmd === 'play') media.playing = true;
        if (args.cmd === 'pause') media.playing = false;
        if (args.cmd === 'next') media.title = ['Rain on the Window', 'Deep Focus Gamma', 'Lo-fi Focus Beats'][Math.floor(Math.random() * 3)];
        if (args.cmd === 'prev') media.title = 'Lo-fi Focus Beats';
        emitMedia();
      }
      if (cmd === 'plugin:autostart|is_enabled') return false;
      return null;
    } },
    event: { listen: async (name, cb) => { (handlers[name] = handlers[name] || []).push(cb); if (name === 'media') setTimeout(emitMedia, 400); return () => {}; } },
    window: { getCurrentWindow: () => win, availableMonitors: async () => [], primaryMonitor: async () => ({ position: { x: 0, y: 0 }, size: { width: 1920, height: 1080 }, scaleFactor: 1 }), LogicalSize: Size, LogicalPosition: Size },
    dpi: { LogicalSize: Size, LogicalPosition: Size },
    webview: { getCurrentWebview: () => ({ onDragDropEvent: () => {} }) },
    drag: { startDrag: () => {} },
  };
})();