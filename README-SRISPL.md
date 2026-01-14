# SRISPL Weighbridge Management System

## 🚀 Desktop Application v1.0

A complete weighbridge management solution for SHREE RAM IRON AND STEEL PVT. LTD.

---

## ✨ Features

- ✅ **Real-time Weight Reading** - Connects to weighing scale via COM port
- ✅ **Simulation Mode** - Works without hardware for testing
- ✅ **Dynamic COM Port Selection** - Select from available ports in the UI
- ✅ **Gate Entry Management** - Track vehicles from entry to exit
- ✅ **Dual Weighing** - Gross and Tare weight capture with images
- ✅ **Admin Authorization** - Secure authorization workflow
- ✅ **Print Slips** - Professional weight slips with images
- ✅ **Daily Reports** - Excel export and print reports
- ✅ **History Management** - Search and filter past records
- ✅ **Modern UI** - Clean, responsive interface

---

## 📦 Installation

### For Windows Users:

1. **Extract the Application** 
   - Extract all files to a folder (e.g., `C:\SRISPL-Weighbridge`)

2. **Install Dependencies** (First Time Only)
   - Open Command Prompt in the application folder
   - Run: `npm install`

3. **Run the Application**
   - Double-click `start-app.bat` 
   - OR run `npm start` from command line

---

## 🎯 Quick Start Guide

### 1. **Starting the Application**
   - Launch the desktop app
   - It automatically starts the backend server
   - Opens the main weighbridge interface

### 2. **Configure COM Port**
   - Click **⚙️ Settings** button in top right
   - Select your weighing scale's COM port
   - If no hardware is connected, it runs in **Simulation Mode**

### 3. **Register Vehicle at Gate**
   - Enter Vehicle Number
   - Enter Party Name
   - Enter Item/Material
   - Select Loading/Unloading
   - Click **Register Vehicle**

### 4. **Admin Authorization** (Open `/admin` in browser)
   - Access admin panel at `http://localhost:4000/admin`
   - Default password: `@nkit@nurag`
   - Authorize vehicles for entry

### 5. **Weighing Process**
   - Operator confirms vehicle on scale
   - Capture 1st weight with camera
   - Admin authorizes exit
   - Capture 2nd weight
   - Print weight slip automatically

---

## 🖥️ Building Executable (.exe)

To create a standalone Windows executable:

```bash
npm run build:win
```

This creates:
- Installer: `dist/SRISPL Weighbridge Setup.exe`
- Portable: `dist/win-unpacked/`

---

## 🔧 Configuration

### Default Settings:
- **Port**: 4000
- **COM Port**: COM3 (changeable in UI)
- **Baud Rate**: 2400
- **Admin Password**: `@nkit@nurag`

### Changing Admin Password:
Edit `server.js` line 11:
```javascript
const ADMIN_SECRET_PASSWORD = "your_new_password";
```

### Changing Server Port:
Edit `server.js` line 13:
```javascript
const PORT = 4000; // Change to desired port
```

---

## 📂 File Structure

```
SRISPL-Weighbridge/
├── main.js              # Electron entry point
├── server.js            # Backend server
├── srispl.html          # Main interface
├── admin.html           # Admin panel
├── package.json         # Configuration
├── uploads/             # Stored images
├── weighbridge.db       # SQLite database
└── node_modules/        # Dependencies
```

---

## 🎮 Simulation Mode

If no weighing scale is connected:
- Application runs in **Simulation Mode**
- Generates random weight values
- Perfect for testing and training
- Indicated in Settings modal

---

## 🖨️ Printing

### Weight Slips:
- Captured images are embedded
- Professional format
- Serial number tracking
- Transporter details

### Daily Reports:
- Select date from history
- Click **🖨️ Report** button
- Exports to printer or PDF

### Excel Export:
- Click **📊 Excel** button
- Downloads CSV file
- Import to Excel/Google Sheets

---

## 🔐 Security

- Admin panel requires password
- Database stored locally
- Images saved securely
- No internet connection required

---

## 🐛 Troubleshooting

### Application won't start:
```bash
npm install
npm start
```

### COM Port not detected:
- Check if device is connected
- Try different USB port
- Update serial port drivers
- Use Simulation Mode for testing

### Images not printing:
- Ensure images are captured
- Check camera permissions
- Images are stored in `uploads/` folder

### Database issues:
- Backup `weighbridge.db`
- Delete and restart to create fresh database

---

## 📞 Support

For technical support, contact SRISPL IT Department

---

## 📝 License

© 2025 SHREE RAM IRON AND STEEL PVT. LTD.
All Rights Reserved

---

## 🎉 Version History

**v1.0.0** (Current)
- ✅ Desktop application with Electron
- ✅ Dynamic COM port selection
- ✅ Fixed image printing
- ✅ Modernized UI
- ✅ Simulation mode
- ✅ Complete workflow automation

---

**Built with ❤️ for SRISPL**
