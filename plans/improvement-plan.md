# Neural Network Training Simulation — Improvement Plan

## Overview

This plan addresses all issues and improvement opportunities identified in the codebase analysis. Tasks are organized by priority and grouped into logical phases for implementation.

---

## Phase 1: High Priority — Genetic Algorithm Enhancement

### 1.1 Implement Crossover Operator

**Problem:** The current [`nextGeneration()`](../src/AI.ts:48) uses pure elitism — only the single best boid survives. This is a hill-climbing strategy that can get stuck in local optima.

**Solution:** Add a crossover operator that combines weights from two parent networks.

**Files to modify:**
- [`src/AI.ts`](../src/AI.ts)

**Implementation steps:**
1. Add a `crossover(parent1JSON, parent2JSON)` method that:
   - Iterates through all weight and bias arrays
   - For each weight/bias, randomly selects from either parent (uniform crossover) OR
   - Uses arithmetic crossover: `childWeight = (p1Weight + p2Weight) / 2`
2. Modify `nextGeneration()` to:
   - Select top-N boids as parents (e.g., top 5)
   - Use tournament selection or roulette wheel selection to pick parent pairs
   - Apply crossover to create children
   - Apply mutation to children

**New selection strategy:**
```
- Elite: Keep top 1 unchanged
- Top 20%: Slightly mutated copies of elite
- Remaining 80%: Crossover children from top 5, then mutate
```

---

### 1.2 Add Tournament Selection

**Problem:** No structured parent selection mechanism exists.

**Solution:** Implement tournament selection for choosing parents.

**Files to modify:**
- [`src/AI.ts`](../src/AI.ts)

**Implementation:**
```typescript
selectParent(tournamentSize: number = 3): Boid {
    let best: Boid | null = null;
    for (let i = 0; i < tournamentSize; i++) {
        const idx = Math.floor(Math.random() * this.boids.length);
        const candidate = this.boids[idx];
        if (!best || candidate.fitness > best.fitness) {
            best = candidate;
        }
    }
    return best!;
}
```

---

## Phase 2: Medium Priority — Type Safety & Module System

### 2.1 Fix brain.js Type Declarations

**Problem:** [`brain-js.d.ts`](../src/brain-js.d.ts) declares a module path, but `brain` is actually loaded as a global variable via `<script>` tag in [`index.html`](../index.html:31).

**Solution:** Create proper global type declarations.

**Files to modify:**
- [`src/brain-js.d.ts`](../src/brain-js.d.ts)
- [`src/Boid.ts`](../src/Boid.ts)

**Implementation:**
1. Update [`src/brain-js.d.ts`](../src/brain-js.d.ts):
```typescript
interface NeuralNetworkOptions {
    hiddenLayers: number[];
    activation: string;
}

interface NeuralNetwork {
    constructor(options?: NeuralNetworkOptions): NeuralNetwork;
    train(data: Array<{input: number[], output: number[]}>, options?: any): void;
    run(input: number[]): number[];
    toJSON(): NeuralNetworkJSON;
    fromJSON(json: NeuralNetworkJSON): void;
}

interface NeuralNetworkJSON {
    layers: Array<{
        weights?: number[][];
        biases?: number[];
    }>;
}

declare const brain: {
    NeuralNetwork: new (options?: NeuralNetworkOptions) => NeuralNetwork;
};
```

2. Remove `declare const brain: any;` from [`src/Boid.ts`](../src/Boid.ts:4) since the global declaration covers it.

---

### 2.2 Replace `any` Types with Proper Interfaces

**Problem:** Pervasive use of `any` bypasses TypeScript's type safety.

**Files to modify:**
- [`src/AI.ts`](../src/AI.ts)
- [`src/Boid.ts`](../src/Boid.ts)

**Implementation:**
1. Create a `NeuralNetworkJSON` interface (see 2.1)
2. Update [`mutate()`](../src/AI.ts:79) signature:
```typescript
mutate(networkJSON: NeuralNetworkJSON, rate: number): void
```
3. Update [`update()`](../src/AI.ts:34) signature:
```typescript
update(track: Track): void
```
4. Update [`network`](../src/Boid.ts:36) property:
```typescript
network: NeuralNetwork;
```

---

### 2.3 Make Network Topology Dynamic in Visualizer

**Problem:** [`drawNetwork()`](../src/AI.ts:119) hardcodes `topology = [5, 4, 4, 2]` instead of deriving it from the actual network.

**Solution:** Extract topology from the network JSON structure.

**Files to modify:**
- [`src/AI.ts`](../src/AI.ts)

**Implementation:**
```typescript
function deriveTopology(json: NeuralNetworkJSON): number[] {
    const topology: number[] = [];
    
    // Input layer size from first hidden layer's weights
    if (json.layers[0]?.weights?.[0]) {
        topology.push(json.layers[0].weights[0].length);
    }
    
    // Hidden and output layer sizes from biases
    for (const layer of json.layers) {
        if (layer.biases) {
            topology.push(layer.biases.length);
        }
    }
    
    return topology;
}
```

---

## Phase 3: Low Priority — Code Cleanup

### 3.1 Remove Dead Code

**Problem:** [`mapRange()`](../src/utils.ts:33) is exported but never used.

**Solution:** Either remove it or document it as a utility for future use.

**Files to modify:**
- [`src/utils.ts`](../src/utils.ts)

**Decision:** Remove the function since it's unused and trivial to reimplement if needed.

---

### 3.2 Remove Duplicate brain-browser.min.js

**Problem:** [`brain-browser.min.js`](../src/brain-browser.min.js) exists in both `src/` and `public/`. Only `public/` is served.

**Solution:** Delete the duplicate in `src/`.

**Files to delete:**
- [`src/brain-browser.min.js`](../src/brain-browser.min.js)

---

### 3.3 Fix Vector Class Mutation Inconsistency

**Problem:** [`rotate()`](../src/Vector.ts:60) returns a new Vector while all other methods mutate `this` in-place.

**Solution:** Make all methods consistent — either all mutate in-place or all return new vectors.

**Files to modify:**
- [`src/Vector.ts`](../src/Vector.ts)
- [`src/Boid.ts`](../src/Boid.ts) (update usages if needed)

**Recommended approach:** Keep mutation for performance but rename methods clearly:
- Keep: `add()`, `sub()`, `mult()`, `div()` (mutating)
- Rename `rotate()` to `rotateNew()` or make it mutate in-place

**Alternative:** Make all methods return new vectors (immutable pattern) — safer but may require more changes.

---

## Phase 4: Optional Enhancements

### 4.1 Add Track Variation Between Generations

**Problem:** The track is static, limiting generalization of evolved brains.

**Solution:** Add track randomization options.

**Files to modify:**
- [`src/Track.ts`](../src/Track.ts)
- [`src/main.ts`](../src/main.ts)

**Implementation:**
1. Add a `seed` parameter to [`generateSimpleLoopedTrack()`](../src/Track.ts:16)
2. Use seeded random for noise generation
3. Add UI option to randomize track every N generations

---

### 4.2 Add Population Diversity Metrics

**Problem:** No visibility into population diversity, which affects evolution quality.

**Solution:** Track and display diversity metrics.

**Files to modify:**
- [`src/AI.ts`](../src/AI.ts)
- [`index.html`](../index.html)
- [`style.css`](../style.css)

**Implementation:**
1. Add method to calculate average pairwise distance between network weights
2. Display diversity score in UI
3. Warn if diversity drops below threshold

---

### 4.3 Add Export/Import for Trained Brains

**Problem:** Users can only persist to localStorage, which is limited and browser-specific.

**Solution:** Add JSON file export/import functionality.

**Files to modify:**
- [`src/main.ts`](../src/main.ts)
- [`index.html`](../index.html)

**Implementation:**
1. Add "Export Brain" button that downloads `brain-gen{N}-fitness{F}.json`
2. Add "Import Brain" button with file picker
3. Validate imported JSON structure before loading

---

## Implementation Order

```
Phase 1 (High Priority)
├── 1.1 Implement Crossover Operator
└── 1.2 Add Tournament Selection

Phase 2 (Medium Priority)
├── 2.1 Fix brain.js Type Declarations
├── 2.2 Replace any Types
└── 2.3 Dynamic Network Topology

Phase 3 (Low Priority)
├── 3.1 Remove Dead Code
├── 3.2 Remove Duplicate File
└── 3.3 Fix Vector Mutation Inconsistency

Phase 4 (Optional)
├── 4.1 Track Variation
├── 4.2 Diversity Metrics
└── 4.3 Export/Import Brains
```

---

## Testing Strategy

After each phase:
1. Run `npm run build` to verify TypeScript compilation
2. Run `npm run dev` and verify simulation still works
3. Test fast training mode for at least 50 generations
4. Verify localStorage persistence still functions
5. Check neural network visualizer renders correctly

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Crossover breaks existing evolved brains | Keep elite unchanged; only apply crossover to new children |
| Type changes break runtime | Use gradual typing; test after each file |
| Vector changes break physics | Add unit tests for Vector operations before refactoring |
| Track variation invalidates saved brains | Make track variation opt-in via UI toggle |
