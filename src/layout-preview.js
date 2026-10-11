// Native SVG uses the actual, already-reserved collision tiles. The route card
// describes the map in text; the decorative miniature adds no input target.
export function layoutThumbnail(layout) {
  const paths = ["", "", "", ""];
  layout.tiles.forEach((row, y) =>
    row.forEach((cell, x) => {
      if (cell) paths[cell] += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return `<svg class="route-map" aria-hidden="true" viewBox="0 0 28 17" width="84" height="51" shape-rendering="crispEdges"><rect width="28" height="17" fill="#1b2e35"/><path d="${paths[1]}" fill="#627c7e"/><path d="${paths[2]}" fill="#b39c74"/><path d="${paths[3]}" fill="#ead49c"/><rect x="13" y="13" width="2" height="1" fill="#87e0c9"/></svg>`;
}
