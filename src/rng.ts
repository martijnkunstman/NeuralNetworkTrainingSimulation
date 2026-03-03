// src/rng.ts
// Global seeded PRNG for deterministic simulation.
// Uses Mulberry32 — same algorithm as Track.ts's local seededRandom().
// All Math.random() calls in AI.ts, Boid.ts, and Track.ts are replaced with random() from here.

let _seed: number = 42;
let _state: number = 42;

/**
 * Seed the global PRNG.
 * If seed === 0, generates a fresh random seed (the only intentional Math.random() use).
 * Returns the actual seed used — important when seed=0 so callers can record it.
 */
export function seedRng(seed: number): number {
    if (seed === 0) {
        seed = Math.floor(Math.random() * 0xFFFFFFFF) + 1;
    }
    _seed = seed;
    _state = seed;
    return seed;
}

/** Returns the seed that was passed to seedRng() (not the advancing state). */
export function getActiveSeed(): number {
    return _seed;
}

/** Mulberry32 PRNG — returns a float in [0, 1). Drop-in for Math.random(). */
export function random(): number {
    let t = (_state += 0x6D2B79F5);
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
