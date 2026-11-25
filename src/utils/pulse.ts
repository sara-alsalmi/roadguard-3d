/**
 * One shared animation clock, updated once per frame by the simulation engine.
 * Ellipse semi-axes read the SAME value in a frame, so semiMajor >= semiMinor always holds.
 */
export const clockMs = { t: 0 };
export const ring = (base: number, amp: number, period: number) => () => base + amp * Math.sin(clockMs.t / period);
