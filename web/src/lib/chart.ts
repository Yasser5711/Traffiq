// Round a max value up to a "nice" axis maximum.
export function niceMax(v: number) {
  const e = Math.pow(10, Math.floor(Math.log10(Math.max(1, v))));
  const f = v / e;
  for (const s of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (f <= s) return s * e;
  return 10 * e;
}

// Monotone cubic interpolation: smooth, never overshoots the data.
export function monoPath(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n < 2) return '';
  const dx: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = xs[i + 1]! - xs[i]!;
    m[i] = (ys[i + 1]! - ys[i]!) / dx[i]!;
  }
  const t: number[] = [m[0]!];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1]! * m[i]! <= 0) t[i] = 0;
    else t[i] = (3 * (dx[i - 1]! + dx[i]!)) / ((2 * dx[i]! + dx[i - 1]!) / m[i - 1]! + (dx[i]! + 2 * dx[i - 1]!) / m[i]!);
  }
  t[n - 1] = m[n - 2]!;
  const f = (v: number) => v.toFixed(1);
  let d = 'M' + f(xs[0]!) + ',' + f(ys[0]!);
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i]! / 3;
    d += `C${f(xs[i]! + h)},${f(ys[i]! + h * t[i]!)} ${f(xs[i + 1]! - h)},${f(ys[i + 1]! - h * t[i + 1]!)} ${f(xs[i + 1]!)},${f(ys[i + 1]!)}`;
  }
  return d;
}
