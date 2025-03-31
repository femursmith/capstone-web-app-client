import React, { useEffect, useState } from "react";
import mqtt from "mqtt";
import { useUser } from "./UserContext";
import NotificationPopup from "./NotificationPopup";

const MQTTComponent = ({ onFileDetected }) => {
  const { user } = useUser();
  const [notificationPermission, setNotificationPermission] = useState(Notification.permission);
  const [showPopup, setShowPopup] = useState(false);
  const MQTT_BROKER_URL = "wss://d457c1d9.ala.eu-central-1.emqxsl.com:8084/mqtt";
  const MQTT_USERNAME = "client";
  const MQTT_PASSWORD = "client";

  // Request notification permission on user interaction
  const requestNotificationPermission = () => {
    if ("Notification" in window) {
      Notification.requestPermission().then((permission) => {
        setNotificationPermission(permission);
        if (permission === "granted") {
          console.log("Notification permission granted!");
          setShowPopup(false);
        } else {
          console.log("Notification permission denied.");
        }
      });
    }
  };

  // Check notification permission on mount and show popup immediately if not granted
  useEffect(() => {
    if (notificationPermission !== "granted") {
      setShowPopup(true);
    }
  }, [notificationPermission]);

  useEffect(() => {
    if (!user) return; // Wait for user to be available

    const options = {
      keepalive: 600,
      clientId: "client",
      clean: true,
      connectTimeout: 4000,
      reconnectPeriod: 4000,
      rejectUnauthorized: false,
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD,
      protocol: "wss",
      port: parseInt(MQTT_BROKER_URL.split(":")[2]) || 8084,
    };

    const mqttClient = mqtt.connect(MQTT_BROKER_URL, options);

    mqttClient.on("connect", () => {
      console.log("MQTT connected!");
      mqttClient.subscribe(`${user.userId}/notification`, (err) => {
        if (err) {
          console.error("Subscription error:", err);
        } else {
          console.log(`Subscribed to ${user.userId}/notification`);
        }
      });
    });

    mqttClient.on("message", (topic, message) => {
      const msgString = message.toString();
      console.log(`Received MQTT message on ${topic}:`, msgString);

      try {
        const msgObj = JSON.parse(msgString);

        // Check for expected message shape
        if (msgObj.fileId && msgObj.time) {
          if (notificationPermission === "granted") {
            new Notification("Intruder detected", {
              body: `Camera: ${msgObj.cameraName || "Unknown"}\nTime: ${msgObj.time}`,
              icon: "/notification-icon.png", // Adjust path as needed
            });
          }
          if (onFileDetected) {
            onFileDetected({ fileId: msgObj.fileId, time: msgObj.time });
          }
        } else {
          if (notificationPermission === "granted") {
            new Notification("New MQTT Message", {
              body: msgString,
              icon: "/notification-icon.png",
            });
          }
        }
      } catch (e) {
        console.error("Could not parse message as JSON:", e);
      }
    });

    mqttClient.on("error", (err) => {
      console.error("MQTT connection error:", err);
    });

    // Cleanup on unmount
    return () => {
      mqttClient.end();
    };
  }, [user, notificationPermission, onFileDetected]);

  return (
    <>
      {notificationPermission !== "granted" && showPopup && (
        <NotificationPopup
          onEnable={requestNotificationPermission}
          onClose={() => setShowPopup(false)}
        />
      )}
    </>
  );
};

export default MQTTComponent;
