/**
 * Theme registry: the only place colours, radius and fonts are defined.
 * Add a theme = add one entry. CSS variables are generated from here
 * (see components/theme-style.tsx); the user's choice is stored on the user doc.
 */
export type Tokens = Record<
  | "background" | "foreground" | "card" | "card-foreground" | "popover" | "popover-foreground"
  | "primary" | "primary-foreground" | "secondary" | "secondary-foreground" | "muted" | "muted-foreground"
  | "accent" | "accent-foreground" | "destructive" | "success" | "warning" | "border" | "input" | "ring"
  | "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5"
  | "sidebar" | "sidebar-foreground" | "sidebar-primary" | "sidebar-primary-foreground"
  | "sidebar-accent" | "sidebar-accent-foreground" | "sidebar-border" | "sidebar-ring",
  string
>;

export interface Theme {
  label: string;
  radius: string;
  light: Tokens;
  dark: Tokens;
}

const calmLight: Tokens = {
  background: "oklch(0.985 0.003 220)",
  foreground: "oklch(0.24 0.02 250)",
  card: "oklch(1 0 0)",
  "card-foreground": "oklch(0.24 0.02 250)",
  popover: "oklch(1 0 0)",
  "popover-foreground": "oklch(0.24 0.02 250)",
  primary: "oklch(0.52 0.09 190)",
  "primary-foreground": "oklch(0.99 0 0)",
  secondary: "oklch(0.955 0.008 220)",
  "secondary-foreground": "oklch(0.3 0.02 250)",
  muted: "oklch(0.955 0.008 220)",
  "muted-foreground": "oklch(0.52 0.02 250)",
  accent: "oklch(0.95 0.02 190)",
  "accent-foreground": "oklch(0.3 0.04 200)",
  destructive: "oklch(0.58 0.2 25)",
  success: "oklch(0.6 0.13 155)",
  warning: "oklch(0.75 0.14 75)",
  border: "oklch(0.91 0.008 230)",
  input: "oklch(0.91 0.008 230)",
  ring: "oklch(0.6 0.08 190)",
  "chart-1": "oklch(0.55 0.09 190)",
  "chart-2": "oklch(0.62 0.12 260)",
  "chart-3": "oklch(0.72 0.13 75)",
  "chart-4": "oklch(0.62 0.15 15)",
  "chart-5": "oklch(0.6 0.1 300)",
  sidebar: "oklch(0.975 0.005 220)",
  "sidebar-foreground": "oklch(0.3 0.02 250)",
  "sidebar-primary": "oklch(0.52 0.09 190)",
  "sidebar-primary-foreground": "oklch(0.99 0 0)",
  "sidebar-accent": "oklch(0.94 0.015 200)",
  "sidebar-accent-foreground": "oklch(0.26 0.03 220)",
  "sidebar-border": "oklch(0.92 0.008 230)",
  "sidebar-ring": "oklch(0.6 0.08 190)",
};

const calmDark: Tokens = {
  background: "oklch(0.18 0.012 250)",
  foreground: "oklch(0.95 0.005 250)",
  card: "oklch(0.215 0.014 250)",
  "card-foreground": "oklch(0.95 0.005 250)",
  popover: "oklch(0.215 0.014 250)",
  "popover-foreground": "oklch(0.95 0.005 250)",
  primary: "oklch(0.72 0.1 190)",
  "primary-foreground": "oklch(0.18 0.02 220)",
  secondary: "oklch(0.27 0.014 250)",
  "secondary-foreground": "oklch(0.95 0.005 250)",
  muted: "oklch(0.27 0.014 250)",
  "muted-foreground": "oklch(0.7 0.015 250)",
  accent: "oklch(0.3 0.03 200)",
  "accent-foreground": "oklch(0.95 0.005 250)",
  destructive: "oklch(0.68 0.18 25)",
  success: "oklch(0.7 0.13 155)",
  warning: "oklch(0.8 0.13 75)",
  border: "oklch(1 0 0 / 10%)",
  input: "oklch(1 0 0 / 14%)",
  ring: "oklch(0.6 0.08 190)",
  "chart-1": "oklch(0.72 0.1 190)",
  "chart-2": "oklch(0.7 0.12 260)",
  "chart-3": "oklch(0.8 0.13 75)",
  "chart-4": "oklch(0.7 0.15 15)",
  "chart-5": "oklch(0.7 0.1 300)",
  sidebar: "oklch(0.2 0.013 250)",
  "sidebar-foreground": "oklch(0.92 0.005 250)",
  "sidebar-primary": "oklch(0.72 0.1 190)",
  "sidebar-primary-foreground": "oklch(0.18 0.02 220)",
  "sidebar-accent": "oklch(0.27 0.02 220)",
  "sidebar-accent-foreground": "oklch(0.95 0.005 250)",
  "sidebar-border": "oklch(1 0 0 / 8%)",
  "sidebar-ring": "oklch(0.6 0.08 190)",
};

const neutralLight: Tokens = {
  ...calmLight,
  background: "oklch(1 0 0)",
  foreground: "oklch(0.145 0 0)",
  primary: "oklch(0.205 0 0)",
  "primary-foreground": "oklch(0.985 0 0)",
  accent: "oklch(0.97 0 0)",
  "accent-foreground": "oklch(0.205 0 0)",
  ring: "oklch(0.708 0 0)",
  "sidebar-primary": "oklch(0.205 0 0)",
  "sidebar-accent": "oklch(0.96 0 0)",
  "sidebar-accent-foreground": "oklch(0.205 0 0)",
};

const neutralDark: Tokens = {
  ...calmDark,
  background: "oklch(0.145 0 0)",
  card: "oklch(0.205 0 0)",
  popover: "oklch(0.205 0 0)",
  primary: "oklch(0.922 0 0)",
  "primary-foreground": "oklch(0.205 0 0)",
  accent: "oklch(0.269 0 0)",
  sidebar: "oklch(0.18 0 0)",
  "sidebar-primary": "oklch(0.922 0 0)",
  "sidebar-primary-foreground": "oklch(0.205 0 0)",
  "sidebar-accent": "oklch(0.269 0 0)",
};

export const THEMES = {
  calm: { label: "Calm teal", radius: "0.75rem", light: calmLight, dark: calmDark },
  neutral: { label: "Neutral", radius: "0.625rem", light: neutralLight, dark: neutralDark },
} satisfies Record<string, Theme>;

export type ThemeName = keyof typeof THEMES;
export const DEFAULT_THEME: ThemeName = "calm";
export const isThemeName = (v: unknown): v is ThemeName => typeof v === "string" && v in THEMES;

const vars = (t: Tokens) =>
  Object.entries(t)
    .map(([k, v]) => `--${k}:${v};`)
    .join("");

/** CSS for every theme. `data-theme` picks the palette; `.dark` picks the mode. */
export function themesCss(): string {
  return Object.entries(THEMES)
    .map(([name, t]) => {
      const sel = name === DEFAULT_THEME ? `:root,[data-theme="${name}"]` : `[data-theme="${name}"]`;
      const darkSel = name === DEFAULT_THEME ? `.dark,.dark[data-theme="${name}"]` : `.dark[data-theme="${name}"]`;
      return `${sel}{--radius:${t.radius};${vars(t.light)}}${darkSel}{${vars(t.dark)}}`;
    })
    .join("\n");
}
