// The UI is laid out for a 1280×800 window. A bigger one (maximized, fullscreen) zooms the whole
// webview up — like Ctrl + in a browser — instead of stretching the layout thin with gaps; the
// voxel art stays crisp because the webview renders at the higher scale.
import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { inTauri } from './native.js';

const BASE_W = 1280;
const BASE_H = 800;
const MAX_ZOOM = 2;

export function useFitZoom() {
  useEffect(() => {
    if (!inTauri) return;
    const win = getCurrentWindow();
    const view = getCurrentWebview();
    let last = 1;
    let alive = true;
    const apply = async () => {
      try {
        const [size, k] = await Promise.all([win.innerSize(), win.scaleFactor()]);
        const fit = Math.min(size.width / k / BASE_W, size.height / k / BASE_H);
        // Steps of 5%, so dragging the window edge doesn't re-zoom on every pixel.
        const zoom = Math.round(Math.max(1, Math.min(MAX_ZOOM, fit)) * 20) / 20;
        if (alive && zoom !== last) { last = zoom; await view.setZoom(zoom); }
      } catch (e) { console.warn('zoom', e); }
    };
    apply();
    const unlisten = win.onResized(apply);
    return () => { alive = false; unlisten.then((f) => f()); };
  }, []);
}
