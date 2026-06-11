import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import QRCode from 'react-native-qrcode-svg';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import CryptoJS from 'crypto-js';
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

// HARDCODED DEMO KEYPAIR (Private Key + Public Key)
// In production, the PRIVATE KEY stays strictly on the backend!
const DEMO_SEED = naclUtil.decodeUTF8('ticket-demo-seed-32-bytes-long!!'); 
const DEMO_KEYPAIR = nacl.sign.keyPair.fromSeed(DEMO_SEED);
export default function App() {
  const [inputText, setInputText] = useState('');
  const [inputTime, setInputTime] = useState('60');
  const [ticketGenerated, setTicketGenerated] = useState(false);
  const [generationMethod, setGenerationMethod] = useState(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [timerActive, setTimerActive] = useState(false);
  const [appExpiryTimestamp, setAppExpiryTimestamp] = useState(null);
  const [status, requestPermission] = MediaLibrary.usePermissions();
  const viewShotRef = useRef(null);
  const qrRef = useRef(null);

  const generateAsymmetricToken = (payload) => {
    // 1. Convert JSON payload to bytes
    const payloadStr = JSON.stringify(payload);
    const payloadBytes = naclUtil.decodeUTF8(payloadStr);
    
    // 2. Generate Digital Signature using the Private Key
    const signatureBytes = nacl.sign.detached(payloadBytes, DEMO_KEYPAIR.secretKey);
    
    // 3. Encode to Base64 so it can fit nicely inside a QR code
    const payloadBase64 = naclUtil.encodeBase64(payloadBytes);
    const signatureBase64 = naclUtil.encodeBase64(signatureBytes);
    
    // 4. Return as a combined JSON structure
    return JSON.stringify({
      payload: payloadBase64,
      signature: signatureBase64
    });
  };

  const generateHTML = (name, expiryTimestamp, initialSeconds) => `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f5f5f5; font-family: sans-serif; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  .watermark { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: repeating-linear-gradient(45deg, rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 20px, transparent 20px, transparent 40px); animation: moveWatermark 2s linear infinite; pointer-events: none; z-index: 10; }
  @keyframes moveWatermark { from { background-position: 0 0; } to { background-position: 56px 0; } }
  .card { background: #fff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 320px; overflow: hidden; position: relative; z-index: 5; border: 1px solid #ddd; transition: background-color 0.5s ease; }
  .header { display: flex; justify-content: space-between; background-color: rgba(255,255,255,0.3); padding: 10px 15px; font-weight: bold; font-size: 14px; color: #111; border-bottom: 1px solid rgba(0,0,0,0.1); }
  .content { padding: 15px; text-align: left; }
  .row { display: flex; justify-content: space-between; margin-bottom: 15px; align-items: center; }
  .station-badge { background-color: #f39c12; color: #fff; width: 24px; height: 24px; border-radius: 12px; display: inline-flex; justify-content: center; align-items: center; font-size: 14px; font-weight: bold; margin-right: 8px; }
  .station-text { font-size: 16px; color: #333; display: flex; align-items: center; }
  .details-row { display: flex; justify-content: space-between; font-size: 12px; color: #666; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
  .name-row { font-size: 14px; font-weight: bold; color: #333; margin-bottom: 10px; }
  .timer-section { text-align: center; margin-top: 15px; border-top: 1px solid #eee; padding-top: 15px; }
  .timer-label { font-size: 12px; color: #888; }
  .timer-value { font-size: 24px; font-weight: bold; color: #e74c3c; margin-top: 5px; }
  .expired { color: #95a5a6; }
  #overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: black; z-index: 9999; display: none; }
  .stamp { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-20deg); color: rgba(76, 175, 80, 0.3); font-size: 24px; font-weight: bold; border: 3px solid rgba(76, 175, 80, 0.3); border-radius: 50%; width: 120px; height: 120px; display: flex; justify-content: center; align-items: center; text-align: center; pointer-events: none; z-index: 20; }
</style>
</head>
<body>
  <div id="overlay"></div><div class="watermark"></div>
  <div class="card">
    <div class="stamp">PAPERLESS</div>
    <div class="header">
      <span>PLATFORM ( M-TICKET )</span>
      <span>FARE: ₹ 10.00</span>
    </div>
    <div class="content">
      <div class="name-row">NAME: ${name}</div>
      <div class="details-row">
        <span>PERSON: 1</span>
        <span>SECOND (II)</span>
        <span>ORDINARY (O)</span>
      </div>
      <div class="details-row" style="border-bottom: none;">
        <span>BOOKING DATE: ${new Date().toLocaleDateString('en-US', {month: 'short', day: '2-digit', year: 'numeric'}).toUpperCase()}</span>
      </div>
      
      <div class="timer-section">
        <div class="timer-label">Expires In:</div>
        <div id="timer" class="timer-value">${Math.floor(initialSeconds / 60).toString().padStart(2, '0')}:${(initialSeconds % 60).toString().padStart(2, '0')}</div>
      </div>
    </div>
  </div>
  <script>
    document.addEventListener('visibilitychange', () => { document.getElementById('overlay').style.display = document.hidden ? 'block' : 'none'; });
    window.addEventListener('blur', () => { document.getElementById('overlay').style.display = 'block'; });
    window.addEventListener('focus', () => { document.getElementById('overlay').style.display = 'none'; });
    const expiryTimestamp = ${expiryTimestamp};
    const totalSeconds = ${initialSeconds};
    const timerEl = document.getElementById('timer'); 
    const cardEl = document.querySelector('.card');
    
    const updateTimer = () => {
      const now = Date.now();
      const timeLeft = Math.max(0, Math.floor((expiryTimestamp - now) / 1000));
      
      if(timeLeft <= 0) { 
        if (window.timerInterval) clearInterval(window.timerInterval); 
        document.body.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100vh; background-color:#e0e0e0; font-family:sans-serif; width:100%;"><div style="font-size:48px; font-weight:bold; color:#7f8c8d; letter-spacing:4px;">EXPIRED</div></div>';
      } else { 
        const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0'); 
        const secs = (timeLeft % 60).toString().padStart(2, '0'); 
        timerEl.textContent = mins + ':' + secs; 
        
        const ratio = timeLeft / totalSeconds;
        if (ratio > 0.5) {
          cardEl.style.backgroundColor = '#a5d6a7';
        } else {
          cardEl.style.backgroundColor = '#ef9a9a';
        }
      }
    };
    
    updateTimer();
    window.timerInterval = setInterval(updateTimer, 1000);
  </script>
</body>
</html>`;

  useEffect(() => {
    let interval;
    if (timerActive && appExpiryTimestamp) {
      interval = setInterval(() => {
        Device.getUptimeAsync().then((uptimeMs) => {
          const remaining = Math.max(0, Math.floor((appExpiryTimestamp - uptimeMs) / 1000));
          setTimeLeft(remaining);
          if (remaining === 0) setTimerActive(false);
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerActive, appExpiryTimestamp]);

  useEffect(() => {
    const loadSavedTicket = async () => {
      try {
        const saved = await SecureStore.getItemAsync('savedTicket');
        if (saved) {
          const ticketData = JSON.parse(saved);
          const currentUptime = await Device.getUptimeAsync();
          if (ticketData.expiryTimestamp > currentUptime) {
            setInputText(ticketData.name);
            setGenerationMethod('svg');
            setAppExpiryTimestamp(ticketData.expiryTimestamp);
            setTicketGenerated(true);
            setTimerActive(true);
          } else {
            await SecureStore.deleteItemAsync('savedTicket');
          }
        }
      } catch (e) {
        console.error('Failed to load ticket', e);
      }
    };
    loadSavedTicket();
  }, []);

  const handleGenerate = async (method) => {
    if (!inputText.trim()) {
      Alert.alert('Error', 'Please enter some text');
      return;
    }
    const timeInSeconds = parseInt(inputTime, 10);
    if (isNaN(timeInSeconds) || timeInSeconds <= 0) {
      Alert.alert('Error', 'Please enter a valid time in seconds');
      return;
    }
    const currentUptime = await Device.getUptimeAsync();
    const expiryUptime = currentUptime + (timeInSeconds * 1000);
    
    setGenerationMethod(method);
    setTicketGenerated(true);
    setAppExpiryTimestamp(expiryUptime);
    setTimeLeft(timeInSeconds);
    setTimerActive(true);

    if (method === 'svg') {
      try {
        await SecureStore.setItemAsync('savedTicket', JSON.stringify({
          name: inputText,
          expiryTimestamp: expiryUptime
        }));
      } catch (e) {
        console.error('Failed to save ticket', e);
      }
    }
  };

  const handleDownload = async () => {
    if (generationMethod === 'html') {
      try {
        const absoluteExpiry = Date.now() + (timeLeft * 1000);
        const htmlContent = generateHTML(inputText, absoluteExpiry, parseInt(inputTime, 10));
        const fileUri = FileSystem.documentDirectory + 'PlatformTicket.html';
        await FileSystem.writeAsStringAsync(fileUri, htmlContent, { encoding: FileSystem.EncodingType.UTF8 });
        await Sharing.shareAsync(fileUri);
      } catch (error) {
        Alert.alert('Error', 'Failed to generate HTML: ' + error.message);
      }
      return;
    }

    if (status === null) {
      await requestPermission();
    }
    if (status && !status.granted) {
      const response = await requestPermission();
      if (!response.granted) {
        Alert.alert('Permission needed', 'Please grant permission to save images to gallery');
        return;
      }
    }

    try {
      const uri = await viewShotRef.current.capture();
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Success', 'Ticket image saved to gallery!');
    } catch (error) {
      Alert.alert('Error', 'Failed to save image: ' + error.message);
    }
  };

  // Format time (MM:SS)
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getBackgroundColor = (current, total) => {
    if (current <= 0) return '#e0e0e0'; // Grey
    const ratio = current / total;
    if (ratio > 0.5) return '#a5d6a7'; // Green
    return '#ef9a9a'; // Red
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Platform Ticket Generator</Text>
      
      {!ticketGenerated ? (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Enter name on ticket"
            value={inputText}
            onChangeText={setInputText}
          />
          <TextInput
            style={styles.input}
            placeholder="Expiry time in seconds (e.g. 60)"
            value={inputTime}
            onChangeText={setInputTime}
            keyboardType="numeric"
          />
          <TouchableOpacity style={styles.button} onPress={() => handleGenerate('html')}>
            <Text style={styles.buttonText}>Submit</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.resultContainer}>
          {/* ViewShot captures exactly what is rendered inside it */}
          <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1.0 }} style={styles.shotContainer}>
            {timeLeft === 0 ? (
              <View style={[styles.platformTicketCard, { backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center', height: 250 }]}>
                <Text style={{ fontSize: 40, fontWeight: 'bold', color: '#7f8c8d', letterSpacing: 4 }}>EXPIRED</Text>
              </View>
            ) : (
              <View style={[styles.platformTicketCard, { backgroundColor: getBackgroundColor(timeLeft, parseInt(inputTime, 10)) }]}>
                <View style={styles.ptHeader}>
                  <Text style={styles.ptHeaderText}>PLATFORM ( M-TICKET )</Text>
                  <Text style={styles.ptHeaderText}>FARE: ₹ 10.00</Text>
                </View>
                
                <View style={styles.ptContent}>
                  <View style={styles.ptStamp}>
                    <Text style={styles.ptStampText}>PAPERLESS</Text>
                  </View>
                  
                  <Text style={styles.ptNameRow}>NAME: {inputText}</Text>
                  
                  <View style={styles.ptDetailsRow}>
                    <Text style={styles.ptDetailsText}>PERSON: 1</Text>
                    <Text style={styles.ptDetailsText}>SECOND (II)</Text>
                    <Text style={styles.ptDetailsText}>ORDINARY (O)</Text>
                  </View>
                  
                  <View style={[styles.ptDetailsRow, { borderBottomWidth: 0 }]}>
                    <Text style={styles.ptDetailsText}>
                      BOOKING DATE: {new Date().toLocaleDateString('en-US', {month: 'short', day: '2-digit', year: 'numeric'}).toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.timerContainer}>
                    <Text style={styles.timerLabel}>Expires In:</Text>
                    <Text style={styles.timerValue}>
                      {formatTime(timeLeft)}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </ViewShot>

          <TouchableOpacity 
            style={[styles.button, timeLeft === 0 && styles.buttonDisabled]} 
            onPress={handleDownload}
            disabled={timeLeft === 0}
          >
            <Text style={styles.buttonText}>Download Image</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.buttonSecondary} onPress={() => setTicketGenerated(false)}>
            <Text style={styles.buttonTextSecondary}>Create New</Text>
          </TouchableOpacity>
        </View>
      )}
      
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    paddingTop: 60,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    color: '#333',
  },
  inputContainer: {
    width: '80%',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
    width: 250,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
    width: 250,
  },
  buttonTextSecondary: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resultContainer: {
    width: '100%',
    alignItems: 'center',
  },
  shotContainer: {
    backgroundColor: '#f5f5f5', 
    padding: 20,
    width: '100%',
    alignItems: 'center',
  },
  platformTicketCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    width: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#ddd',
    overflow: 'hidden',
  },
  ptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.3)',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  ptHeaderText: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#111',
  },
  ptContent: {
    padding: 15,
    position: 'relative',
  },
  ptStamp: {
    position: 'absolute',
    top: '30%',
    left: '30%',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: 'rgba(76, 175, 80, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ rotate: '-20deg' }],
    zIndex: 1,
  },
  ptStampText: {
    color: 'rgba(76, 175, 80, 0.3)',
    fontSize: 18,
    fontWeight: 'bold',
  },
  ptNameRow: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    zIndex: 2,
  },
  ptDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    zIndex: 2,
  },
  ptDetailsText: {
    fontSize: 12,
    color: '#666',
  },
  timerContainer: {
    alignItems: 'center',
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    width: '100%',
    zIndex: 2,
  },
  timerLabel: {
    fontSize: 12,
    color: '#888',
  },
  timerValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#e74c3c',
    marginTop: 5,
  },
  timerExpired: {
    color: '#95a5a6',
  },
});
