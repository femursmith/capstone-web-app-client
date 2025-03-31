import React, { useState, useEffect } from "react";
import StreamViewer from "./StreamViewer";
import loadingGif from "./loading.gif"; // <-- Adjust the path to your loading.gif

const MultiStreamViewer = () => {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true); // Loading starts as true

  useEffect(() => {
    const fetchCameras = async () => {
      try {
        const storedUser = localStorage.getItem("userData");
        if (!storedUser) {
          // If user data isn't found, stop loading
          setLoading(false);
          return;
        }
        const parsedUser = JSON.parse(storedUser);
        const userId = parsedUser.userId || parsedUser.googleId;

        const response = await fetch("http://localhost:3001/list-cameras", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
        const data = await response.json();

        if (data.cameras) {
          setCameras(data.cameras);
        }
      } catch (error) {
        console.error("Error fetching cameras:", error);
      } finally {
        // Always hide the loader when the fetch completes (success or error)
        setLoading(false);
      }
    };

    fetchCameras();
  }, []);

  // Conditionally render based on loading and camera data
  if (loading) {
    return (
        <>
        <br/>
        <br/>
        <br/>
        <br/>
      <div style={{ textAlign: "center" }}>
        <img src={loadingGif} alt="Loading..." style={{ width: "25%" }} />
      </div>
      </>
    );
  }

  // If not loading, but no cameras are found
  if (!loading && cameras.length === 0) {
    return <p>No cameras available.</p>;
  }

  // Otherwise, render the camera list
  return (
    <div>
      <br />
      <br />
      {cameras.map((camera) => (
        <div key={camera.cameraId}>
          <h3 style={{ display: "flex", justifyContent: "center", width: "100%" }}>
            {camera.cameraName}
          </h3>
          <StreamViewer deviceId={camera.cameraId} cameraName={camera.cameraName} />
        </div>
      ))}
    </div>
  );
};

export default MultiStreamViewer;

