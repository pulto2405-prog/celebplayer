const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess;

const isDev = !app.isPackaged;

function startBackend() {
  let backendPath;
  let frontendDist;

  if (isDev) {
    backendPath = path.join(__dirname, 'backend', 'dist', 'bundle.js');
    frontendDist = path.join(__dirname, 'frontend', 'dist');
  } else {
    // In production, files are in app.asar.unpacked
    backendPath = path.join(__dirname, '..', 'app.asar.unpacked', 'backend', 'dist', 'bundle.js');
    frontendDist = path.join(__dirname, '..', 'app.asar.unpacked', 'frontend', 'dist');
  }
  
  // Falls der Pfad oben nicht existiert, probieren wir den direkten Pfad als Fallback
  if (!require('fs').existsSync(backendPath)) {
    backendPath = path.join(__dirname, 'backend', 'dist', 'bundle.js');
    frontendDist = path.join(__dirname, 'frontend', 'dist');
  }

  const backendDir = path.dirname(backendPath);
  
  console.log(`Starte Backend von: ${backendPath}`);
  console.log(`Frontend-Pfad für Backend: ${frontendDist}`);

  backendProcess = spawn('node', [backendPath], {
    cwd: backendDir,
    env: { 
      ...process.env, 
      PORT: 5000, 
      NODE_ENV: 'production',
      FRONTEND_DIST: frontendDist
    }
  });

  backendProcess.stdout.on('data', (data) => {
    process.stdout.write(`Backend: ${data}`); // Direkte Weiterleitung ins Terminal
  });

  backendProcess.stderr.on('data', (data) => {
    process.stderr.write(`Backend Error: ${data}`); // Direkte Weiterleitung ins Terminal
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
