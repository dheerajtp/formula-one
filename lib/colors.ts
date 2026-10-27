/** Team accent colours used for cars, bars and legends. Approximate to each livery. */
export const TEAM_COLORS: Record<string, string> = {
  mercedes: "#27F4D2",
  ferrari: "#FF2B2B",
  red_bull: "#3671C6",
  mclaren: "#FF8700",
  rb: "#6692FF",
  alpine: "#FF87BC",
  haas: "#E8E8E8",
  audi: "#52E252",
  williams: "#64C4FF",
  aston_martin: "#00857C",
  cadillac: "#8B93A1",
};

export const FALLBACK_COLOR = "#9CA3AF";

export function teamColor(constructorId: string): string {
  return TEAM_COLORS[constructorId] ?? FALLBACK_COLOR;
}

/** Readable text colour for a chip painted with `bg`. */
export function textOn(bg: string): string {
  const hex = bg.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = [r, g, b].map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return luminance > 0.45 ? "#0a0a0a" : "#ffffff";
}
