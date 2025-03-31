import React from "react";

const NotificationPopup = ({ onEnable, onClose }) => {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
        marginTop: "70px",
      }}
    >
      <div
        style={{
          background: "#fff",
          padding: "20px",
          borderRadius: "8px",
          textAlign: "center",
          maxWidth: "400px",
          width: "80%",
        }}
      >
        <h2>Enable Notifications</h2>
        <p>
          Enable notification to be able to receive real time notification of camera events.
        </p>
        <button onClick={onEnable} style={{ marginRight: "10px", backgroundColor: "white", border: "1px solid black", color: "black", borderRadius: "4px" }}>
          Enable
        </button>
        <button onClick={onClose}  style={{ marginRight: "10px", backgroundColor: "white", border: "1px solid black", color: "black", borderRadius: "4px" }}>Close</button>
      </div>
    </div>
  );
};

export default NotificationPopup;
