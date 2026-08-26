const Complex = Object.freeze({
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  multiply: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
  divide(a, b) {
    const denominator = b[0] ** 2 + b[1] ** 2;
    if (denominator <= Number.EPSILON) throw new Error('Cannot divide by zero complex value');
    return [(a[0] * b[0] + a[1] * b[1]) / denominator, (a[1] * b[0] - a[0] * b[1]) / denominator];
  },
  magnitude: value => Math.hypot(value[0], value[1]),
  fromPolar: (magnitude, phase) => [magnitude * Math.cos(phase), magnitude * Math.sin(phase)],
});

export { Complex };
