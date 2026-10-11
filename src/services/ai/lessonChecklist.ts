// A gymnastics lesson where the teacher set the cues: the AI grades those cues
// and nothing else (#150). Both AI services put this in place of the skill's
// checklist. FMS skills always use their fixed checklist.

export const lessonChecklistText = (skillName: string, items: string[]): string =>
  `*** THE TEACHER'S CUES FOR ${skillName} IN THIS LESSON ***
The teacher chose these ${items.length} cues for this lesson. Grade ONLY these ${items.length}, in this order, and no other criteria:

${items.map((item, i) => `${i + 1}. ${item}`).join('\n')}

Write ONE checklist table with exactly ${items.length} rows, naming each cue as it is written above, each marked ✅, ❌ or ⚠️ with frame evidence. Do not mark any other line of your reply with ✅, ❌ or ⚠️.
Proficiency level, judged on these ${items.length} cues only: Competent if every cue is ✅; Beginning if fewer than half are ✅; otherwise Developing. Accomplished only if every cue is ✅ and the performance is of exceptional quality.
(END OF CHECKLIST)`;
