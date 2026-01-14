const { app, BrowserWindow, Menu, ipcMain, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

/**
 * SRISPL Weighbridge Management System
 * Production Main Process Script
 */

let mainWindow;
let serverProcess;
const isDev = process.env.NODE_ENV === 'development';

// 1. HARDWARE FIX: Disable acceleration to prevent "invisible" modals/popups
app.disableHardwareAcceleration();

/**
 * Background Server Management
 * Spawns the Node.js server.js which handles COM ports and scale logic
 */
function startBackendServer() {
    console.log('--- Initializing Weighbridge Backend ---');
    
    const serverPath = path.join(__dirname, 'server.js');
    
    serverProcess = spawn('node', [serverPath], {
        cwd: __dirname,
        stdio: 'inherit',
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    });

    serverProcess.on('error', (err) => {
        console.error('CRITICAL: Failed to start backend server:', err);
    });

    serverProcess.on('exit', (code, signal) => {
        console.log(`Backend server exited with code ${code} and signal ${signal}`);
    });
}

/**
 * UI Window Management
 * Configured specifically to allow Transporter Details Popups
 */
function createMainWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    mainWindow = new BrowserWindow({
        width: Math.min(1400, width),
        height: Math.min(900, height),
        minWidth: 1024,
        minHeight: 768,
        title: "SRISPL Weighbridge Management System",
        icon: path.join(__dirname, 'icon.png'),
        backgroundColor: '#f8fafc',
        show: false, // Hidden until ready to prevent white flicker
        webPreferences: {
            // SECURITY VS FUNCTIONALITY: 
            // We set contextIsolation to false so your index.html can trigger popups
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false, // Allows loading local images (vehicle captures)
            devTools: true
        }
    });

    // Remove the default top menu bar for a clean "Application" look
    Menu.setApplicationMenu(null);

    // Load the local server (the one spawned by startBackendServer)
    mainWindow.loadURL('http://localhost:4000');

    // Show window only when it is ready to be painted
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.focus();
    });

    // Handle case where server takes too long to start
    mainWindow.webContents.on('did-fail-load', () => {
        console.log('Server not ready, retrying in 2 seconds...');
        setTimeout(() => {
            if (mainWindow) mainWindow.loadURL('http://localhost:4000');
        }, 2000);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

/**
 * Application Lifecycle
 */
app.on('ready', () => {
    // Start the Scale Engine first
    startBackendServer();
    
    // Allow the server 2.5 seconds to open COM ports and Ngrok before showing UI
    setTimeout(createMainWindow, 2500);
});

app.on('window-all-closed', () => {
    // Kill the server.js process when the window is closed
    if (serverProcess) {
        console.log('Shutting down Scale Engine...');
        serverProcess.kill('SIGINT');
    }
    
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createMainWindow();
    }
});

// Prevent multiple instances of the application
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}