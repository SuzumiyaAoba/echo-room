// The recorded route is also the next echo's actual replay. It is read from
// the existing fixed-step history, never predicted from speed or player input.
import { echoPlaybackFrames, rewindsEchoes } from "./echo-playback.js";

export function echoRecording(game) {
  let frames = game.history;
  if (
    !Array.isArray(frames) ||
    frames.some((f) => !Number.isFinite(f.x) || !Number.isFinite(f.y))
  )
    return null;
  frames = echoPlaybackFrames(game.run, frames);
  const points = frames.map((f) => ({ x: f.x, y: f.y }));
  const shots = frames.flatMap((f, frame) =>
    f.fire && Number.isFinite(f.angle)
      ? [{ x: f.x, y: f.y, angle: f.angle, frame }]
      : [],
  );
  return {
    available:
      ["combat", "cleared"].includes(game.mode) &&
      game.player.echoCharges > 0 &&
      frames.length >= 24,
    frameCount: frames.length,
    seconds: frames.length / 60,
    origin: points[0] || null,
    end: points.at(-1) || null,
    points,
    shots,
    ...(rewindsEchoes(game.run) ? { playback: "reverse" } : {}),
  };
}

export function recordingLabel(recording) {
  return `${recording?.playback === "reverse" ? "逆再生" : "録画"} ${(Math.floor((recording?.frameCount || 0) / 6) / 10).toFixed(1)}秒`;
}
