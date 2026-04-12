import "./styles/main.scss";
import { BedevereApp } from "./components/BedevereApp";
import { duckDBService } from "./data/DuckDBService.ts";

// Initialize the Bedevere Wise application
async function initApplication() {
  const debugMode = true;
  const appVersion = "0.6-it-is-i";

  // Initialize DuckDB first
  try {
    await duckDBService.initialize();
    console.log("DuckDB initialized successfully");
  } catch (error) {
    console.error("Failed to initialize DuckDB:", error);
    // Continue without DuckDB if initialization fails
  }

  const appContainer = document.getElementById("app") || document.body;

  // Clear existing content
  appContainer.innerHTML = "";

  // Create the Bedevere Wise application
  const app = new BedevereApp(appContainer, duckDBService, appVersion, {
    theme: "auto", // Automatically detect user's preferred theme
    // theme: "light",
    showLeftPanel: true,
    showDragDropZone: true,
    statusBarVisible: true,
    commandPaletteEnabled: true,
    spreadsheetOptions: {
      minHeight: 400,
      minWidth: 600,
      dateFormat: "yyyy-MM-dd",
      datetimeFormat: "yyyy-MM-dd HH:mm:ss",
      numberFormat: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    },
    debugMode: false,
  });

  // Restore persisted state (views, settings)
  await app.initAsync();

  app.showMessage("Drop a file or open a folder to get started", "info");

  // Make app and duckDBService globally available for debugging
  if (debugMode) {
    (window as any).bedevereApp = app;
    (window as any).duckDBService = duckDBService;

    console.log("Bedevere Wise initialized");
    console.log("- Press Ctrl+P to open the command palette");
    console.log("- Press F11 to toggle fullscreen");
    console.log("- Access 'bedevereApp' from the console for debugging");
    console.log("- Access 'duckDBService' from the console for database operations");
  }
}

// Start the application
initApplication().catch(console.error);
