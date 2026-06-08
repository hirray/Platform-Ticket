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

  const generateHTML = (name, qrBase64, expiryTimestamp, initialSeconds) => `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f5f5f5; font-family: sans-serif; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  .watermark { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: repeating-linear-gradient(45deg, rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 20px, transparent 20px, transparent 40px); animation: moveWatermark 2s linear infinite; pointer-events: none; z-index: 10; }
  @keyframes moveWatermark { from { background-position: 0 0; } to { background-position: 56px 0; } }
  .card { background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center; position: relative; z-index: 5; width: 250px; }
  h1 { font-size: 20px; margin: 0 0 10px 0; color: #333; letter-spacing: 2px; }
  h2 { font-size: 18px; color: #666; margin: 0 0 20px 0; }
  img { width: 150px; height: 150px; margin-bottom: 20px; pointer-events: none; }
  .timer-label { font-size: 14px; color: #888; }
  .timer-value { font-size: 28px; font-weight: bold; color: #e74c3c; margin-top: 5px; }
  .expired { color: #95a5a6; }
  #overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: black; z-index: 9999; display: none; }
</style>
</head>
<body>
  <div id="overlay"></div><div class="watermark"></div>
  <div class="card">
    <h1>GYM DAY-PASS</h1><h2>${name}</h2>
    <img id="qr" src="${qrBase64}" />
    <div class="timer-label">Expires In:</div>
    <div id="timer" class="timer-value">${Math.floor(initialSeconds / 60).toString().padStart(2, '0')}:${(initialSeconds % 60).toString().padStart(2, '0')}</div>
  </div>
  <script>
    document.addEventListener('visibilitychange', () => { document.getElementById('overlay').style.display = document.hidden ? 'block' : 'none'; });
    window.addEventListener('blur', () => { document.getElementById('overlay').style.display = 'block'; });
    window.addEventListener('focus', () => { document.getElementById('overlay').style.display = 'none'; });
    const expiryTimestamp = ${expiryTimestamp};
    const timerEl = document.getElementById('timer'); 
    const qrEl = document.getElementById('qr');
    
    const updateTimer = () => {
      const now = Date.now();
      const timeLeft = Math.max(0, Math.floor((expiryTimestamp - now) / 1000));
      
      if(timeLeft <= 0) { 
        if (window.timerInterval) clearInterval(window.timerInterval); 
        timerEl.textContent = 'EXPIRED'; 
        timerEl.classList.add('expired'); 
        qrEl.style.opacity = '0.2'; 
      } else { 
        const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0'); 
        const secs = (timeLeft % 60).toString().padStart(2, '0'); 
        timerEl.textContent = mins + ':' + secs; 
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
        qrRef.current.toDataURL(async (data) => {
          const base64Image = `data:image/png;base64,${data}`;
          // For HTML absolute time, we generate it based on wall clock so HTML timers work independently
          const absoluteExpiry = Date.now() + (timeLeft * 1000);
          const htmlContent = generateHTML(inputText, base64Image, absoluteExpiry, parseInt(inputTime, 10));
          const fileUri = FileSystem.documentDirectory + 'GymPass.html';
          await FileSystem.writeAsStringAsync(fileUri, htmlContent, { encoding: FileSystem.EncodingType.UTF8 });
          await Sharing.shareAsync(fileUri);
        });
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

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Expo Ticket Generator</Text>
      
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
            <Text style={styles.buttonText}>Through html file</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => handleGenerate('svg')}>
            <Text style={styles.buttonText}>through svg extenxion</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.resultContainer}>
          {/* ViewShot captures exactly what is rendered inside it */}
          <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1.0 }} style={styles.shotContainer}>
            <View style={styles.ticketCard}>
              <Text style={styles.ticketTitle}>GYM DAY-PASS</Text>
              <Text style={styles.ticketName}>{inputText}</Text>
              
              <View style={styles.qrContainer}>
                <QRCode
                  value={generateAsymmetricToken({ name: inputText, type: 'DayPass', expiresAt: Date.now() + (timeLeft * 1000) })}
                  size={150}
                  color="black"
                  backgroundColor="white"
                  getRef={(c) => (qrRef.current = c)}
                />
              </View>
              
              <View style={styles.timerContainer}>
                <Text style={styles.timerLabel}>Expires In:</Text>
                <Text style={[styles.timerValue, timeLeft === 0 && styles.timerExpired]}>
                  {timeLeft > 0 ? formatTime(timeLeft) : 'EXPIRED'}
                </Text>
              </View>
            </View>
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
  ticketCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: 300,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#eee',
  },
  ticketTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    letterSpacing: 2,
  },
  ticketName: {
    fontSize: 18,
    color: '#666',
    marginBottom: 20,
  },
  qrContainer: {
    padding: 10,
    backgroundColor: '#fff',
    marginBottom: 20,
  },
  timerContainer: {
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    width: '100%',
  },
  timerLabel: {
    fontSize: 14,
    color: '#888',
  },
  timerValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#e74c3c',
    marginTop: 5,
  },
  timerExpired: {
    color: '#95a5a6',
  },
});
