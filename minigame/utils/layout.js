function viewport(info) {
  const width = info.screenWidth,
    height = info.screenHeight,
    scale = width / 390;
  return {
    width,
    height,
    dpr: info.pixelRatio || 1,
    scale,
    designHeight: height / scale,
    top: Math.max(info.statusBarHeight || 0, info.safeArea?.top || 0) / scale,
    bottom: Math.max(0, height - (info.safeArea?.bottom || height)) / scale,
  };
}
function getSeatLayout(count, width, height) {
  if (count < 5 || count > 10) throw new Error("人数须为 5–10");
  const seatWidth = (76 * width) / 390,
    seatHeight = (104 * width) / 390;
  if (count >= 9) {
    // Three top/bottom seats and two seats on each side keep full name/badge
    // rectangles apart; an ellipse alone overlaps ten-player side seats.
    const points =
      count === 10
        ? [
            [0.12, 0],
            [0.5, 0],
            [0.88, 0],
            [1, 0.34],
            [1, 0.68],
            [0.88, 1],
            [0.5, 1],
            [0.12, 1],
            [0, 0.68],
            [0, 0.34],
          ]
        : [
            [0.12, 0],
            [0.5, 0],
            [0.88, 0],
            [1, 0.34],
            [1, 0.68],
            [0.74, 1],
            [0.26, 1],
            [0, 0.68],
            [0, 0.34],
          ];
    return points.map(([x, y]) => ({
      x: x * (width - seatWidth),
      y: y * (height - seatHeight),
      width: seatWidth,
      height: seatHeight,
    }));
  }
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    return {
      x:
        width / 2 +
        (width / 2 - seatWidth / 2) * Math.cos(angle) -
        seatWidth / 2,
      y:
        (height - seatHeight) / 2 +
        ((height - seatHeight) / 2) * Math.sin(angle),
      width: seatWidth,
      height: seatHeight,
    };
  });
}
module.exports = { viewport, getSeatLayout };
