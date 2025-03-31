import React, { useState } from "react";
import { useUser } from "./UserContext";
import FileViewer from "./FileViewer";
import MQTTComponent from "./MQTTComponent";
import SettingsPage from "./SettingsPage"; // Import the SettingsPage component
import mainlogo from "./main_logo.png";
import homeIcon from "./home.png";
import streamIcon from "./stream.png";
import settingsIcon from "./settings.png";
import MultiStreamViewer from "./MultiStreamViewer";

const HomePage = () => {
  const { user } = useUser(); // Get user from context
  const [detectedFileData, setDetectedFileData] = useState(null);
  const [activeView, setActiveView] = useState("file");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Navigation Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 20px",
          borderBottom: "2px solid #ccc",
          position: "fixed",
          width: "100%",
          background: "#fff",
          top: 0,
          left: 0,
          height: "60px",
          boxSizing: "border-box",
          zIndex: 1000,
        }}
      >
        <img
          src={mainlogo}
          alt="Home Security Logo"
          style={{ width: "120px", marginRight: "10px" }}
        />
        <nav
          style={{
            display: "flex",
            gap: "20px",
            marginLeft: "auto",
            alignItems: "center",
            height: "100%",
          }}
        >
          <button
            onClick={() => setActiveView("file")}
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <img
              src={homeIcon}
              alt="Home"
              style={{ width: "30px", height: "30px" }}
            />
          </button>
          <button
            onClick={() => setActiveView("stream")}
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <img
              src={streamIcon}
              alt="Stream"
              style={{ width: "30px", height: "30px" }}
            />
          </button>
          <button
            onClick={() => setActiveView("settings")}
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <img
              src={settingsIcon}
              alt="Settings"
              style={{ width: "30px", height: "30px" }}
            />
          </button>
        </nav>
      </div>

      {/* MQTT Component */}
      <MQTTComponent onFileDetected={(data) => setDetectedFileData(data)} />

      {/* Main Content */}
      <div>
        {activeView === "stream" ? (
        
          <MultiStreamViewer />
        ) : activeView === "settings" ? (
          <SettingsPage />
        ) : (
          <>
            <h2 style={{ textAlign: "center", marginTop: "80px" }}>
              {user && user.firstName
                ? `${user.firstName}'s Home Console`
                : "Welcome to Your Home Dashboard"}
            </h2>
            <FileViewer mqttFileData={detectedFileData} />
          </>
        )}
      </div>
    </div>
  );
};

export default HomePage;
