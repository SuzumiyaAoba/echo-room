import { pixelLine } from "./art.js";

// Keep the aim continuous, but draw every segment on logical pixel centers.
export function drawWeapon(c, pose, weapon, echo, settings) {
  const ux = Math.cos(pose.angle),
    uy = Math.sin(pose.angle);
  const point = (along, across = 0) => ({
    x: pose.x + ux * along - uy * across,
    y: pose.y - 5 + uy * along + ux * across,
  });
  const line = (a, b, color, width = 1) => {
    const from = point(...a),
      to = point(...b);
    pixelLine(c, from.x, from.y, to.x, to.y, color, width);
  };
  const dark = echo ? "#173a38" : "#17242c";
  const light = echo ? "#b9ffee" : "#fff0cf";
  const color = echo ? "#8be7ce" : weapon.color;
  c.save();
  line([2, 0], [5, 0], dark, 3);
  line([3, 0], [4, 2], echo ? "#60ad9d" : "#a98e6e", 2);
  if (weapon.id === "scatter") {
    line([5, 0], [10, 0], dark, 6);
    line([5, 0], [10, 0], color, 4);
    for (const rib of [6, 8])
      line([rib, -1], [rib, 1], echo ? "#60ad9d" : "#bd7d58");
    line([6, -2], [9, -3], light);
    line([6, 2], [9, 3], echo ? "#60ad9d" : "#ba7e5b");
    line([11, -3], [11, 3], dark, 3);
    line([11, -2], [11, 2], light);
  } else if (weapon.id === "prism") {
    line([5, 0], [10, 0], dark, 4);
    line([5, 0], [10, 0], color, 2);
    line([9, 0], [12, 0], color, 3);
    const lens = [
      [7, 0],
      [10, -3],
      [14, 0],
      [10, 3],
    ];
    for (const [shade, width] of [
      [dark, 3],
      [light, 1],
    ])
      for (let i = 0; i < lens.length; i++)
        line(lens[i], lens[(i + 1) % lens.length], shade, width);
    line([10, -1], [12, 0], echo ? "#d6fff1" : "#e8ddff");
  } else {
    line([5, 0], [12, 0], dark, 4);
    line([5, 0], [12, 0], color, 2);
    line([6, -1], [12, -1], light);
    line([12, 0], [13, 0], light);
  }
  if (settings.flashes && pose.muzzle) {
    if (weapon.id === "scatter")
      for (const side of [-1, 0, 1]) line([13, side], [16, side * 3], light);
    else if (weapon.id === "prism") {
      const spark = [
        [14, 0],
        [16, -2],
        [19, 0],
        [16, 2],
      ];
      for (let i = 0; i < spark.length; i++)
        line(spark[i], spark[(i + 1) % spark.length], light);
    } else {
      line([14, 0], [17, 0], light);
      line([15, -1], [15, 1], color);
    }
  }
  c.restore();
}
