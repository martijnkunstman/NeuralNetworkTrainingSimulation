// src/Vector.ts
export class Vector {
    x: number;
    y: number;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    add(v: Vector): Vector {
        this.x += v.x;
        this.y += v.y;
        return this;
    }

    sub(v: Vector): Vector {
        this.x -= v.x;
        this.y -= v.y;
        return this;
    }

    mult(n: number): Vector {
        this.x *= n;
        this.y *= n;
        return this;
    }

    div(n: number): Vector {
        this.x /= n;
        this.y /= n;
        return this;
    }

    mag(): number {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    limit(max: number): Vector {
        if (this.mag() > max) {
            const normalized = this.getNormalized();
            this.x = normalized.x * max;
            this.y = normalized.y * max;
        }
        return this;
    }

    getNormalized(): Vector {
        const m = this.mag();
        if (m !== 0) {
            return new Vector(this.x / m, this.y / m);
        }
        return new Vector(0, 0);
    }

    heading(): number {
        return Math.atan2(this.y, this.x);
    }

    /**
     * Returns a NEW rotated vector (non-mutating).
     * Use rotateInPlace() if you need to mutate this vector.
     */
    rotated(angle: number): Vector {
        const newHeading = this.heading() + angle;
        const mag = this.mag();
        return new Vector(Math.cos(newHeading) * mag, Math.sin(newHeading) * mag);
    }

    /**
     * Rotates this vector in-place (mutating).
     */
    rotateInPlace(angle: number): Vector {
        const newHeading = this.heading() + angle;
        const mag = this.mag();
        this.x = Math.cos(newHeading) * mag;
        this.y = Math.sin(newHeading) * mag;
        return this;
    }

    dist(v: Vector): number {
        const dx = this.x - v.x;
        const dy = this.y - v.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    copy(): Vector {
        return new Vector(this.x, this.y);
    }

    static fromAngle(angle: number, length: number = 1): Vector {
        return new Vector(Math.cos(angle) * length, Math.sin(angle) * length);
    }
}
