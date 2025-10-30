import { d as derived, r as readable } from "./index.js";
const BREAKPOINTS = {
  tablet: 768,
  desktop: 1024
};
const initialSize = { width: 0, height: 0 };
const viewport = readable(initialSize, (set) => {
  {
    return;
  }
});
const screen = derived(viewport, ({ width, height }) => ({
  width,
  height,
  isMobile: width < BREAKPOINTS.tablet,
  isTablet: width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop,
  isDesktop: width >= BREAKPOINTS.desktop
}));
export {
  screen as s
};
