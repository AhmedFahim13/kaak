// Test helper: a bit-exact port of kotlin.random.Random(seed: Int) (XorWowRandom), so the
// ported tests draw the same numbers as the Kotlin tests with the same seeds.
// Implements nextInt(), nextInt(until), nextInt(from, until), nextBits, nextDouble, nextFloat,
// nextBoolean; clone() and toJSON()/fromJSON() for the persistence tests.

export class KotlinRandom {
  constructor(seed1, seed2 = seed1 >> 31, state = null) {
    if (state) {
      [this.x, this.y, this.z, this.w, this.v, this.addend] = state;
      return;
    }
    seed1 |= 0; seed2 |= 0;
    this.x = seed1;
    this.y = seed2;
    this.z = 0;
    this.w = 0;
    this.v = ~seed1;
    this.addend = (seed1 << 10) ^ (seed2 >>> 4);
    if ((this.x | this.y | this.z | this.w | this.v) === 0) throw new Error('Initial state must have at least one non-zero element.');
    // some trivial seeds can produce several values with zeroes in upper bits, so we discard first 64
    for (let i = 0; i < 64; i++) this.nextIntRaw();
  }

  nextIntRaw() {
    let t = this.x;
    t ^= t >>> 2;
    this.x = this.y;
    this.y = this.z;
    this.z = this.w;
    const v0 = this.v;
    this.w = v0;
    t = (t ^ (t << 1)) ^ v0 ^ (v0 << 4);
    this.v = t | 0;
    this.addend = (this.addend + 362437) | 0;
    return (t + this.addend) | 0;
  }

  nextBits(bitCount) {
    // takeUpperBits: ushr(32 - bitCount) and (-bitCount).shr(31)
    if (bitCount === 0) return 0;
    return this.nextIntRaw() >>> (32 - bitCount) | 0;
  }

  nextInt(from, until) {
    if (from === undefined) return this.nextIntRaw();
    if (until === undefined) { until = from; from = 0; }
    if (!(until > from)) throw new Error(`Random range is empty: [${from}, ${until}).`);
    const n = (until - from) | 0;
    let rnd;
    if (n > 0 || n === -2147483648) {
      if ((n & -n) === n) {
        const bitCount = 31 - Math.clz32(n);
        rnd = this.nextBits(bitCount);
      } else {
        let v, bits;
        do {
          bits = this.nextIntRaw() >>> 1;
          v = bits % n;
        } while (((bits - v + (n - 1)) | 0) < 0);
        rnd = v;
      }
      return from + rnd;
    }
    for (;;) {
      const r = this.nextIntRaw();
      if (r >= from && r < until) return r;
    }
  }

  nextDouble() {
    const hi26 = this.nextBits(26);
    const low27 = this.nextBits(27);
    return (hi26 * 134217728 + low27) / 9007199254740992; // (hi << 27 + low) / 2^53
  }

  nextFloat() { return this.nextBits(24) / 16777216; }
  nextBoolean() { return this.nextBits(1) !== 0; }

  clone() { return new KotlinRandom(0, 0, [this.x, this.y, this.z, this.w, this.v, this.addend]); }
  toJSON() { return [this.x, this.y, this.z, this.w, this.v, this.addend]; }
  static fromJSON(state) { return new KotlinRandom(0, 0, state); }
}

/** Kotlin's `Random(seed)`. */
export const Random = (seed) => new KotlinRandom(seed);
