import { bitmap } from "../art.js";

export function logoUrl() {
  const chars = {
    E: ["yyyyy", "y....", "y....", "yyyy.", "y....", "y....", "yyyyy"],
    C: [".yyyy", "y....", "y....", "y....", "y....", "y....", ".yyyy"],
    H: ["y...y", "y...y", "y...y", "yyyyy", "y...y", "y...y", "y...y"],
    O: [".yyy.", "y...y", "y...y", "y...y", "y...y", "y...y", ".yyy."],
    L: ["y....", "y....", "y....", "y....", "y....", "y....", "yyyyy"],
    M: ["y...y", "yy.yy", "y.y.y", "y...y", "y...y", "y...y", "y...y"],
  };
  const el = document.createElement("canvas");
  el.width = 96;
  el.height = 64;
  const c = el.getContext("2d");
  ["ECHO", "LOOM"].forEach((word, y) =>
    [...word].forEach((ch, x) =>
      bitmap(c, chars[ch], x * 24, y * 34, { y: y ? "#80d4bd" : "#ebdbb5" }, 4),
    ),
  );
  return el.toDataURL();
}
