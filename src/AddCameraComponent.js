import React, { useState, useEffect } from "react";
import mqtt from "mqtt";

const MQTT_BROKER_URL = "wss://d457c1d9.ala.eu-central-1.emqxsl.com:8084/mqtt";
const MQTT_USERNAME = "client";
const MQTT_PASSWORD = "client";
const DEVICE_ID = "kwameManu2";
const PUBLISH_TOPIC = `webrtc/${DEVICE_ID}/jsonrpc`;
const SUBSCRIBE_TOPIC = `webrtc/${DEVICE_ID}/jsonrpc-reply`;
// Simple GUID generator (for demonstration)
function generateGUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const AddCameraComponent = ({ userId, onCameraAdded }) => {
  const [cameraSecret, setCameraSecret] = useState("");
  const [cameraName, setCameraName] = useState(""); // Field for camera name
  const [adding, setAdding] = useState(false);
  const [mqttClient, setMqttClient] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [cameraId, setCameraId] = useState(null);
  const [message, setMessage] = useState("");

  // Create MQTT client on mount.
  useEffect(() => {
    const options = {
          keepalive: 600,
          clientId: "client",
          clean: true,
          connectTimeout: 4000,
          reconnectPeriod: 4000,
          rejectUnauthorized: false,
          username: MQTT_USERNAME,
          password: MQTT_PASSWORD,
          protocol: 'wss',
          port: parseInt(MQTT_BROKER_URL.split(":")[2]) || 8084
        };
    
        const client = mqtt.connect(MQTT_BROKER_URL, options);
    
    setMqttClient(client);
    client.on("connect", () => {
      console.log("MQTT client connected for AddCameraComponent");
    });
    return () => {
      if (client) client.end();
    };
  }, []);

  const handleAddCamera = () => {
    if (!cameraSecret || !cameraName) return; // both fields are required
    setAdding(true);
    setMessage("Subscribing to reply topic...");
    const replyTopic = `webrtc/${cameraSecret}/jsonrpc-reply`;
    // Subscribe to the reply topic.
    mqttClient.subscribe(replyTopic, (err) => {
      if (err) {
        console.error("Subscription error:", err);
        setMessage("Subscription error");
        setAdding(false);
      } else {
        // Generate camera ID and publish immediately.
        const newCameraId = generateGUID();
        setCameraId(newCameraId);
  
        // Retrieve the local user ID from props/localStorage
        let localUserId = userId;
        const storedUser = localStorage.getItem("userData");
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser);
            if (parsedUser.userId) {
              localUserId = parsedUser.userId;
            }
          } catch (e) {
            console.error("Error parsing userData from localStorage:", e);
          }
        }
        
        // Create payload with both cameraId and userId
        const payload = JSON.stringify({
          cameraid: newCameraId,
          userId: localUserId,
        });
        setMessage("Sending Camera ID and User ID...");
        const publishTopic = `webrtc/${cameraSecret}/jsonrpc`;
        mqttClient.publish(publishTopic, payload, (err) => {
          if (err) {
            console.error("Publish error:", err);
            setMessage("Error sending camera ID and user ID");
            setAdding(false);
          } else {
            setMessage("Camera initialization message sent. Waiting for confirmation...");
          }
        });
      }
    });
  };
  

  // Listen for messages on the subscribed reply topic.
  useEffect(() => {
    if (!mqttClient || !cameraSecret) return;
    const replyTopic = `webrtc/${cameraSecret}/jsonrpc-reply`;

    const messageHandler = (topic, messageBuffer) => {
      if (topic === replyTopic) {
        const msgString = messageBuffer.toString();
        console.log("Received MQTT message on reply topic:", msgString);
        try {
          const msgObj = JSON.parse(msgString);
          // Check for the initialization confirmation message.
          if (
            msgObj.jsonrpc === "2.0" &&
            msgObj.result &&
            msgObj.result.toLowerCase().includes("initialization")
          ) {
            setMessage("Initialization successful. Registering camera...");
           
            // Prepare the request payload.
            const storedUser = localStorage.getItem("userData");
            let localUserId = userId; // Fallback to prop if not available in localStorage
            if (storedUser) {
              try {
                const parsedUser = JSON.parse(storedUser);
                if (parsedUser.userId) {
                  localUserId = parsedUser.userId;
                }
              } catch (e) {
                console.error("Error parsing userData from localStorage:", e);
              }
            }

            // Prepare the request payload using the retrieved userId
            const requestBody = JSON.stringify({
              userId: localUserId,
              cameraId,
              cameraName,
            });
            console.log("Request payload:", requestBody);
            // Call the add-camera endpoint to save the new camera.
            fetch("http://localhost:3001/add-camera", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: requestBody,
            })
              .then((res) => res.json())
              .then((data) => {
                setMessage("Camera added successfully!");
                // Update the locally stored user object with the new cameras array.
                const storedUser = localStorage.getItem("userData");
                if (storedUser) {
                  const parsedUser = JSON.parse(storedUser);
                  parsedUser.cameras = data.cameras;
                  localStorage.setItem("userData", JSON.stringify(parsedUser));
                }
                if (onCameraAdded) onCameraAdded(data);
                // Redirect to HomePage.
                window.location.href = "/";
              })
              .catch((err) => {
                console.error("Error adding camera:", err);
                setMessage("Error adding camera");
              })
              .finally(() => {
                mqttClient.unsubscribe(replyTopic);
                setAdding(false);
              });
          }
        } catch (err) {
          console.error("Error parsing MQTT message:", err);
        }
      }
    };

    mqttClient.on("message", messageHandler);
    return () => {
      mqttClient.removeListener("message", messageHandler);
    };
  }, [mqttClient, cameraSecret, cameraId, cameraName, userId, onCameraAdded]);

  return (
    <div style={{ textAlign: "center", padding: "20px" }}>
      <h2>Add Camera</h2>
      {!adding ? (
        <>
          <input
            type="text"
            placeholder="Enter camera secret"
            value={cameraSecret}
            onChange={(e) => setCameraSecret(e.target.value)}
            style={{ padding: "10px", width: "250px", marginBottom: "10px" }}
          />
          <br />
          <input
            type="text"
            placeholder="Enter camera name"
            value={cameraName}
            onChange={(e) => setCameraName(e.target.value)}
            style={{ padding: "10px", width: "250px", marginBottom: "10px" }}
          />
          <br />
          <button
            onClick={handleAddCamera}
            style={{
              padding: "10px 20px",
              fontSize: "16px",
              cursor: "pointer",
              borderRadius: "5px",
            }}
          >
            Add Camera
          </button>
        </>
      ) : (
        <p>{message}</p>
      )}
    </div>
  );
};

export default AddCameraComponent;