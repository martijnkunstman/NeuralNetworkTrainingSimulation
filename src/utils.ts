// src/utils.ts
import { Vector } from './Vector';

export interface Intersection {
    x: number;
    y: number;
    offset: number; // distance ratio 0-1
}

// Line segment intersection
// A-B is line 1, C-D is line 2
export function getIntersection(A: Vector, B: Vector, C: Vector, D: Vector): Intersection | null {
    const tTop = (D.x - C.x) * (A.y - C.y) - (D.y - C.y) * (A.x - C.x);
    const uTop = (C.y - A.y) * (A.x - B.x) - (C.x - A.x) * (A.y - B.y);
    const bottom = (D.y - C.y) * (B.x - A.x) - (D.x - C.x) * (B.y - A.y);

    if (bottom !== 0) {
        const t = tTop / bottom;
        const u = uTop / bottom;

        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return {
                x: A.x + (t * (B.x - A.x)),
                y: A.y + (t * (B.y - A.y)),
                offset: t
            };
        }
    }
    return null;
}
