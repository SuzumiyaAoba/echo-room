import { rank } from "./content.js";
import { distance, angleTo } from "./math.js";

export const STORED_LIGHT_LIMIT = 3;
export const RETURN_LIGHT_DAMAGE = 12;

export function storeThreadLight(game, bullet, guard) {
  if (!rank(game.run, "counter")) return null;
  const holders = guard?.holders?.filter((echo) => game.echoes.includes(echo));
  if (!holders?.length) return null;
  const echo = holders.reduce((a, b) =>
    distance(bullet, b) < distance(bullet, a) ? b : a,
  );
  if ((echo.returnStock || 0) >= STORED_LIGHT_LIMIT) return null;
  echo.returnStock = (echo.returnStock || 0) + 1;
  return echo;
}

export const storedLightCount = (game) =>
  game.echoes.reduce((count, echo) => count + (echo.returnStock || 0), 0);

export function releaseStoredLights(game, echo) {
  if (
    game.mode === "dead" ||
    !rank(game.run, "counter") ||
    !game.echoes.includes(echo)
  )
    return 0;
  const count = Math.min(STORED_LIGHT_LIMIT, echo.returnStock || 0);
  if (!count) return 0;
  // Consume before firing so the same echo never discharges its light twice.
  echo.returnStock = 0;
  const targets = game.enemies.filter((enemy) => enemy.hp > 0);
  const nearest = targets.length
    ? targets.reduce((a, b) => (distance(echo, b) < distance(echo, a) ? b : a))
    : null;
  const angle = nearest ? angleTo(echo, nearest) : (echo.angle ?? -Math.PI / 2);
  for (let i = 0; i < count; i++) {
    const ray = game.makeBullet(
      echo,
      angle + (i - (count - 1) / 2) * 0.1,
      RETURN_LIGHT_DAMAGE *
        game.stats.damage *
        (1 + rank(game.run, "echopower") * 0.3),
      240,
      true,
      "#f3d69a",
      0,
      true,
    );
    ray.life = 1.1;
    ray.returnedLight = true;
  }
  game.run.threadReturns = (game.run.threadReturns || 0) + count;
  game.label(echo.x, echo.y - 22, `返し針 ${count}`, "#f3d69a");
  game.sound("counter");
  return count;
}
