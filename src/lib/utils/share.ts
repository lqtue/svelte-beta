/**
 * share.ts - Web Share API utilities
 * Provides native share functionality with fallback
 */

interface ShareData {
  title: string;
  text?: string;
  url: string;
}

/**
 * Share content using the Web Share API (mobile) or copy to clipboard (desktop)
 */
export async function shareContent(data: ShareData): Promise<boolean> {
  // Check if Web Share API is available (mainly mobile browsers)
  if (navigator.share) {
    try {
      await navigator.share({
        title: data.title,
        text: data.text,
        url: data.url,
      });
      return true;
    } catch (err) {
      // User cancelled or share failed
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Share failed:', err);
      }
      return false;
    }
  }

  // Fallback: copy URL to clipboard
  try {
    await navigator.clipboard.writeText(data.url);
    return true;
  } catch (err) {
    console.error('Clipboard copy failed:', err);
    return false;
  }
}

/**
 * Check if Web Share API is supported
 */
export function canShare(): boolean {
  return typeof navigator !== 'undefined' && 'share' in navigator;
}

/**
 * Generate share data for a map
 */
export function getMapShareData(mapId: string, mapName: string): ShareData {
  const url = `${window.location.origin}/view?map=${encodeURIComponent(mapId)}`;
  return {
    title: `${mapName} - Vietnam Map Archive`,
    text: `Check out this historical map: ${mapName}`,
    url,
  };
}

/**
 * Generate share data for a story
 */
export function getStoryShareData(storyId: string, storyTitle: string): ShareData {
  const url = `${window.location.origin}/view?story=${encodeURIComponent(storyId)}`;
  return {
    title: `${storyTitle} - Vietnam Map Archive`,
    text: `Explore this story: ${storyTitle}`,
    url,
  };
}
