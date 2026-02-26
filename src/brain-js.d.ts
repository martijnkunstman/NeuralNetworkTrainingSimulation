// Type declarations for brain.js (loaded as global via <script> tag)

export interface NeuralNetworkOptions {
    hiddenLayers: number[];
    activation: string;
    learningRate?: number;
    errorThresh?: number;
    iterations?: number;
    inputSize?: number;
    outputSize?: number;
}

export interface NeuralNetworkLayer {
    weights?: number[][];
    biases?: number[];
}

export interface NeuralNetworkJSON {
    type: string;
    options: NeuralNetworkOptions;
    layers: NeuralNetworkLayer[];
    inputLookup?: Record<string, number>;
    inputLookupLength?: number;
    outputLookup?: Record<string, number>;
    outputLookupLength?: number;
}

export interface NeuralNetwork {
    train(data: Array<{ input: number[], output: number[] }>, options?: {
        iterations?: number;
        errorThresh?: number;
        log?: boolean;
        learningRate?: number;
    }): void;
    run(input: number[]): number[];
    toJSON(): NeuralNetworkJSON;
    fromJSON(json: NeuralNetworkJSON): void;
}

declare global {
    const brain: {
        NeuralNetwork: new (options?: NeuralNetworkOptions) => NeuralNetwork;
    };
}
