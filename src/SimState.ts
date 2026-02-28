// src/SimState.ts
// Shared mutable state accessible by all panels and main.ts

import type { GeneticAlgorithm } from './AI';
import type { Track } from './Track';

export interface Camera {
    tx: number; // translation X in screen pixels
    ty: number; // translation Y in screen pixels
    scale: number;
}

export interface SimState {
    ga: GeneticAlgorithm | null;
    track: Track | null;
    simulationCanvas: HTMLCanvasElement | null;
    camera: Camera;
    populationSize: number;
    isFastTraining: boolean;
    autoRandomizeTrack: boolean;
    randomizeInterval: number;
    fitnessHistory: number[];
    aliveHistory: number[];
    diversityHistory: number[];
    fps: number;
    frameCount: number;
    lastFpsTime: number;
}

export const simState: SimState = {
    ga: null,
    track: null,
    simulationCanvas: null,
    camera: { tx: 0, ty: 0, scale: 1 },
    populationSize: 50,
    isFastTraining: false,
    autoRandomizeTrack: false,
    randomizeInterval: 10,
    fitnessHistory: [],
    aliveHistory: [],
    diversityHistory: [],
    fps: 0,
    frameCount: 0,
    lastFpsTime: performance.now(),
};
