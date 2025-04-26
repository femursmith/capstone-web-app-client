import React, { useState } from "react";
import { useUser } from "./UserContext";
import AddCameraComponent from "./AddCameraComponent";
import deleteIcon from "./deleteicon.png"; // Adjust path if needed

const SettingsPage = () => {
  const { setUser } = useUser();

  // Retrieve the camera list from userData in localStorage
  const cachedUserData = localStorage.getItem("userData");
  const userData = cachedUserData ? JSON.parse(cachedUserData) : {};

  
  const camerasFromStorage = userData.cameras || [];

  // Each camera starts as "On" by default (adjust if needed).
  const [cameraStates, setCameraStates] = useState(
    camerasFromStorage.map((camName) => ({ name: camName, state: "On" }))
  );

  // Manage visibility of the AddCameraComponent modal
  const [showAddCamera, setShowAddCamera] = useState(false);

  // Handle the On/Off dropdown change
  const handleStateChange = (index, newState) => {
    setCameraStates((prev) =>
      prev.map((camera, i) =>
        i === index ? { ...camera, state: newState } : camera
      )
    );
  };

  // Handle logout: clear local storage, reset user context, and reload the page.
  const handleLogout = () => {
    localStorage.clear();
    setUser(null);
    window.location.reload();
  };

  // Show the AddCameraComponent modal when the "+" button is clicked.
  const handleAddCamera = () => {
    setShowAddCamera(true);
  };

  /**
   * Delete camera from the server and local state/storage.
   * @param {string} cameraName - The name of the camera to delete
   */
  const handleDeleteCamera = async (cameraName) => {
    try {
      // Retrieve userId from localStorage
      const storedUser = localStorage.getItem("userData");
      if (!storedUser) {
        console.error("No userData in localStorage. Unable to delete camera.");
        return;
      }
      const parsedUser = JSON.parse(storedUser);
      const localUserId = parsedUser.userId; // or parsedUser.googleId if that’s how you store it

      if (!localUserId) {
        console.error("No userId found in localStorage. Unable to delete camera.");
        return;
      }

      // Call your delete endpoint
      const response = await fetch("http://localhost:3001/delete-camera", {
        method: "POST", // or "DELETE" if that's how your server is set up
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: localUserId,
          cameraName,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        console.error("Server returned error:", data.error || "Unknown error");
        return;
      }

      // If successful, remove the camera from local state
      setCameraStates((prev) => prev.filter((cam) => cam.name !== cameraName));

      // Update localStorage with the new camera list
      // If your server returns the updated camera list in `data.cameras`
      if (data.cameras) {
        parsedUser.cameras = data.cameras;
        localStorage.setItem("userData", JSON.stringify(parsedUser));
      }

      console.log("Camera deleted successfully:", cameraName);
    } catch (err) {
      console.error("Error deleting camera:", err);
    }
  };

  return (
    <div style={{ marginTop: "80px" }}>
      <h2 style={{ textAlign: "center" }}>Settings</h2>

      {/* Cameras Table */}
      <div style={{ margin: "20px auto", maxWidth: "400px" }}>
        <h3 style={{ marginBottom: "20px" }}>Cameras</h3>
        {cameraStates.map((camera, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "10px",
              alignItems: "center",
            }}
          >
            {/* Camera name pill */}
            <div
              style={{
                border: "1px solid #000",
                borderRadius: "10px",
                padding: "8px 16px",
                minWidth: "100px",
                textAlign: "center",
              }}
            >
              {camera.name}
            </div>

            {/* On/Off dropdown pill */}
            <div
              style={{
                border: "1px solid #000",
                borderRadius: "10px",
                padding: "8px 60px",
                minWidth: "60px",
                textAlign: "center",
                position: "relative",
                marginLeft: "10px",
              }}
            >
              <select
                value={camera.state}
                onChange={(e) => handleStateChange(index, e.target.value)}
                style={{
                  border: "none",
                  background: "transparent",
                  outline: "none",
                  cursor: "pointer",
                  fontSize: "inherit",
                }}
              >
                <option value="On">On</option>
                <option value="Off">Off</option>
              </select>
            </div>

            {/* Delete Button with border */}
            <div
              onClick={() => handleDeleteCamera(camera.name)}
              style={{
                border: "1px solid #000",
                borderRadius: "10px",
                padding: "8px",
                minWidth: "60px",
                textAlign: "center",
                marginLeft: "10px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <img
                src={deleteIcon}
                alt="Delete Camera"
                style={{ width: "20px", height: "20px" }}
              />
            </div>
          </div>
        ))}

        {/* "+" Button to open AddCameraComponent modal */}
        <div
          onClick={handleAddCamera}
          style={{
            border: "1px solid #000",
            borderRadius: "10px",
            padding: "8px",
            textAlign: "center",
            cursor: "pointer",
            marginTop: "20px",
          }}
        >
          +
        </div>
      </div>


      {/* Logout Button */}
      <div
        onClick={handleLogout}
        style={{
          border: "1px solid #000",
          borderRadius: "10px",
          padding: "8px",
          textAlign: "center",
          cursor: "pointer",
          marginTop: "100px",
        }}
      >
        Logout
      </div>

      {/* Modal Pop-Up for AddCameraComponent */}
      {showAddCamera && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 2000,
          }}
        >
          <div
            style={{
              backgroundColor: "#fff",
              padding: "20px",
              borderRadius: "8px",
              maxWidth: "500px",
              width: "90%",
              position: "relative",
            }}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowAddCamera(false)}
              style={{
                position: "absolute",
                top: "10px",
                right: "10px",
                background: "none",
                border: "none",
                fontSize: "24px",
                cursor: "pointer",
              }}
            >
              &times;
            </button>

            <AddCameraComponent onClose={() => setShowAddCamera(false)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
