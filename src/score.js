import { actIndex } from "./content.js";

// Original eight-bar phrases. Notes are semitones above each score's root;
// null is a deliberate breath, rather than a randomly missing note.
export const SCORES = {
  harbor: {
    name: "潮待ちの岸",
    root: 57,
    bpm: 80,
    meter: 8,
    voice: "felt",
    chords: [
      { bass: 0, notes: [0, 3, 7, 14] },
      { bass: 5, notes: [5, 8, 12, 15] },
      { bass: -4, notes: [-4, 0, 3, 7] },
      { bass: -5, notes: [-5, -1, 2, 5] },
      { bass: 0, notes: [0, 3, 7, 10] },
      { bass: 3, notes: [3, 7, 10, 14] },
      { bass: 5, notes: [5, 8, 12, 15] },
      { bass: -5, notes: [-5, -1, 2, 5] },
    ],
    melody: [
      [0, null, 3, 7, null, 5, 3, null],
      [5, null, 8, 7, null, 5, 3, 0],
      [3, null, 7, 10, null, 7, 3, 2],
      [2, null, -1, 2, null, 5, 2, -1],
      [0, 7, null, 3, 2, null, 0, null],
      [3, 7, null, 10, 7, null, 3, 2],
      [5, null, 8, 12, 8, 5, 3, null],
      [2, 5, 2, -1, 0, null, null, null],
    ],
  },
  garden: {
    name: "硝子に残る風",
    root: 53,
    bpm: 76,
    meter: 6,
    voice: "glass",
    chords: [
      { bass: 0, notes: [0, 4, 7, 11] },
      { bass: 7, notes: [7, 11, 14, 18] },
      { bass: 2, notes: [2, 5, 9, 12] },
      { bass: 5, notes: [5, 9, 12, 16] },
      { bass: 0, notes: [0, 4, 7, 11] },
      { bass: -3, notes: [-3, 0, 4, 7] },
      { bass: 5, notes: [5, 9, 12, 16] },
      { bass: 7, notes: [7, 11, 14, 17] },
    ],
    melody: [
      [7, null, 11, 12, null, 11],
      [7, 11, 14, null, 11, 7],
      [9, null, 5, 2, null, 5],
      [9, 12, null, 16, 12, 9],
      [7, null, 4, 2, 0, null],
      [4, 7, null, 12, 7, 4],
      [5, 9, 12, null, 9, 5],
      [7, null, 11, 14, 12, null],
    ],
  },
  furnace: {
    name: "秒針の海",
    root: 50,
    bpm: 94,
    meter: 8,
    voice: "clock",
    chords: [
      { bass: 0, notes: [0, 3, 7, 14] },
      { bass: -2, notes: [-2, 2, 5, 9] },
      { bass: -5, notes: [-5, -1, 2, 5] },
      { bass: 3, notes: [3, 7, 10, 14] },
      { bass: 0, notes: [0, 3, 7, 10] },
      { bass: 5, notes: [5, 8, 12, 15] },
      { bass: -2, notes: [-2, 2, 5, 9] },
      { bass: -5, notes: [-5, -1, 2, 5] },
    ],
    melody: [
      [0, 7, 3, null, 0, 7, 2, null],
      [2, 9, 5, null, 2, 9, 5, 2],
      [2, -1, 2, 5, null, 2, -1, null],
      [3, 10, 7, 3, null, 7, 10, null],
      [0, 7, 10, 7, 3, null, 2, 0],
      [5, 12, 8, 5, null, 8, 12, null],
      [2, 5, 9, 5, 2, null, 0, -2],
      [2, -1, 2, 5, 0, null, null, null],
    ],
  },
  dawn: {
    name: "明日の窓",
    root: 57,
    bpm: 72,
    meter: 8,
    voice: "felt",
    chords: [
      { bass: 3, notes: [3, 7, 10, 14] },
      { bass: -4, notes: [-4, 0, 3, 7] },
      { bass: 0, notes: [0, 3, 7, 14] },
      { bass: -2, notes: [-2, 2, 5, 9] },
      { bass: 3, notes: [3, 7, 10, 14] },
      { bass: 5, notes: [5, 8, 12, 15] },
      { bass: -4, notes: [-4, 0, 3, 7] },
      { bass: -2, notes: [-2, 2, 5, 9] },
    ],
    melody: [
      [3, null, 7, 10, null, 7, 3, null],
      [0, null, 3, 7, null, 5, 3, 0],
      [0, 7, null, 3, 2, null, 0, null],
      [2, null, 5, 9, null, 7, 5, 2],
      [3, 7, null, 10, 14, null, 10, 7],
      [5, null, 8, 12, null, 8, 5, 3],
      [3, 7, 3, 0, null, 3, 7, null],
      [2, 5, 9, 5, 3, null, null, null],
    ],
  },
};

export function scoreScene(game, paused, screen, profile) {
  if (screen === "victory") return { track: "dawn", mood: "rest", echoes: 0 };
  if (screen === "defeat") return { track: "harbor", mood: "rest", echoes: 0 };
  if (!game)
    return {
      track: profile.victories ? "dawn" : "harbor",
      mood: "rest",
      echoes: 0,
    };
  if (game.practice) return { track: "harbor", mood: "rest", echoes: 0 };
  return {
    track: ["harbor", "garden", "furnace"][actIndex(game.run.stage)],
    mood:
      game.mode !== "combat"
        ? "rest"
        : paused
          ? "pause"
          : game.boss?.hp > 0
            ? "boss"
            : "combat",
    echoes: game.echoes.length,
  };
}

export const beatSeconds = (score) => 60 / score.bpm / 2;
export const noteFrequency = (midi) => 440 * 2 ** ((midi - 69) / 12);

export function scoreNotes(track, step, mood = "rest", echoes = 0) {
  const score = SCORES[track] || SCORES.harbor;
  const beat = beatSeconds(score),
    slot = step % score.meter;
  const bar = Math.floor(step / score.meter) % score.chords.length;
  const chord = score.chords[bar];
  const combat = mood === "combat" || mood === "boss",
    boss = mood === "boss";
  const notes = [];
  const add = (midi, duration, voice, volume, pan = 0, offset = 0) =>
    notes.push({ midi, duration, voice, volume, pan, offset });
  if (slot === 0) {
    for (const [i, n] of chord.notes.slice(0, 3).entries())
      add(
        score.root + n - 12,
        beat * score.meter * 1.05,
        "pad",
        0.036,
        (i - 1) * 0.32,
      );
    add(
      score.root + chord.bass - 12,
      beat * score.meter * 0.85,
      "bass",
      combat ? 0.09 : 0.06,
    );
  }
  const melody = score.melody[bar][slot];
  if (melody !== null) {
    add(
      score.root + melody + 12,
      beat * (score.voice === "glass" ? 2.4 : 1.55),
      score.voice,
      combat ? 0.065 : 0.049,
      score.voice === "glass" ? 0.3 : -0.18,
    );
    if (echoes > 0 && slot % 2 === 0)
      add(score.root + melody, beat * 2.3, "echo", 0.025, 0.48, beat * 0.4);
  }
  if (slot % 2 === 1 && (combat || track === "garden"))
    add(
      score.root + chord.notes[(slot + bar) % chord.notes.length],
      beat * 0.85,
      "pluck",
      combat ? 0.035 : 0.02,
      -0.35,
    );
  if (combat && slot % (boss ? 2 : score.meter === 6 ? 3 : 4) === 0)
    add(34, 0.16, "kick", boss ? 0.13 : 0.1);
  if (combat && slot === Math.floor(score.meter / 2))
    add(74, 0.055, "tick", 0.028, 0.12);
  if (track === "furnace" && slot % 2 === 0)
    add(
      81,
      0.045,
      "tick",
      combat ? 0.015 : 0.008,
      slot % 4 === 0 ? -0.35 : 0.35,
    );
  if (boss && slot % 2 === 1)
    add(score.root + chord.bass - 12, beat * 0.65, "pulse", 0.045, -0.08);
  return notes;
}
