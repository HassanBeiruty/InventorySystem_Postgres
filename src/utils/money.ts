/** Parse a typed dollar amount ("12", "12.5", ".5"). Returns NaN for anything else. */
export const parseMoney = (text: string): number => {
  const trimmed = text.trim();
  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === "" || trimmed === ".") return NaN;
  return Number(trimmed);
};
