// src/panels/NetworkRenderer.ts
// Renders a brain.js neural network onto a 2D canvas context.
// Extracted from AI.ts to keep genetic-algorithm logic separate from visualization.

import type { Boid } from '../Boid';
import type { NeuralNetworkJSON } from '../brain-js';

/**
 * Derive the network topology (layer sizes) from the network JSON.
 * brain.js JSON structure: layers[0] is an EMPTY placeholder for input layer.
 * layers[1] is first HIDDEN layer with weights[hiddenNodeIndex][inputNodeIndex].
 */
function deriveTopology(json: NeuralNetworkJSON): number[] {
    const topology: number[] = [];

    // Input layer size from first hidden layer's weights (layer 1)
    if (json.layers[1]?.weights?.[0]) {
        topology.push(json.layers[1].weights[0].length);
    }

    // Hidden and output layer sizes from biases (skip layer 0 which is empty)
    for (let i = 1; i < json.layers.length; i++) {
        const layer = json.layers[i];
        if (layer.biases) {
            topology.push(layer.biases.length);
        }
    }

    return topology;
}

/** Draw the neural network topology, weights, and live activations onto ctx. */
export function drawNetwork(ctx: CanvasRenderingContext2D, boid: Boid) {
    const json = boid.network.toJSON();
    if (!json.layers || json.layers.length === 0) return;

    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    const topology = deriveTopology(json);
    if (topology.length === 0) return;

    // Guard against zero/negative canvas size (e.g. ResizeObserver hasn't fired yet)
    if (w < 10 || h < 10) return;

    const layerWidth = w / (topology.length);
    const nodeRadius = Math.max(1, Math.min(14, (h - 100) / (Math.max(...topology) * 2.5)));

    const nodePositions: { x: number, y: number }[][] = [];

    // Calculate positions
    for (let i = 0; i < topology.length; i++) {
        const numNodes = topology[i];
        const x = layerWidth * i + layerWidth / 2;
        const layerPositions = [];
        const gap = (h - 80) / (numNodes + 1);
        const startY = 50;

        for (let j = 0; j < numNodes; j++) {
            const y = startY + (j + 1) * gap;
            layerPositions.push({ x, y });
        }
        nodePositions.push(layerPositions);
    }

    // Draw layer labels
    ctx.fillStyle = '#aaa';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    const layerLabels = ['Input', 'Hidden 1', 'Hidden 2', 'Output'];
    for (let i = 0; i < topology.length; i++) {
        const x = layerWidth * i + layerWidth / 2;
        ctx.fillText(layerLabels[i] || '', x, 20);
        ctx.fillStyle = '#666';
        ctx.font = '9px Arial';
        ctx.fillText(`(${topology[i]} nodes)`, x, 32);
        ctx.fillStyle = '#aaa';
        ctx.font = '11px Arial';
    }

    // Draw connections (weights) with alpha based on weight strength
    for (let i = 1; i < topology.length; i++) {
        const numNodes = topology[i];
        const prevNodes = topology[i - 1];
        const layerData = json.layers[i];

        for (let j = 0; j < numNodes; j++) {
            const targetNode = nodePositions[i][j];
            for (let k = 0; k < prevNodes; k++) {
                const sourceNode = nodePositions[i - 1][k];

                let weight = 0;
                if (layerData && layerData.weights && layerData.weights[j]) {
                    weight = layerData.weights[j][k] || 0;
                }

                const alpha = Math.min(1, Math.abs(weight) / 3);
                if (alpha > 0.02) {
                    ctx.beginPath();
                    ctx.lineWidth = 1 + Math.abs(weight) * 0.5;
                    ctx.strokeStyle = weight > 0
                        ? `rgba(50, 255, 100, ${alpha})`
                        : `rgba(255, 80, 80, ${alpha})`;
                    ctx.moveTo(sourceNode.x, sourceNode.y);
                    ctx.lineTo(targetNode.x, targetNode.y);
                    ctx.stroke();
                }
            }
        }
    }

    // Draw nodes with activation-based coloring
    for (let i = 0; i < nodePositions.length; i++) {
        for (let j = 0; j < nodePositions[i].length; j++) {
            const pos = nodePositions[i][j];

            let activation = 0.5;
            if (i === 0 && boid.lastInputs[j] !== undefined) {
                activation = boid.lastInputs[j];
            } else if (i === nodePositions.length - 1 && boid.lastOutputs[j] !== undefined) {
                activation = boid.lastOutputs[j];
            } else if (i > 0 && i < nodePositions.length - 1) {
                const hiddenLayerIdx = i - 1;
                if (boid.lastHiddenActivations[hiddenLayerIdx]?.[j] !== undefined) {
                    activation = boid.lastHiddenActivations[hiddenLayerIdx][j];
                }
            }

            if (activation > 0.6) {
                ctx.shadowBlur = 20;
                ctx.shadowColor = `rgba(0, 255, 200, ${activation})`;
            } else if (activation < 0.4) {
                ctx.shadowBlur = 10;
                ctx.shadowColor = `rgba(255, 100, 100, ${1 - activation})`;
            }

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, nodeRadius, 0, Math.PI * 2);

            let r, g, b;
            if (activation < 0.5) {
                const t = activation * 2;
                r = Math.floor(50 * (1 - t) + 50 * t);
                g = Math.floor(100 * (1 - t) + 200 * t);
                b = Math.floor(200 * (1 - t) + 100 * t);
            } else {
                const t = (activation - 0.5) * 2;
                r = Math.floor(50 * (1 - t) + 255 * t);
                g = Math.floor(200 * (1 - t) + 200 * t);
                b = Math.floor(100 * (1 - t) + 50 * t);
            }
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.fill();

            ctx.shadowBlur = 0;

            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 8px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(activation.toFixed(2), pos.x, pos.y);

            ctx.fillStyle = '#888';
            ctx.font = '8px Arial';
            ctx.textBaseline = 'top';
            if (i === 0) {
                const sensorLabels = ['L', 'FL', 'F', 'FR', 'R'];
                ctx.fillText(sensorLabels[j] || `S${j + 1}`, pos.x, pos.y + nodeRadius + 2);
            } else if (i === nodePositions.length - 1) {
                const outputLabels = ['Thr', 'Str'];
                ctx.fillText(outputLabels[j] || `O${j + 1}`, pos.x, pos.y + nodeRadius + 2);
            }
        }
    }
}
