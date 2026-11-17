// The pupils' names with their roles during the activity (#188): "Apple
// (Amos)". Shown on screen only: never written into a chat message (those go
// back to the AI as history) and never sent to the AI (ADR 0004).

export type PairNames = Partial<Record<'apple' | 'banana', string>>;

/** "Apple (Amos)", or just "Apple" when the pair checked in without names. */
export const roleName = (performer: 'apple' | 'banana', names: PairNames): string => {
  const role = performer === 'apple' ? 'Apple' : 'Banana';
  const name = names[performer]?.trim();
  return name ? `${role} (${name})` : role;
};

/** The Short Names a pair checked in with (PairSessionData.students), if any. */
export const pairNamesOf = (
  session: { students?: Record<'apple' | 'banana', { shortName: string }> } | null | undefined,
): PairNames =>
  session?.students ? { apple: session.students.apple.shortName, banana: session.students.banana.shortName } : {};
