// The big screen in a multi-device game: nobody sits at it to scroll, so
// everything must fit. zoomToFit shrinks an element (CSS zoom) just enough
// for `fits()` to become true, and never below `min`. With `widen`, a shrunk
// element also grows wider to use the whole width (zoom narrows it too), so
// it needs less shrinking.
export function zoomToFit(el, fits, min = 0.5, { widen = false } = {}) {
  const apply = (z) => {
    el.style.zoom = z === 1 ? '' : String(z);
    if (widen) {
      el.style.maxWidth = z === 1 ? '' : 'none';
      el.style.width = z === 1 ? '' : `${100 / z}%`;
    }
  };
  apply(1);
  if (fits()) return 1;
  let lo = min;
  let hi = 1;
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2;
    apply(mid);
    if (fits()) lo = mid; else hi = mid;
  }
  apply(lo);
  return lo;
}

export const fitsHeight = (box) => () => box.scrollHeight <= box.clientHeight + 1;
export const fitsWidth = (box) => () => box.scrollWidth <= box.clientWidth + 1;
// True when the whole page fits in the window without scrolling.
export const pageFits = () => document.documentElement.scrollHeight <= window.innerHeight + 1;
