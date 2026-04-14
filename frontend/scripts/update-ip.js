const os = require('os');
const fs = require('fs');
const path = require('path');

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const localIp = getLocalIp();
const easPath = path.join(__dirname, '..', 'eas.json');

if (fs.existsSync(easPath)) {
  let content = fs.readFileSync(easPath, 'utf8');
  const ipRegex = /http:\/\/(?:[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|YOUR_LOCAL_IP):3000/g;
  const newUrl = `http://${localIp}:3000`;
  
  if (content.match(ipRegex)) {
    const updatedContent = content.replace(ipRegex, newUrl);
    fs.writeFileSync(easPath, updatedContent);
    console.log(`✅ Updated eas.json with local IP: ${localIp}`);
    console.log(`🔗 Backend URL: ${newUrl}`);
  } else {
    console.log(`Detected IP: ${localIp}`);
  }
} else {
  console.error(`❌ Could not find eas.json at ${easPath}`);
}

const backendEnv = path.join(__dirname, '..', '..', 'backend', '.env');
if (fs.existsSync(backendEnv)) {
  let content = fs.readFileSync(backendEnv, 'utf8');
  const backendUrlRegex = /EXPO_PUBLIC_BACKEND_URL=http:\/\/(?:[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|YOUR_LOCAL_IP):3000/g;
  
  if (content.match(backendUrlRegex)) {
    const updatedContent = content.replace(backendUrlRegex, `EXPO_PUBLIC_BACKEND_URL=http://${localIp}:3000`);
    fs.writeFileSync(backendEnv, updatedContent);
    console.log(`✅ Updated backend/.env with local IP: ${localIp}`);
  }
}
