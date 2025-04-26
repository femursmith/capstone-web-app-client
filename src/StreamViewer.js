import React, { useState, useEffect, useRef } from "react";
import mqtt from "mqtt";
import playIcon from "./play-button.png";
import stopIcon from "./stop-button.png";
import thumbnail from "./thumbnail.jpg";
import loadingGif from "./loading.gif"; // Import loading.gif
import styles from './EventGallery.module.css'; // Import CSS module

const StreamViewer = ({ deviceId, cameraName }) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamUrl, setStreamUrl] = useState(thumbnail);
  const [mqttClient, setMqttClient] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("waiting");
  const [isLoading, setIsLoading] = useState(false);
  const [iceRetryCount, setIceRetryCount] = useState(0); // Retry counter
  const videoStreamRef = useRef(null);
  const imageStreamRef = useRef(null);
  const audioStreamRef = useRef(null);
  const deviceIdRef = useRef(deviceId);
  const statusRef = useRef("waiting");
  const stopIconRef = useRef(null);
  const mqttClientRef = useRef(null);
  const iceRetryTimeoutRef = useRef(null); // Ref for timeout

  const pcRef = useRef(null);
  const dataChannelRef = useRef(null);
  const offerIdRef = useRef(Math.floor(Math.random() * 1000 + 1));
  const answerIdRef = useRef(Math.floor(Math.random() * 1000 + 1));
  const closeIdRef = useRef(Math.floor(Math.random() * 1000 + 1));
  const isPlayingRef = useRef(true);
  const rotateRef = useRef(0);

  // Playback feature states
  const [mode, setMode] = useState("live"); // 'live' or 'playback'
  const [playbackDate, setPlaybackDate] = useState("");
  const [playbackTime, setPlaybackTime] = useState("");
  const [showLiveButton, setShowLiveButton] = useState(false); // Initially hidden in live mode

  // Retry configuration
  const MAX_ICE_RETRIES = 3; // Maximum number of retries
  const ICE_RETRY_DELAY = 5000; // Delay in milliseconds before retry (5 seconds)

  // MQTT broker details
  const MQTT_BROKER_URL = "wss://d457c1d9.ala.eu-central-1.emqxsl.com:8084/mqtt";
  const MQTT_USERNAME = "client";
  const MQTT_PASSWORD = "client";
  const PUBLISH_TOPIC = `webrtc/${deviceIdRef.current}/jsonrpc`;
  const SUBSCRIBE_TOPIC = `webrtc/${deviceIdRef.current}/jsonrpc-reply`;


  useEffect(() => {
    // Reset retry counter when deviceId changes
    setIceRetryCount(0);
    // ... (MQTT connection and setup - same as before)
    deviceIdRef.current = deviceId;
    statusRef.current = connectionStatus;
    setIsLoading(false);
    setMode("live"); // Default to live mode on component mount
    setShowLiveButton(false); // Hide live button initially

    const options = {
      keepalive: 600,
      clientId: "client_" + deviceIdRef.current,
      clean: true,
      connectTimeout: 4000,
      reconnectPeriod: 4000,
      will: {
        topic: `webrtc/${deviceIdRef.current}/status`,
        payload: 'Connection Lost',
        qos: 0,
        retain: false
      },
      rejectUnauthorized: false,
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD,
      protocol: 'wss',
      port: parseInt(MQTT_BROKER_URL.split(":")[2]) || 8084
    };

    const client = mqtt.connect(MQTT_BROKER_URL, options);
    mqttClientRef.current = client;
    setMqttClient(client);

    client.on('connect', () => {
      console.log("MQTT connected for device:", deviceIdRef.current);
      setConnectionStatus("connected");
      statusRef.current = "connected";
      updateStatusDisplay("connected");

      client.subscribe(SUBSCRIBE_TOPIC, { qos: 0 }, (error) => {
        if (error) {
          console.error("Subscribe error:", error);
          setConnectionStatus("error");
          statusRef.current = "error";
          updateStatusDisplay("error");
          setIsLoading(false);
        } else {
          console.log(`Subscribed to topic: ${SUBSCRIBE_TOPIC}`);
          
        }
      });
    });

    client.on('error', (error) => {
      console.error("MQTT Error:", error);
      setConnectionStatus("error");
      statusRef.current = "error";
      updateStatusDisplay("error");
      setIsLoading(false);
    });

    client.on('message', (topic, message) => {
      handleMessage(message.toString());
    });

    client.on('close', () => {
      console.log("MQTT closed for device:", deviceIdRef.current);
      setConnectionStatus("disconnected");
      statusRef.current = "disconnected";
      updateStatusDisplay("disconnected");
      setIsLoading(false);
    });

    return () => {
      if (mqttClientRef.current) {
        mqttClientRef.current.end(true);
        mqttClientRef.current = null;
      }
      stopWebRTC();
      if (iceRetryTimeoutRef.current) { // Clear timeout on unmount just in case
        clearTimeout(iceRetryTimeoutRef.current);
      }
    };
  }, [deviceId]);

  useEffect(() => {
    // Update display to show the camera name (instead of the raw device id)
    const deviceElem = document.getElementById(`device-id-${deviceIdRef.current}`);
    if (deviceElem) {
      deviceElem.innerHTML = cameraName;
    }
  }, [deviceId, cameraName]);

  const handleMessage = (message) => {
    // ... (handleMessage function - same as before)
    try {
      const msg = JSON.parse(message);
      console.log("Received Message for device", deviceIdRef.current, ":", msg);
      if (msg.id === offerIdRef.current) {
        const offer = { type: 'offer', sdp: msg.result };
        handleOfferResponse(offer);
      } else if (msg.method === answerIdRef.current) {
        handleAnswerResponse();
      }
    } catch (error) {
      console.error("Error parsing message:", message, error);
    }
  };

  const startWebRTC = () => {
    // ... (startWebRTC function - same as before)
    pcRef.current = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    dataChannelRef.current = pcRef.current.createDataChannel('pear');
    setupDataChannelHandlers();
    setupPeerConnectionHandlers();

    navigator.mediaDevices.getUserMedia({ video: false, audio: true })
      .then(stream => {
        stream.getTracks().forEach(track => pcRef.current.addTrack(track, stream));
      }).catch(logError);
  };

  const stopWebRTC = () => {
    // ... (stopWebRTC function - same as before)
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    setIsStreaming(false);
    setStreamUrl(thumbnail);
    isPlayingRef.current = true;
    updateStopIcon();
    setIsLoading(false);
    setIceRetryCount(0); // Reset retry counter on stop
    if (iceRetryTimeoutRef.current) {
        clearTimeout(iceRetryTimeoutRef.current); // Clear any pending retry timeouts
    }
    console.log("WebRTC Stopped for device:", deviceIdRef.current);
  };

  const setupPeerConnectionHandlers = () => {
    if (!pcRef.current) return;

    pcRef.current.onicecandidate = event => {
      if (event.candidate == null) {
        console.log("Local SDP for device:", deviceIdRef.current, pcRef.current.localDescription.sdp);
        sendAnswer();
      }
    };

    pcRef.current.oniceconnectionstatechange = () => {
      console.log("ICE Connection State Change for device:", deviceIdRef.current, pcRef.current.iceConnectionState);
      setConnectionStatus(pcRef.current.iceConnectionState);
      statusRef.current = pcRef.current.iceConnectionState;
      updateStatusDisplay(pcRef.current.iceConnectionState);

      if (pcRef.current.iceConnectionState === 'connected' || pcRef.current.iceConnectionState === 'completed') {
        setIsLoading(false);
        setIceRetryCount(0); // Reset retry counter on success
        if (iceRetryTimeoutRef.current) {
            clearTimeout(iceRetryTimeoutRef.current); // Clear any pending retry timeouts
        }
      } else if (pcRef.current.iceConnectionState === 'failed' || pcRef.current.iceConnectionState === 'disconnected' || pcRef.current.iceConnectionState === 'closed') {
        setIsLoading(false); // Stop loading UI, but may retry
        if (iceRetryTimeoutRef.current) {
            clearTimeout(iceRetryTimeoutRef.current); // Clear any existing timeout to prevent overlaps
        }

        if (iceRetryCount < MAX_ICE_RETRIES) {
          setIceRetryCount(prevCount => prevCount + 1);
          console.log(`ICE connection failed, retrying in ${ICE_RETRY_DELAY/1000} seconds... (Attempt ${iceRetryCount + 1}/${MAX_ICE_RETRIES})`);
          setConnectionStatus(`retrying... (${iceRetryCount + 1}/${MAX_ICE_RETRIES})`);
          statusRef.current = `retrying... (${iceRetryCount + 1}/${MAX_ICE_RETRIES})`;
          updateStatusDisplay(`retrying... (${iceRetryCount + 1}/${MAX_ICE_RETRIES})`);

          iceRetryTimeoutRef.current = setTimeout(() => {
            if (pcRef.current && pcRef.current.iceConnectionState !== 'connected' && pcRef.current.iceConnectionState !== 'completed') {
              console.log("Retrying ICE connection...");
              sendOffer(); // Retry sending offer
              if (mode === "live") {
                  sendLiveModeRequest(); // Resend live mode request
              } else if (mode === "playback") {
                  sendPlaybackModeRequest(); // Resend playback mode request
              }
              setIsLoading(true); // Show loading again during retry
            }
          }, ICE_RETRY_DELAY);
        } else {
          console.warn(`Max ICE connection retries reached (${MAX_ICE_RETRIES}). Connection failed.`);
          setConnectionStatus("failed (max retries)");
          statusRef.current = "failed (max retries)";
          updateStatusDisplay("failed (max retries)");
        }
      }
    };

    pcRef.current.ontrack = event => {
      // ... (ontrack handler - same as before)
      if (event.track.kind === 'video') {
        handleVideoTrack(event.track);
      } else if (event.track.kind === 'audio') {
        handleAudioTrack(event.track);
      }
    };

    pcRef.current.ondatachannel = event => {
      // ... (ondatachannel handler - same as before)
      console.log('Data channel received for device:', deviceIdRef.current, event.channel);
      dataChannelRef.current = event.channel;
      setupDataChannelHandlers();
    };
  };

  const setupDataChannelHandlers = () => {
    // ... (setupDataChannelHandlers - same as before)
    if (!dataChannelRef.current) return;

    dataChannelRef.current.onopen = () => {
      console.log('Data channel opened for device:', deviceIdRef.current);
      setIsStreaming(true);
      statusRef.current = "streaming";
      updateStatusDisplay("streaming");
      isPlayingRef.current = false;
      updateStopIcon();
      setIsLoading(false);
    };

    dataChannelRef.current.onclose = () => {
      // ... (onclose handler - same as before)
      console.log('Data channel closed for device:', deviceIdRef.current);
      setIsStreaming(false);
      setStreamUrl(thumbnail);
      statusRef.current = "waiting";
      updateStatusDisplay("waiting");
      isPlayingRef.current = true;
      updateStopIcon();
      setIsLoading(false);
    };

    dataChannelRef.current.onmessage = event => {
      // ... (onmessage handler - same as before)
      if (event.data instanceof ArrayBuffer) {
        const blob = new Blob([event.data], { type: "image/jpeg" });
        const urlCreator = window.URL || window.webkitURL;
        const imageUrl = urlCreator.createObjectURL(blob);
        if (imageStreamRef.current) {
          imageStreamRef.current.src = imageUrl;
          imageStreamRef.current.style.display = 'block';
        }
        if (videoStreamRef.current) {
          videoStreamRef.current.style.display = 'none';
        }
      } else {
        console.log("Data channel message for device:", deviceIdRef.current, event.data);
      }
    };
  };

  const handleVideoTrack = (track) => {
    // ... (handleVideoTrack - same as before)
    if (videoStreamRef.current) {
      const newStream = new MediaStream();
      newStream.addTrack(track);
      videoStreamRef.current.srcObject = newStream;
      videoStreamRef.current.autoplay = true;
      videoStreamRef.current.controls = false;
      videoStreamRef.current.muted = true;
      videoStreamRef.current.style.display = 'block';
      if (imageStreamRef.current) {
        imageStreamRef.current.style.display = 'none';
      }
    }
  };

  const updateStatusDisplay = (status) => {
    // ... (updateStatusDisplay - same as before)
    const statusElem = document.getElementById(`status-${deviceIdRef.current}`);
    if (statusElem) {
      statusElem.innerHTML = status;
    }
  };

  const sendOffer = () => {
    // ... (sendOffer - same as before)
    const client = mqttClientRef.current;
    if (!client || !client.connected) {
      console.warn("MQTT Client not connected for device:", deviceIdRef.current);
      return;
    }

    const json = {
      jsonrpc: '2.0',
      method: 'offer',
      id: offerIdRef.current,
    };
    console.log("Sending Offer for device:", deviceIdRef.current, json);
    client.publish(PUBLISH_TOPIC, JSON.stringify(json), { qos: 2 });
    setIsLoading(true);
  };

  const sendLiveModeRequest = () => {
    const client = mqttClientRef.current;
    if (!client || !client.connected) {
      console.warn("MQTT Client not connected for device:", deviceIdRef.current);
      return;
    }
    const payload = {"mode":"live"};
    console.log("Sending Live Mode Request for device:", deviceIdRef.current, payload);
    client.publish(PUBLISH_TOPIC, JSON.stringify(payload), { qos: 0 });
    setMode("live");
    
  };

  const sendPlaybackModeRequest = () => {
    const client = mqttClientRef.current;
    if (!client || !client.connected) {
      console.warn("MQTT Client not connected for device:", deviceIdRef.current);
      return;
    }
    if (!playbackDate || !playbackTime) {
        console.warn("Playback date and time must be selected.");
        // Optionally show a user-friendly message here
        alert("Please select both a date and a time for playback.");
        return;
    }

    // Stop existing stream before changing mode
    

    // --- Format the time ---
    let formattedTime = "00-00-00"; // Default/fallback
    try {
        const timeParts = playbackTime.split(':'); // Should give ["HH", "MM"] or ["HH", "MM", "SS"]
        const hh = timeParts[0]?.padStart(2, '0') || '00'; // Add padding for safety
        const mm = timeParts[1]?.padStart(2, '0') || '00';
        const ss = timeParts[2]?.padStart(2, '0') || '00'; // Use provided seconds or default to '00'
        formattedTime = `${hh}-${mm}-${ss}`;
    } catch (e) {
        console.error("Error formatting playback time:", playbackTime, e);
        // Keep the default "00-00-00" or handle error appropriately
    }
    // --- End Formatting ---

    const payload = {
      "mode": "playback",
      "date": playbackDate, // Assumes YYYY-MM-DD from input type="date"
      "time": formattedTime // Use the HH-MM-SS formatted time
    };

    console.log("Sending Playback Mode Request for device:", deviceIdRef.current, payload);
    client.publish(PUBLISH_TOPIC, JSON.stringify(payload), { qos: 0 }, (err) => {
        if (err) {
            console.error("MQTT Publish Error (Playback Mode):", err);
        } else {
            setMode("playback");
        }
    });
  };


  const sendIceCandidate = (candidate) => {
    // ... (sendIceCandidate - same as before)
    const client = mqttClientRef.current;
    if (!client || !client.connected) {
      console.warn("MQTT Client not connected for device:", deviceIdRef.current);
      return;
    }
    const json = {
      jsonrpc: '2.0',
      method: 'candidate',
      params: candidate.toJSON(),
      id: Date.now()
    };
    console.log("Sending ICE Candidate for device:", deviceIdRef.current, json);
    client.publish(PUBLISH_TOPIC, JSON.stringify(json), { qos: 0 });
  };

  const sendAnswer = () => {
    // ... (sendAnswer - same as before)
    const client = mqttClientRef.current;
    if (!client || !client.connected) {
      console.warn("MQTT Client not connected for device:", deviceIdRef.current);
      return;
    }
    if (!pcRef.current || !pcRef.current.localDescription) {
      console.error("Peer connection not initialized for device:", deviceIdRef.current);
      return;
    }

    const json = {
      jsonrpc: '2.0',
      method: 'answer',
      params: pcRef.current.localDescription.sdp,
      id: answerIdRef.current,
    };
    console.log("Sending Answer for device:", deviceIdRef.current, json);
    client.publish(PUBLISH_TOPIC, JSON.stringify(json), { qos: 0 });
  };

  const sendCloseSignal = () => {
    // ... (sendCloseSignal - same as before)
    const client = mqttClientRef.current;
    if (!client || !client.connected) {
      console.warn("MQTT Client not connected for device:", deviceIdRef.current);
      return;
    }
    const json = {
      jsonrpc: '2.0',
      method: 'close',
      id: closeIdRef.current,
    };
    console.log("Sending Close Signal for device:", deviceIdRef.current, json);
    client.publish(PUBLISH_TOPIC, JSON.stringify(json), { qos: 0 });
  };

  const handleOfferResponse = async (offer) => {
    // ... (handleOfferResponse - same as before)
    console.log("Received Offer for device:", deviceIdRef.current, offer);
    if (!pcRef.current) {
      startWebRTC();
    }

    try {
      await pcRef.current.setRemoteDescription(offer);
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      // Answer is sent via onicecandidate event.
    } catch (error) {
      logError("Error handling offer for device:", error);
      setIsLoading(false);
    }
  };

  const handleAnswerResponse = () => {
    // ... (handleAnswerResponse - same as before)
    console.log('Received Answer OK for device:', deviceIdRef.current);
  };

  const handleAudioTrack = (track) => {
    // ... (handleAudioTrack - same as before)
    if (audioStreamRef.current) {
      const newStream = new MediaStream();
      newStream.addTrack(track);
      audioStreamRef.current.srcObject = newStream;
      audioStreamRef.current.controls = false;
      audioStreamRef.current.muted = false;
    }
  };

  const onStop = () => {
    if (isPlayingRef.current) {
      sendOffer(); // Send offer to start/restart stream
      isPlayingRef.current = false;
      updateStopIcon();
    } else {
      sendCloseSignal(); // Send close signal to stop stream
      isPlayingRef.current = true;
      updateStopIcon();
      stopWebRTC();
    }
  };

  const updateStopIcon = () => {
    // ... (updateStopIcon - same as before)
    if (stopIconRef.current) {
      stopIconRef.current.src = isPlayingRef.current ? playIcon : stopIcon;
      stopIconRef.current.alt = isPlayingRef.current ? "Play" : "Stop";
    }
  };

  const logError = (msg, error) => {
    // ... (logError - same as before)
    console.error(msg, error);
    setConnectionStatus("error");
    statusRef.current = "error";
    updateStatusDisplay("error");
    setIsLoading(false);
  };

  const handleLiveButtonClick = () => {
    sendLiveModeRequest();
  };

  const handlePlaybackButtonClick = () => {
    setMode("playback");
    setShowLiveButton(true); // Show live button when in playback mode
  };

  const handleDateChange = (event) => {
    setPlaybackDate(event.target.value);
  };

  const handleTimeChange = (event) => {
    setPlaybackTime(event.target.value);
  };

  const onPlaybackSubmit = (event) => {
    event.preventDefault(); // Prevent default form submission
    sendPlaybackModeRequest();
    // Request new offer after mode switch
  };


  return (
    <div style={{ marginBottom: "20px" }} className={styles.galleryContainer}>
      <div className="card">
        <div className={`${styles.mediaWrapper} ${styles.container}`} style={{ minHeight: '200px', display: isLoading ? 'flex' : 'block', flexDirection: 'column', justifyContent: 'center', alignItems: 'center'}}>
          {isLoading && (
            <>
              <img src={loadingGif} alt="Loading..." style={{ width: '50px', height: '50px' }} />
              <p style={{ marginTop: '5px' }} id={`status-${deviceId}`}>{connectionStatus}</p>
            </>
          )}
          {!isLoading && (
            <>
              <img id={`imgStream-${deviceId}`} ref={imageStreamRef} className={styles.mediaElement} src={streamUrl} alt="Stream Thumbnail" style={{display: 'block'}} />
              <video id={`videoStream-${deviceId}`} ref={videoStreamRef} playsInline className={styles.mediaElement} style={{ width: '100%', display: 'none' }}></video>
              <audio id={`audioStream-${deviceId}`} ref={audioStreamRef} style={{ display: 'none' }}></audio>
            </>
          )}
        </div>
        <div className="btn-group" style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{display: 'flex', flexDirection: 'row', justifyContent: 'space-between'}}>
            <button style={{ width: '25%' }} className="btn" onClick={onStop}>
              <img id="stop-icon" ref={stopIconRef} src={isPlayingRef.current ? playIcon : stopIcon} alt={isPlayingRef.current ? "Play" : "Stop"} style={{ width: '20px', height: '20px' }} />
            </button>
            
              <button style={{ width: '25%' }} className="btn" onClick={handleLiveButtonClick}>
                Live
              </button>
            
          </div>

          {mode === "playback" && (
            <form onSubmit={onPlaybackSubmit} style={{display:'flex', flexDirection: 'row', justifyContent: 'center', marginTop: '10px'}}>
              <input type="date" className="btn" value={playbackDate} onChange={handleDateChange} style={{marginRight: '5px'}} required />
              <input type="time" className="btn" value={playbackTime} onChange={handleTimeChange} required />
              <button type="submit" className="btn" style={{marginLeft: '5px'}}>Playback</button>
            </form>
          )}
          {mode === "live" && (
              <button style={{ width: '100%', marginTop: '10px', backgroundColor: '#eee', color: '#333', border: 'none', padding: '10px', cursor: 'pointer', borderRadius: '5px', textAlign: 'center' }} onClick={handlePlaybackButtonClick}>
                Go to Playback
              </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StreamViewer;