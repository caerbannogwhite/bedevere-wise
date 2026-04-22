export interface ThemeColors {
  // Header colors
  headerBackgroundColor: string;
  headerTextColor: string;

  // Cell colors
  cellBackgroundColor: string;
  cellTextColor: string;

  // Border and UI colors
  borderColor: string;
  selectionColor: string;
  selectionBorderColor: string;
  hoverColor: string;
  hoverBorderColor: string;

  // Scrollbar colors
  scrollbarColor: string;
  scrollbarThumbColor: string;
  scrollbarHoverColor: string;

  // Data type specific colors
  booleanStyle: { backgroundColor: string; textColor: string };
  numericStyle: { backgroundColor: string; textColor: string };
  stringStyle: { backgroundColor: string; textColor: string };
  dateStyle: { backgroundColor: string; textColor: string };
  datetimeStyle: { backgroundColor: string; textColor: string };
  nullStyle: { backgroundColor: string; textColor: string };
}

// Module-level cache for theme colors. Invalidated whenever the theme changes
// (body class mutation or system media query). Avoids recomputing colors and
// re-running DOM queries on every cell render.
let cachedTheme: "light" | "dark" | null = null;
let cachedColors: ThemeColors | null = null;
let cacheObserverInstalled = false;

function installCacheInvalidation(): void {
  if (cacheObserverInstalled || typeof document === "undefined") return;
  cacheObserverInstalled = true;

  const invalidate = () => {
    cachedTheme = null;
    cachedColors = null;
  };

  const observer = new MutationObserver(invalidate);
  observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });

  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", invalidate);
  }
}

export function detectCurrentTheme(): "light" | "dark" {
  installCacheInvalidation();
  if (cachedTheme !== null) return cachedTheme;

  // Check body class first (set by BedevereApp)
  if (document.body.classList.contains("theme-light")) {
    cachedTheme = "light";
    return cachedTheme;
  }
  if (document.body.classList.contains("theme-dark")) {
    cachedTheme = "dark";
    return cachedTheme;
  }

  // Fallback to system preference
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    cachedTheme = "dark";
    return cachedTheme;
  }

  cachedTheme = "light";
  return cachedTheme;
}

export function getThemeColors(theme?: "light" | "dark"): ThemeColors {
  // Fast path: cached colors (only valid when no theme override is requested)
  if (!theme && cachedColors !== null) return cachedColors;

  const currentTheme = theme || detectCurrentTheme();

  // Tokyonight palette — keep these in sync with src/styles/_tokens.scss.
  // The canvas can't read CSS custom properties from JS without an extra
  // getComputedStyle call per cell, so the palette is mirrored here as
  // literals. Updating one place requires updating the other.
  const colors: ThemeColors =
    currentTheme === "dark"
      ? {
          // Storm — dark variant
          headerBackgroundColor: "#1f2335",
          headerTextColor: "#c0caf5",

          cellBackgroundColor: "#1a1b26",
          cellTextColor: "#c0caf5",

          borderColor: "#292e42",
          selectionColor: "rgba(122, 162, 247, 0.22)",
          selectionBorderColor: "#7aa2f7",
          hoverColor: "rgba(122, 162, 247, 0.10)",
          hoverBorderColor: "rgba(122, 162, 247, 0.5)",

          scrollbarColor: "#16161e",
          scrollbarThumbColor: "#3b4261",
          scrollbarHoverColor: "#565f89",

          // Type-coloured cells — soft tinted backgrounds with fg accents.
          booleanStyle:  { backgroundColor: "#1a1b26", textColor: "#7aa2f7" },
          numericStyle:  { backgroundColor: "#1a1b26", textColor: "#9ece6a" },
          stringStyle:   { backgroundColor: "#1a1b26", textColor: "#c0caf5" },
          dateStyle:     { backgroundColor: "#1a1b26", textColor: "#e0af68" },
          datetimeStyle: { backgroundColor: "#1a1b26", textColor: "#ff9e64" },
          nullStyle:     { backgroundColor: "#1a1b26", textColor: "#565f89" },
        }
      : {
          // Day — light variant
          headerBackgroundColor: "#d6d8e0",
          headerTextColor: "#3760bf",

          cellBackgroundColor: "#e1e2e7",
          cellTextColor: "#3760bf",

          borderColor: "#b4b5b9",
          selectionColor: "rgba(46, 125, 233, 0.18)",
          selectionBorderColor: "#2e7de9",
          hoverColor: "rgba(46, 125, 233, 0.10)",
          hoverBorderColor: "rgba(46, 125, 233, 0.45)",

          scrollbarColor: "#d6d8e0",
          scrollbarThumbColor: "#a8aecb",
          scrollbarHoverColor: "#848cb5",

          booleanStyle:  { backgroundColor: "#e1e2e7", textColor: "#2e7de9" },
          numericStyle:  { backgroundColor: "#e1e2e7", textColor: "#587539" },
          stringStyle:   { backgroundColor: "#e1e2e7", textColor: "#3760bf" },
          dateStyle:     { backgroundColor: "#e1e2e7", textColor: "#8c6c3e" },
          datetimeStyle: { backgroundColor: "#e1e2e7", textColor: "#b15c00" },
          nullStyle:     { backgroundColor: "#e1e2e7", textColor: "#848cb5" },
        };

  // Cache only the default (no-override) result
  if (!theme) cachedColors = colors;
  return colors;
}

export function listenForThemeChanges(callback: (theme: "light" | "dark") => void): () => void {
  let currentTheme = detectCurrentTheme();

  // Watch for body class changes
  const observer = new MutationObserver(() => {
    const newTheme = detectCurrentTheme();
    if (newTheme !== currentTheme) {
      currentTheme = newTheme;
      callback(newTheme);
    }
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });

  // Watch for system theme changes
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handleMediaChange = () => {
    const newTheme = detectCurrentTheme();
    if (newTheme !== currentTheme) {
      currentTheme = newTheme;
      callback(newTheme);
    }
  };

  mediaQuery.addEventListener("change", handleMediaChange);

  // Return cleanup function
  return () => {
    observer.disconnect();
    mediaQuery.removeEventListener("change", handleMediaChange);
  };
}
