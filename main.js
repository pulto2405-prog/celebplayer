const { app, BrowserWindow, Menu, utilityProcess } = require('electron');
const path = require('path');

let mainWindow;
let backendProcess;

const isDev = !app.isPackaged;

function startBackend() {
  let backendPath;
  let frontendDist;

  if (isDev) {
    backendPath = path.join(__dirname, 'backend', 'dist', 'index.js');
    frontendDist = path.join(__dirname, 'frontend', 'dist');
  } else {
    // In production, we can now read directly from asar!
    backendPath = path.join(__dirname, 'backend', 'dist', 'index.js');
    frontendDist = path.join(__dirname, 'frontend', 'dist');
  }
  
  console.log(`Starte Backend via UtilityProcess von: ${backendPath}`);

  backendProcess = utilityProcess.fork(backendPath, [], {
    env: { 
      ...process.env, 
      PORT: 5000, 
      NODE_ENV: 'production',
      FRONTEND_DIST: frontendDist
    },
    stdio: 'inherit' // Leitet Logs direkt in das Terminal weiter
  });

  backendProcess.on('exit', (code) => {
    console.log(`Backend beendet mit Code: ${code}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Celebplayer",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true
  });

  // Rechtsklick-Menü hinzufügen
  mainWindow.webContents.on('context-menu', (e, props) => {
    const { selectionText, isEditable } = props;
    if (isEditable) {
      const menu = Menu.buildFromTemplate([
        { role: 'cut', label: 'Ausschneiden' },
        { role: 'copy', label: 'Kopieren' },
        { role: 'paste', label: 'Einfügen' },
        { type: 'separator' },
        { role: 'selectAll', label: 'Alles auswählen' },
      ]);
      menu.popup(mainWindow);
    } else if (selectionText && selectionText.trim() !== '') {
      const menu = Menu.buildFromTemplate([
        { role: 'copy', label: 'Kopieren' },
      ]);
      menu.popup(mainWindow);
    }
  });

  setTimeout(() => {
    mainWindow.loadURL('http://localhost:5000');
  }, 2500); // Etwas mehr Zeit für das Backend geben

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  startBackend();
  createWindow();
});

app.on('window-all-closed', () => {
  // Backend beenden, wenn alle Fenster geschlossen sind
  if (backendProcess) {
    backendProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Sicherstellen, dass das Backend beim Beenden stirbt
process.on('exit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
});
