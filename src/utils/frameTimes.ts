// The AI is sent stills, not video, so it can't tell how long a position was
// held unless it knows when each still was taken (#139).

/**
 * A note for the AI giving each frame's time in the clip, or '' when any
 * frame's time is unknown (still images, or frames kept from an older chat).
 */
export const frameTimesNote = (times: (number | undefined)[] | undefined): string => {
  if (!times || times.length < 2 || times.some(t => t === undefined || !Number.isFinite(t))) return '';
  const secs = times as number[];
  const span = Math.max(...secs) - Math.min(...secs);
  const list = secs.map((t, i) => `${i + 1}: ${t.toFixed(1)}s`).join(', ');
  return `\n\n[FRAME TIMES] The ${secs.length} performance frames are in order. Seconds into the clip for each: ${list}. `
    + `They span ${span.toFixed(1)}s. For a criterion about time, such as holding a position for 3 seconds, `
    + `go by these times: the position must be seen in frames at least that far apart. `
    + `If the frames cannot show it, mark that criterion ⚠️ and say the hold could not be timed.`;
};
