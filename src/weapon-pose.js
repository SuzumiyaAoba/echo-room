export const SHOT_POSES = Object.freeze({
  needle: Object.freeze({ seconds: 0.1, recoil: 1 }),
  scatter: Object.freeze({ seconds: 0.14, recoil: 2 }),
  prism: Object.freeze({ seconds: 0.12, recoil: 1 }),
});

// The player records one frame per fixed tick. Echoes play those same frames;
// only frames they have already emitted can move the hand-held weapon.
export function weaponPose(game, actor) {
  const pose = {
    x: actor.x,
    y: actor.y,
    angle: actor.angle,
    age: null,
    recoil: 0,
    muzzle: false,
  };
  if (actor.type === "stolen" || !["combat", "cleared"].includes(game.mode))
    return pose;
  const timing = SHOT_POSES[game.weapon.id];
  if (!timing) return pose;
  const echo = actor.type === "echo";
  const frames = (echo ? actor.frames : game.history) || [];
  const last = echo
    ? Math.min(actor.frame ?? -1, frames.length - 1)
    : frames.length - 1;
  for (
    let index = last;
    index >= Math.max(0, last - Math.ceil(timing.seconds * 60));
    index--
  ) {
    const shot = frames[index];
    if (!shot.fire) continue;
    const age = echo ? actor.elapsed - (index + 1) / 60 : (last - index) / 60;
    if (!Number.isFinite(age) || age < -1e-7 || age >= timing.seconds)
      return pose;
    pose.age = Math.max(0, age);
    pose.recoil =
      age < timing.seconds * 0.35
        ? timing.recoil
        : age < timing.seconds * 0.7
          ? 1
          : 0;
    const angle = Number.isFinite(shot.angle) ? shot.angle : actor.angle;
    pose.x -= Math.round(Math.cos(angle) * pose.recoil);
    pose.y -= Math.round(Math.sin(angle) * pose.recoil);
    pose.muzzle = pose.age < 2 / 60 - 1e-7;
    return pose;
  }
  return pose;
}
