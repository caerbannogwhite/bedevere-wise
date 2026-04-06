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

  // Check body class first (set by BrianApp)
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

  const colors: ThemeColors =
    currentTheme === "dark"
      ? {
          // Header colors - match app dark theme
          headerBackgroundColor: "#2d2d30",
          headerTextColor: "#e5e7eb",

          // Cell colors - darker but readable
          cellBackgroundColor: "#1e1e1e",
          cellTextColor: "#e5e7eb",

          // Border and UI colors
          borderColor: "#404040",
          selectionColor: "rgba(59, 130, 246, 0.25)",
          selectionBorderColor: "#3b82f6",
          hoverColor: "rgba(59, 130, 246, 0.12)",
          hoverBorderColor: "rgba(59, 130, 246, 0.6)",

          // Scrollbar colors
          scrollbarColor: "#2d2d30",
          scrollbarThumbColor: "#4b5563",
          scrollbarHoverColor: "#6b7280",

          // Data type specific colors - subtle variations
          booleanStyle: { backgroundColor: "#1e293b", textColor: "#60a5fa" },
          numericStyle: { backgroundColor: "#14532d", textColor: "#34d399" },
          stringStyle: { backgroundColor: "#1e1e1e", textColor: "#e5e7eb" },
          dateStyle: { backgroundColor: "#451a03", textColor: "#fbbf24" },
          datetimeStyle: { backgroundColor: "#7c2d12", textColor: "#fb923c" },
          nullStyle: { backgroundColor: "#1e1e1e", textColor: "#9ca3af" },
        }
      : {
          // Header colors - match dataset panel header
          headerBackgroundColor: "#f8f9fa",
          headerTextColor: "#1f2937",

          // Cell colors - clean and bright
          cellBackgroundColor: "#ffffff",
          cellTextColor: "#1f2937",

          // Border and UI colors - match app borders
          borderColor: "#e5e7eb",
          selectionColor: "rgba(59, 130, 246, 0.15)",
          selectionBorderColor: "#3b82f6",
          hoverColor: "rgba(59, 130, 246, 0.08)",
          hoverBorderColor: "rgba(59, 130, 246, 0.4)",

          // Scrollbar colors
          scrollbarColor: "#f3f3f3",
          scrollbarThumbColor: "#d1d5db",
          scrollbarHoverColor: "#9ca3af",

          // Data type specific colors - subtle but distinct
          booleanStyle: { backgroundColor: "#eff6ff", textColor: "#2563eb" },
          numericStyle: { backgroundColor: "#f0fdf4", textColor: "#059669" },
          stringStyle: { backgroundColor: "#ffffff", textColor: "#1f2937" },
          dateStyle: { backgroundColor: "#fef3c7", textColor: "#d97706" },
          datetimeStyle: { backgroundColor: "#fed7aa", textColor: "#ea580c" },
          nullStyle: { backgroundColor: "#f9fafb", textColor: "#6b7280" },
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
