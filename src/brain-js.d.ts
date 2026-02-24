declare module './brain-browser.min.js' {
    export class NeuralNetwork {
        constructor(options?: any);
        train(data: any[], options?: any): void;
        run(input: number[] | object): number[] | object;
        toJSON(): any;
        fromJSON(json: any): void;
    }
}
