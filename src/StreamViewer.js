import React, { useState, useEffect, useRef } from "react";
import mqtt from "mqtt";
import playIcon from "./play-button.png";
import stopIcon from "./stop-button.png";
import thumbnail from "./thumbnail.jpg";

const StreamViewer = ({ deviceId, cameraName }) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamUrl, setStreamUrl] = useState(thumbnail);
  const [mqttClient, setMqttClient] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("waiting");
  const videoStreamRef = useRef(null);
  const imageStreamRef = useRef(null);
  const audioStreamRef = useRef(null);
  const deviceIdRef = useRef(deviceId);
  const statusRef = useRef("waiting");
  const stopIconRef = useRef(null);
  const mqttClientRef = useRef(null);

  const pcRef = useRef(null);
  const dataChannelRef = useRef(null);
  const offerIdRef = useRef(Math.floor(Math.random() * 1000 + 1));
  const answerIdRef = useRef(Math.floor(Math.random() * 1000 + 1));
  const closeIdRef = useRef(Math.floor(Math.random() * 1000 + 1));
  const isPlayingRef = useRef(true);
  const rotateRef = useRef(0);

  // MQTT broker details
  const MQTT_BROKER_URL = "wss://d457c1d9.ala.eu-central-1.emqxsl.com:8084/mqtt";
  const MQTT_USERNAME = "client";
  const MQTT_PASSWORD = "client";
  const PUBLISH_TOPIC = `webrtc/${deviceIdRef.current}/jsonrpc`;
  const SUBSCRIBE_TOPIC = `webrtc/${deviceIdRef.current}/jsonrpc-reply`;

  useEffect(() => {
    // Update the deviceId ref if the prop changes.
    deviceIdRef.current = deviceId;
    statusRef.current = connectionStatus;

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
        } else {
          console.log(`Subscribed to topic: ${SUBSCRIBE_TOPIC}`);
        }
        sendOffer();
      });
    });

    client.on('error', (error) => {
      console.error("MQTT Error:", error);
      setConnectionStatus("error");
      statusRef.current = "error";
      updateStatusDisplay("error");
    });

    client.on('message', (topic, message) => {
      handleMessage(message.toString());
    });

    client.on('close', () => {
      console.log("MQTT closed for device:", deviceIdRef.current);
      setConnectionStatus("disconnected");
      statusRef.current = "disconnected";
      updateStatusDisplay("disconnected");
    });

    return () => {
      if (mqttClientRef.current) {
        mqttClientRef.current.end(true);
        mqttClientRef.current = null;
      }
      stopWebRTC();
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
    isPlayingRef.current = false;
    updateStopIcon();
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
    };

    pcRef.current.ontrack = event => {
      if (event.track.kind === 'video') {
        handleVideoTrack(event.track);
      } else if (event.track.kind === 'audio') {
        handleAudioTrack(event.track);
      }
    };

    pcRef.current.ondatachannel = event => {
      console.log('Data channel received for device:', deviceIdRef.current, event.channel);
      dataChannelRef.current = event.channel;
      setupDataChannelHandlers();
    };
  };

  const setupDataChannelHandlers = () => {
    if (!dataChannelRef.current) return;

    dataChannelRef.current.onopen = () => {
      console.log('Data channel opened for device:', deviceIdRef.current);
      setIsStreaming(true);
      statusRef.current = "streaming";
      updateStatusDisplay("streaming");
      isPlayingRef.current = true;
      updateStopIcon();
    };

    dataChannelRef.current.onclose = () => {
      console.log('Data channel closed for device:', deviceIdRef.current);
      setIsStreaming(false);
      setStreamUrl(thumbnail);
      statusRef.current = "waiting";
      updateStatusDisplay("waiting");
      isPlayingRef.current = false;
      updateStopIcon();
    };

    dataChannelRef.current.onmessage = event => {
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
    const statusElem = document.getElementById(`status-${deviceIdRef.current}`);
    if (statusElem) {
      statusElem.innerHTML = status;
    }
  };

  const sendOffer = () => {
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
  };

  const sendIceCandidate = (candidate) => {
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
    }
  };

  const handleAnswerResponse = () => {
    console.log('Received Answer OK for device:', deviceIdRef.current);
  };

  const handleAudioTrack = (track) => {
    if (audioStreamRef.current) {
      const newStream = new MediaStream();
      newStream.addTrack(track);
      audioStreamRef.current.srcObject = newStream;
      audioStreamRef.current.controls = false;
      audioStreamRef.current.muted = false;
    }
  };

  const onStop = () => {
    if (!isPlayingRef.current) {
      sendCloseSignal();
      if (stopIconRef.current) {
        stopIconRef.current.className = 'fa-solid fa-circle-play';
      }
      stopWebRTC();
    } else {
      if (stopIconRef.current) {
        stopIconRef.current.className = 'fa-solid fa-circle-stop';
      }
      sendOffer();
    }
    updateStopIcon();
  };

  const updateStopIcon = () => {
    if (stopIconRef.current) {
      stopIconRef.current.className = isPlayingRef.current ? 'fa-solid fa-circle-stop' : 'fa-solid fa-circle-play';
    }
  };


  const logError = (msg, error) => {
    console.error(msg, error);
    setConnectionStatus("error");
    statusRef.current = "error";
    updateStatusDisplay("error");
  };

  return (
    <div style={{ marginBottom: "20px" }}>
      <div className="card">
        <div className="container">
          <img id={`imgStream-${deviceId}`} ref={imageStreamRef} style={{ width: '100%' }} src={streamUrl} alt="Stream Thumbnail" />
          <video id={`videoStream-${deviceId}`} ref={videoStreamRef} playsInline style={{ width: '100%', display: 'none' }}></video>
          <audio id={`audioStream-${deviceId}`} ref={audioStreamRef} style={{ display: 'none' }}></audio>  
          <p className="top-right" id={`status-${deviceId}`}>{connectionStatus}</p>
        </div>
        <div className="btn-group" style={{ width: '100%' }}>
          <button style={{ width: '25%' }} className="btn" onClick={onStop}>
            <i id="stop-icon" ref={stopIconRef} className="fa-solid fa-circle-play"></i>
          </button>
        </div>
      </div>
    </div>
  );
};

export default StreamViewer;
