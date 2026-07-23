// Утилиты для применения цвета темы по всему приложению

export type AccentId = "emerald" | "violet" | "rose" | "blue" | "amber";

export const ACCENT_OPTIONS: {
  id: AccentId;
  label: string;
  gradient: string;
  gradientHover: string;
  text: string;
  textHover: string;
  bg: string;
  bgSolid: string;
  border: string;
  shadow: string;
  rgb: string; // для CSS-переменных
}[] = [
  {
    id: "emerald",
    label: "Изумрудный",
    gradient: "from-emerald-400 to-teal-500",
    gradientHover: "hover:from-emerald-300 hover:to-teal-300",
    text: "text-emerald-400",
    textHover: "hover:text-emerald-300",
    bg: "bg-emerald-400/15",
    bgSolid: "bg-emerald-400",
    border: "border-emerald-400/40",
    shadow: "shadow-emerald-500/20",
    rgb: "52, 211, 153",
  },
  {
    id: "violet",
    label: "Фиолетовый",
    gradient: "from-violet-400 to-fuchsia-500",
    gradientHover: "hover:from-violet-300 hover:to-fuchsia-300",
    text: "text-violet-400",
    textHover: "hover:text-violet-300",
    bg: "bg-violet-400/15",
    bgSolid: "bg-violet-400",
    border: "border-violet-400/40",
    shadow: "shadow-violet-500/20",
    rgb: "167, 139, 250",
  },
  {
    id: "rose",
    label: "Розовый",
    gradient: "from-rose-400 to-pink-500",
    gradientHover: "hover:from-rose-300 hover:to-pink-300",
    text: "text-rose-400",
    textHover: "hover:text-rose-300",
    bg: "bg-rose-400/15",
    bgSolid: "bg-rose-400",
    border: "border-rose-400/40",
    shadow: "shadow-rose-500/20",
    rgb: "251, 113, 133",
  },
  {
    id: "blue",
    label: "Синий",
    gradient: "from-blue-400 to-cyan-500",
    gradientHover: "hover:from-blue-300 hover:to-cyan-300",
    text: "text-blue-400",
    textHover: "hover:text-blue-300",
    bg: "bg-blue-400/15",
    bgSolid: "bg-blue-400",
    border: "border-blue-400/40",
    shadow: "shadow-blue-500/20",
    rgb: "96, 165, 250",
  },
  {
    id: "amber",
    label: "Янтарный",
    gradient: "from-amber-400 to-orange-500",
    gradientHover: "hover:from-amber-300 hover:to-orange-300",
    text: "text-amber-400",
    textHover: "hover:text-amber-300",
    bg: "bg-amber-400/15",
    bgSolid: "bg-amber-400",
    border: "border-amber-400/40",
    shadow: "shadow-amber-500/20",
    rgb: "251, 191, 36",
  },
];

export function getAccent(id?: string) {
  return ACCENT_OPTIONS.find((a) => a.id === id) || ACCENT_OPTIONS[0];
}

export const ACCENT_CLASSES: Record<AccentId, string> = {
  emerald: "from-emerald-400 to-teal-500",
  violet: "from-violet-400 to-fuchsia-500",
  rose: "from-rose-400 to-pink-500",
  blue: "from-blue-400 to-cyan-500",
  amber: "from-amber-400 to-orange-500",
};

// Применяет CSS-переменные --accent-rgb и --accent-class глобально
// Позволяет остальным компонентам использовать var(--accent) и bg-[rgb(var(--accent-rgb))]
export function applyAccentToDocument(id: string | undefined) {
  const accent = getAccent(id);
  const root = document.documentElement;
  root.style.setProperty("--accent-rgb", accent.rgb);
  root.style.setProperty("--accent", `#${accent.rgb.split(", ").map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`);
}
