import "./styles/main.scss";
import { datasetDm, datasetDmMini, datasetDmShort, datasetAe } from "./data.ts";
import { BrianApp } from "./components/BrianApp";
import { type CdiscDataset } from "./data/types";
import { CdiscDataProvider } from "./data/providers/CdiscDataProvider.ts";

// Initialize the Brian application with VS Code-like interface
async function initApplication() {
  const appContainer = document.getElementById("app") || document.body;

  // Clear existing content
  appContainer.innerHTML = "";

  // Create the Brian application
  const brianApp = new BrianApp(appContainer, {
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

  // Make brianApp globally available for debugging
  (window as any).brianApp = brianApp;

  console.log("Brian application initialized with VS Code-like interface");
  console.log("- Press Ctrl+P to open the command palette");
  console.log("- Press F11 to toggle fullscreen");
  console.log("- Access 'brianApp' from the console for debugging");
}

// Start the application
initApplication().catch(console.error);
