/**
 * The security print.
 *
 * A guilloche is not a texture, it is a curve: an epitrochoid traced by two
 * rotating radii, drawn many times with the phase walked a little each pass so
 * the passes interfere and produce the moire a printer gets from an engine-turned
 * plate. Drawn as real paths, it is a few kilobytes of geometry that scales to
 * any size without an asset - which is why this is built rather than exported.
 *
 * The parameters come from the holder's own name. Not for novelty: the pattern
 * is the one element of the document that could plausibly be *about* the person
 * rather than *typed by* them, and a pattern derived from their data is the
 * honest version of that. Same name, same rosette, every render, forever. A
 * random one would look identical and mean nothing.
 */

/** FNV-1a. Small, stable across engines, and adequate for choosing integers. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface Rosette {
  /** Closed paths, outermost pass first. */
  paths: string[];
  /** For the draw-on animation: rough path length, so one duration fits all. */
  length: number;
}

const TAU = Math.PI * 2;

/**
 * An epitrochoid rosette.
 *
 * `petals` is R/r and has to be an integer for the curve to close, which is why
 * it is chosen from the hash rather than interpolated: a curve that does not
 * close leaves a visible seam, and on a document a visible seam reads as a
 * rendering bug rather than as a flourish.
 */
export function rosette(seed: string, size: number, passes = 7): Rosette {
  const h = hash(seed || "unissued");
  const petals = 5 + (h % 8); // 5-12
  const inner = 0.52 + ((h >> 4) % 24) / 100; // 0.52-0.75
  const spin = ((h >> 9) % 360) * (Math.PI / 180);
  const radius = size / 2;

  const paths: string[] = [];
  for (let pass = 0; pass < passes; pass += 1) {
    // Each pass rides slightly further out and is rotated a fraction of a petal,
    // which is what makes the passes interfere instead of nesting neatly.
    const scale = 1 - pass * 0.055;
    const phase = spin + (pass * TAU) / (petals * passes * 1.7);
    const r = radius * scale;
    const d: string[] = [];
    const steps = petals * 44;
    for (let i = 0; i <= steps; i += 1) {
      const t = (i / steps) * TAU;
      const x = r * ((1 - inner) * Math.cos(t + phase) + inner * Math.cos(petals * (t + phase)));
      const y = r * ((1 - inner) * Math.sin(t + phase) - inner * Math.sin(petals * (t + phase)));
      d.push(`${i === 0 ? "M" : "L"}${(radius + x).toFixed(2)} ${(radius + y).toFixed(2)}`);
    }
    paths.push(`${d.join("")}Z`);
  }

  return { paths, length: Math.round(radius * petals * 2.6) };
}

export interface Band {
  paths: string[];
  length: number;
}

/**
 * The border band: two sine components beaten against each other, drawn as
 * several phase-shifted passes. This is the ruled guilloche that runs along a
 * data page's edges, and it is the same idea as the rosette unrolled flat.
 */
export function band(seed: string, width: number, height: number, passes = 5): Band {
  const h = hash(`band:${seed || "unissued"}`);
  const f1 = 2 + (h % 5);
  const f2 = 7 + ((h >> 3) % 9);
  const mix = 0.3 + ((h >> 7) % 30) / 100;
  const mid = height / 2;
  const amp = height * 0.42;

  const paths: string[] = [];
  for (let pass = 0; pass < passes; pass += 1) {
    const phase = (pass / passes) * TAU * 0.5;
    const d: string[] = [];
    const steps = Math.max(80, Math.round(width / 3));
    for (let i = 0; i <= steps; i += 1) {
      const x = (i / steps) * width;
      const t = (i / steps) * TAU;
      const y =
        mid +
        amp *
          ((1 - mix) * Math.sin(f1 * t + phase) + mix * Math.sin(f2 * t - phase * 1.6));
      d.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    paths.push(d.join(""));
  }

  return { paths, length: Math.round(width * 1.2) };
}
