require('dotenv').config(); // MUST BE LINE 1
const http = require('http');
const express = require('express');
const cors = require('cors');
const { SerialPort } = require('serialport');
const { WebSocketServer } = require('ws');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const ngrok = require('ngrok');

// --- CONFIGURATION ---
// Pulled from your .env file for safety
const ADMIN_SECRET_PASSWORD = process.env.ADMIN_ACTION_SECRET || "@nkit@nurag"; 
const LOGIN_PASSWORD = process.env.ADMIN_LOGIN_PASS || "admin123";
const DEFAULT_COM_PORT = 'COM3'; 
const BAUD_RATE = 2400;
const PORT = 4000;
const HOST = 'localhost';

// --- Setup Express & Socket ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Allow large image uploads

// --- NEW: LOGIN API ENDPOINT ---
app.post('/api/admin-login', (req, res) => {
    const { password } = req.body;
    if (password === LOGIN_PASSWORD) {
        res.json({ success: true, message: "Access Granted" });
    } else {
        res.status(401).json({ success: false, message: "Invalid Password" });
    }
});

// 1. HOST IMAGES CORRECTLY (CRITICAL FOR PRINTING)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
app.use('/uploads', express.static(uploadDir));

// --- Database Setup ---
const db = new Database('weighbridge.db');

// 1. Create PENDING Table (For Gate Entry & First Weight)
db.exec(`
    CREATE TABLE IF NOT EXISTS pending_weights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicleNumber TEXT NOT NULL,
        partyName TEXT NOT NULL,
        item TEXT,
        transactionType TEXT DEFAULT 'LOADING', 
        status TEXT DEFAULT 'AT_GATE', 
        grossWt REAL DEFAULT 0,
        tareWt REAL DEFAULT 0,
        image1 TEXT,
        createdTimestamp INTEGER,
        authorizedTimestamp INTEGER
    );
`);

// 2. Create COMPLETED Table (Final Records)
db.exec(`
    CREATE TABLE IF NOT EXISTS completed_weights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicleNumber TEXT NOT NULL,
        partyName TEXT NOT NULL,
        item TEXT,
        transactionType TEXT,
        grossWt REAL NOT NULL,
        tareWt REAL NOT NULL,
        netWt REAL NOT NULL,
        image1 TEXT,
        image2 TEXT,
        date TEXT NOT NULL,
        createdTimestamp INTEGER,
        completedTimestamp INTEGER,
        transporterName TEXT,
        lrBiltyNo TEXT
    );
`);

// --- AUTOMATIC MIGRATION FOR NEW FIELDS ---
try {
    db.exec("ALTER TABLE completed_weights ADD COLUMN transporterName TEXT");
    console.log("🛠️ Added column 'transporterName' to database.");
} catch (e) { /* Column likely already exists */ }

try {
    db.exec("ALTER TABLE completed_weights ADD COLUMN lrBiltyNo TEXT");
    console.log("🛠️ Added column 'lrBiltyNo' to database.");
} catch (e) { /* Column likely already exists */ }


console.log('✅ Database connected and tables initialized.');


// --- Helper: Save Base64 Image ---
function saveImage(base64Data, prefix) {
    if (!base64Data) return null;
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return null;
    
    const buffer = Buffer.from(matches[2], 'base64');
    const filename = `img_${prefix}_${Date.now()}.jpg`;
    
    fs.writeFileSync(path.join(uploadDir, filename), buffer);
    return filename; // Save just the filename to DB
}


// --- Serial Port Logic (STRICT PRODUCTION MODE) ---
const comPortPath = process.env.SERIAL_PORT || DEFAULT_COM_PORT;
let currentWeight = 0;
let comPort;
let isSimulation = false; // Kept for safety logic

// Try to connect to real hardware
try {
    console.log(`🔌 Attempting to connect to serial port ${comPortPath}...`);
    comPort = new SerialPort({ path: comPortPath, baudRate: BAUD_RATE, autoOpen: false });
    
    comPort.open((err) => {
        if (err) {
            console.log(`❌ ERROR: Could not open ${comPortPath}. Check cable or port! (${err.message})`);
            currentWeight = 0;
            broadcast(JSON.stringify({ type: 'LIVE_WEIGHT_UPDATE', payload: 0 }));
        } else {
            console.log(`✅ SUCCESS: Connected to ${comPortPath}. Listening for real data...`);
        }
    });

    comPort.on('data', (chunk) => {
        const raw = chunk.toString('utf8');
        const clean = raw.replace(/[^\d.]/g, ''); 
        if (clean) {
             const w = parseFloat(clean);
             if (!isNaN(w)) {
                 currentWeight = w;
                 broadcast(JSON.stringify({ type: 'LIVE_WEIGHT_UPDATE', payload: currentWeight }));
             }
        }
    });

    comPort.on('error', (err) => {
        console.log(`❌ CONNECTION LOST: ${err.message}`);
        currentWeight = 0;
        broadcast(JSON.stringify({ type: 'LIVE_WEIGHT_UPDATE', payload: 0 }));
    });

} catch (err) {
    console.log(`❌ CRITICAL: Serial Port Setup Failed.`);
    currentWeight = 0;
    broadcast(JSON.stringify({ type: 'LIVE_WEIGHT_UPDATE', payload: 0 }));
}

// --- WebSocket Broadcasting Helpers ---

function broadcast(message) {
    wss.clients.forEach((client) => {
        if (client.readyState === 1) client.send(message);
    });
}

function broadcastPendingList() {
    const stmt = db.prepare('SELECT * FROM pending_weights ORDER BY createdTimestamp DESC');
    const pending = stmt.all();
    broadcast(JSON.stringify({ type: 'PENDING_LIST_UPDATE', payload: pending }));
}

function broadcastCompletedList(date) {
    const stmt = db.prepare('SELECT * FROM completed_weights WHERE date = ? ORDER BY completedTimestamp DESC');
    const records = stmt.all(date);
    broadcast(JSON.stringify({ type: 'COMPLETED_LIST_UPDATE', payload: { date, records } }));
}


// --- WebSocket Connection Logic ---
wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'LIVE_WEIGHT_UPDATE', payload: currentWeight }));
    broadcastPendingList();
    const today = new Date().toISOString().split('T')[0];
    broadcastCompletedList(today);

    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);

            switch (msg.type) {
                
                case 'REGISTER_GATE_ENTRY': {
                    const { vehicleNumber, partyName, item, transactionType } = msg.payload;
                    const stmt = db.prepare(`
                        INSERT INTO pending_weights (vehicleNumber, partyName, item, transactionType, status, createdTimestamp)
                        VALUES (?, ?, ?, ?, 'AT_GATE', ?)
                    `);
                    stmt.run(vehicleNumber, partyName, item, transactionType, Date.now());
                    
                    broadcastPendingList();
                    broadcast(JSON.stringify({ type: 'cj_ALERT', message: `New Vehicle at Gate: ${vehicleNumber}` }));
                    break;
                }

                case 'AUTHORIZE_ENTRY': {
                    const { id } = msg.payload;
                    db.prepare("UPDATE pending_weights SET status = 'AUTHORIZED', authorizedTimestamp = ? WHERE id = ?")
                      .run(Date.now(), id);
                    
                    broadcastPendingList();
                    broadcast(JSON.stringify({ type: 'USER_ALERT_PERMIT', payload: { id } }));
                    break;
                }

                case 'AUTHORIZE_EXIT':
                    db.prepare("UPDATE pending_weights SET status = 'EXIT_AUTHORIZED' WHERE id = ?").run(msg.payload.id);
                    broadcastPendingList();
                    broadcast(JSON.stringify({ type: 'USER_ALERT_PERMIT', payload: { id: msg.payload.id, type: 'EXIT' } }));
                    break;

                case 'CONFIRM_VEHICLE_ON_WB': {
                    const { id } = msg.payload;
                    db.prepare("UPDATE pending_weights SET status = 'ON_SCALE' WHERE id = ?").run(id);
                    broadcastPendingList();
                    break;
                }

                case 'Tv_CAPTURE_FIRST': {
                    const { id, grossWt, tareWt, imageData } = msg.payload;
                    const imgPath = saveImage(imageData, `1st_${id}`);
                    
                    db.prepare(`
                        UPDATE pending_weights 
                        SET grossWt = ?, tareWt = ?, image1 = ?, status = 'FIRST_Wt_DONE' 
                        WHERE id = ?
                    `).run(grossWt, tareWt, imgPath, id);
                    
                    broadcastPendingList();
                    break;
                }

                case 'Tv_CAPTURE_SECOND': {
                    const { id, grossWt, tareWt, imageData, transporterName, lrBiltyNo } = msg.payload;
                    const record = db.prepare('SELECT * FROM pending_weights WHERE id = ?').get(id);
                    
                    if(record) {
                        const img2Path = saveImage(imageData, `2nd_${id}`);
                        const netWt = Math.abs(grossWt - tareWt);
                        const date = new Date().toISOString().split('T')[0];

                        const insert = db.prepare(`
                            INSERT INTO completed_weights 
                            (id, vehicleNumber, partyName, item, transactionType, grossWt, tareWt, netWt, image1, image2, date, createdTimestamp, completedTimestamp, transporterName, lrBiltyNo)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `);
                        
                        insert.run(record.id, record.vehicleNumber, record.partyName, record.item, record.transactionType, 
                                   grossWt, tareWt, netWt, record.image1, img2Path, date, record.createdTimestamp, Date.now(),
                                   transporterName || null, lrBiltyNo || null);

                        db.prepare('DELETE FROM pending_weights WHERE id = ?').run(id);
                        
                        broadcastPendingList();
                        broadcastCompletedList(date);
                    }
                    break;
                }

                case 'UPDATE_PRINT_DETAILS': {
                    const { id, transporterName, lrBiltyNo } = msg.payload;
                    const update = db.prepare(`
                        UPDATE completed_weights 
                        SET transporterName = ?, lrBiltyNo = ? 
                        WHERE id = ?
                    `);
                    update.run(transporterName, lrBiltyNo, id);
                    const date = new Date().toISOString().split('T')[0];
                    broadcastCompletedList(date);
                    break;
                }

                case 'ADMIN_ACTION': {
                    const { password, action } = msg.payload;
                    if (password === ADMIN_SECRET_PASSWORD) {
                        let responseMsg = 'Success';
                        if (action === 'RESET_SERIAL_NUMBER') {
                            try {
                                db.prepare("UPDATE sqlite_sequence SET seq = 0 WHERE name = 'pending_weights'").run();
                                db.prepare("UPDATE sqlite_sequence SET seq = 0 WHERE name = 'completed_weights'").run();
                                db.prepare('DELETE FROM pending_weights').run();
                                responseMsg = 'Serial Number Reset & Pending List Cleared.';
                                broadcastPendingList();
                            } catch (error) {
                                responseMsg = `Error: ${error.message}`;
                            }
                        }
                        ws.send(JSON.stringify({ type: 'ADMIN_ACTION_RESULT', payload: { success: true, message: responseMsg } }));
                    } else {
                        ws.send(JSON.stringify({ type: 'ADMIN_ACTION_RESULT', payload: { success: false, message: 'Invalid Password' } }));
                    }
                    break;
                }

                case 'GET_COMPLETED_FOR_DATE': {
                    broadcastCompletedList(msg.payload.date);
                    break;
                }

                case 'DELETE_ALL_COMPLETED': {
                    const { date } = msg.payload;
                    db.prepare('DELETE FROM completed_weights WHERE date = ?').run(date);
                    broadcastCompletedList(date);
                    break;
                }
                
                case 'SEARCH_BY_SERIAL': {
                    const { serial } = msg.payload;
                    const pendingRec = db.prepare('SELECT * FROM pending_weights WHERE id = ? OR vehicleNumber LIKE ?').get(serial, `%${serial}%`);
                    if(pendingRec) {
                         ws.send(JSON.stringify({ type: 'SEARCH_RESULT_PENDING', payload: pendingRec }));
                    } else {
                         const compRec = db.prepare('SELECT * FROM completed_weights WHERE id = ? OR vehicleNumber LIKE ?').get(serial, `%${serial}%`);
                         if(compRec) {
                             ws.send(JSON.stringify({ type: 'SEARCH_RESULT_COMPLETED', payload: compRec }));
                         } else {
                             ws.send(JSON.stringify({ type: 'SEARCH_NOT_FOUND' }));
                         }
                    }
                    break;
                }
            }
        } catch (err) { console.error("Error processing message:", err); }
    });
});

// --- API ENDPOINTS FOR COM PORT MANAGEMENT ---

app.get('/api/ports', async (req, res) => {
    try {
        const ports = await SerialPort.list();
        res.json({ 
            success: true, 
            ports: ports.map(p => ({
                path: p.path,
                manufacturer: p.manufacturer,
                serialNumber: p.serialNumber,
                description: p.friendlyName || p.path
            })),
            currentPort: comPortPath,
            isSimulation: isSimulation
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.post('/api/change-port', express.json(), (req, res) => {
    const { port } = req.body;
    if (!port) return res.json({ success: false, error: 'Port path is required' });
    
    try {
        if (comPort && comPort.isOpen) comPort.close();
        isSimulation = false;
        comPort = new SerialPort({ path: port, baudRate: BAUD_RATE, autoOpen: false });
        
        comPort.open((err) => {
            if (err) {
                console.log(`⚠️ Could not open ${port}: ${err.message}`);
                broadcast(JSON.stringify({ type: 'PORT_CHANGE_RESULT', payload: { success: false, error: err.message } }));
                return res.json({ success: false, error: err.message });
            } else {
                console.log(`✅ Successfully switched to ${port}`);
                comPort.on('data', (chunk) => {
                    const raw = chunk.toString('utf8');
                    const clean = raw.replace(/[^\d.]/g, ''); 
                    if (clean) {
                        const w = parseFloat(clean);
                        if (!isNaN(w)) {
                            currentWeight = w;
                            broadcast(JSON.stringify({ type: 'LIVE_WEIGHT_UPDATE', payload: currentWeight }));
                        }
                    }
                });
                broadcast(JSON.stringify({ type: 'PORT_CHANGE_RESULT', payload: { success: true, port: port } }));
                res.json({ success: true, port: port });
            }
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.get('/api/server-info', (req, res) => {
    res.json({ host: HOST, port: PORT, baseUrl: `http://${HOST}:${PORT}` });
});

// --- Static File Hosting ---
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'srispl.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// --- Start Server ---
server.listen(PORT, () => {
    console.log(`--------------------------------------------------`);
    console.log(`🚀 Server Running: http://localhost:${PORT}`);
    console.log(`👮 Admin Dashboard: http://localhost:${PORT}/admin`);
    console.log(`🔌 Serial Port: ${comPortPath}`);
    (async function() {
        try {
            const url = await ngrok.connect(PORT);
            console.log(`🌍 PUBLIC URL: ${url}`);
            console.log(`--------------------------------------------------`);
        } catch (e) {
            console.log('⚠️ Ngrok failed:', e.message);
        }
    })();
});