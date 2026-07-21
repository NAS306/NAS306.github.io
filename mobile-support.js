const MOBILE_UA_PATTERN = /Mobi|Android|iPhone|iPad|iPod|Windows Phone|webOS/i;

export const MOBILE_DRAG_TOLERANCE_PX = 12;

export function detectMobileDevice({
  userAgent = "",
  platform = "",
  maxTouchPoints = 0,
  userAgentDataMobile = false,
  coarsePointer = false,
  screenWidth = Number.POSITIVE_INFINITY,
  screenHeight = Number.POSITIVE_INFINITY,
} = {}) {
  const isIpadOS = platform === "MacIntel" && maxTouchPoints > 1;
  const shortestScreenSide = Math.min(screenWidth, screenHeight);
  const isSmallTouchDevice = coarsePointer
    && maxTouchPoints > 0
    && Number.isFinite(shortestScreenSide)
    && shortestScreenSide <= 600;

  return Boolean(
    userAgentDataMobile
    || MOBILE_UA_PATTERN.test(userAgent)
    || isIpadOS
    || isSmallTouchDevice
  );
}

export function getLayoutDragThreshold(
  viewportScale,
  visualTolerance = MOBILE_DRAG_TOLERANCE_PX,
) {
  const scale = Number.isFinite(viewportScale) && viewportScale > 0
    ? viewportScale
    : 1;
  return visualTolerance / scale;
}
