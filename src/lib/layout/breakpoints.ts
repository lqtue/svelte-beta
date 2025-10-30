import { browser } from '$app/environment';
import { derived, readable } from 'svelte/store';

export const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024
} as const;

type BreakpointKey = keyof typeof BREAKPOINTS;

export interface ViewportSize {
  width: number;
  height: number;
}

export interface ScreenFlags extends ViewportSize {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

const initialSize: ViewportSize = { width: 0, height: 0 };

export const viewport = readable<ViewportSize>(initialSize, (set) => {
  if (!browser) {
    return;
  }

  const setSize = () => set({ width: window.innerWidth, height: window.innerHeight });

  setSize();
  window.addEventListener('resize', setSize);
  return () => window.removeEventListener('resize', setSize);
});

export const screen = derived(viewport, ({ width, height }): ScreenFlags => ({
  width,
  height,
  isMobile: width < BREAKPOINTS.tablet,
  isTablet: width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop,
  isDesktop: width >= BREAKPOINTS.desktop
}));

export const matchBreakpoint = (width: number): BreakpointKey => {
  if (width >= BREAKPOINTS.desktop) return 'desktop';
  if (width >= BREAKPOINTS.tablet) return 'tablet';
  return 'mobile';
};
