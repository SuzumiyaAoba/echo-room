import { echoLifetime } from "./echo-feedback.js";

export function drawEchoLifetime(c, echo, duration) {
  const life = echoLifetime(echo, duration);
  if (!life) return;
  const x = Math.round(echo.x) - 8,
    y = Math.round(echo.y) + 16;
  c.save();
  c.globalAlpha = 1;
  c.fillStyle = "#10212b";
  c.fillRect(x, y, 16, 3);
  c.fillStyle = "#31534d";
  c.fillRect(x + 1, y + 1, 14, 1);
  c.fillStyle = life.urgent ? "#f1bb82" : "#8be7ce";
  c.fillRect(x + 1, y + 1, Math.max(1, Math.ceil(life.fraction * 14)), 1);
  c.restore();
}
