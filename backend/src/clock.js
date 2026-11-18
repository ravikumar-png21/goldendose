// The backend asks this clock for the time instead of asking the computer directly.
// Normally it just gives the real time. The automatic tests replace it with a pretend
// clock, so they can check rules like "30 minutes late" without waiting 30 minutes.
// (The prototype has the same idea: its "Jump ahead 10 minutes" button.)

// The test backend used to make pictures and videos can also run at a pretend time of day:
// CLOCK_OFFSET_MS shifts the clock (see setDemoClock in e2e/scripts/lib.js). Normally it's 0.
const offset = Number(process.env.CLOCK_OFFSET_MS ?? 0);

export const clock = {
  now: () => new Date(Date.now() + offset),
};
