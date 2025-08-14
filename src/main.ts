import "./styles/main.scss";
import { datasetDm, datasetDmMini, datasetDmShort, datasetAe } from "./data.ts";
import { BrianApp } from "./components/BrianApp";
import { type CdiscDataset } from "./data/types";
import { CdiscDataProvider } from "./data/providers/CdiscDataProvider.ts";
import { duckDBService } from "./data/duckdb.ts";

// Initialize the Brian application
async function initApplication() {
  const debugMode = true;
  const brianAppVersion = "0.6.0";

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

  // Create the Brian application
  const brianApp = new BrianApp(
    appContainer,
    {
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
    },
    duckDBService,
    brianAppVersion
  );

  // Option to load sample datasets for development
  const loadSampleData = true; // Set to true to load sample datasets

  if (loadSampleData) {
    try {
      await brianApp.addDataset(new CdiscDataProvider(datasetDm as CdiscDataset));
      await brianApp.addDataset(new CdiscDataProvider(datasetDmMini as CdiscDataset));
      await brianApp.addDataset(new CdiscDataProvider(datasetDmShort as CdiscDataset));
      await brianApp.addDataset(new CdiscDataProvider(datasetAe as CdiscDataset));

      brianApp.showMessage("Sample datasets loaded successfully", "info");
    } catch (error) {
      console.error("Error loading datasets:", error);
      brianApp.showMessage("Error loading sample datasets", "error");
    }
  } else {
    brianApp.showMessage("Drop a CSV or TSV file to get started", "info");
  }

  // Make brianApp and duckDBService globally available for debugging
  if (debugMode) {
    (window as any).brianApp = brianApp;
    (window as any).duckDBService = duckDBService;

    console.log("Brian application initialized with VS Code-like interface");
    console.log("- Press Ctrl+P to open the command palette");
    console.log("- Press F11 to toggle fullscreen");
    console.log("- Access 'brianApp' from the console for debugging");
    console.log("- Access 'duckDBService' from the console for database operations");
  }
}

// Start the application
initApplication().catch(console.error);
