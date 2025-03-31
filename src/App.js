import React, { useEffect, useState, useCallback } from "react";
import { handleLogin } from "./auth";
import { useUser } from "./UserContext";
import logo from "./google_logo.png";
import mainlogo from "./main_logo.png";
import HomePage from "./HomePage";
import AddCameraComponent from "./AddCameraComponent"; // Import your Settings page
import loadingGif from "./loading.gif";
import MQTTComponent from "./MQTTComponent";

const CLIENT_ID =
  "417872578564-surfmu1m0nst8hpsfj0r6l0rcgbgs3uf.apps.googleusercontent.com";
const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email"
].join(" ");
const REDIRECT_URI = window.location.origin;

function App() {
  const { user, setUser } = useUser();
  const [authError, setAuthError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userIdStored, setUserIdStored] = useState(false);
  const [hasCamera, setHasCamera] = useState(false); // New state for checking camera registration

  // Exchange code for tokens and update user context & storage with full user object.
  const exchangeCodeForToken = useCallback(async (code) => {
    try {
      const codeVerifier = localStorage.getItem("code_verifier");
      if (!codeVerifier) {
        throw new Error("Code verifier not found in local storage.");
      }

      const response = await fetch("http://localhost:3001/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, code_verifier: codeVerifier })
      });

      const userData = await response.json();
      if (userData.error) throw new Error(userData.error);

      // Update user context and store full user data for session restoration
      setUser(userData);
      localStorage.setItem("userData", JSON.stringify(userData));
      setUserIdStored(true);
      // Check for registered cameras
      if (userData.cameras && userData.cameras.length > 0) {
        setHasCamera(true);
      } else {
        setHasCamera(false);
      }
    } catch (error) {
      console.error("Error exchanging code:", error);
      setAuthError("Failed to authenticate");
    }
  }, [setUser]);

  useEffect(() => {
    console.log("Attempting to restore session...");
    const storedUserData = localStorage.getItem("userData");

    if (storedUserData) {
      try {
        const parsedUserData = JSON.parse(storedUserData);
        fetch("http://localhost:3001/restore-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: parsedUserData.userId }),
        })
          .then(async (response) => {
            if (!response.ok) {
              throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
          })
          .then((data) => {
            console.log("Session restore response:", data);
            if (data.userId) {
              setUser(parsedUserData);
              setUserIdStored(true);
              
              // Set hasCamera based on stored data.
              if (data.cameras && data.cameras.length > 0) {
                setHasCamera(true);
              } else {
                setHasCamera(false);
              }
            } else {
              localStorage.removeItem("userData");
              setUserIdStored(false);
            }
            setLoading(false);
          })
          .catch((error) => {
            console.error("Session restore error:", error);
            localStorage.removeItem("userData");
            setUserIdStored(false);
            setLoading(false);
          });
      } catch (err) {
        console.error("Error parsing stored user data:", err);
        localStorage.removeItem("userData");
        setUserIdStored(false);
      }
    } else {
      // If no stored session, check for auth code in URL
      const urlParams = new URLSearchParams(window.location.search);
      const authCode = urlParams.get("code");
      if (authCode) {
        window.history.replaceState({}, document.title, window.location.pathname);
        exchangeCodeForToken(authCode).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }
  }, [exchangeCodeForToken, setUser]);

  const loginWithGoogle = async () => {
    try {
      await handleLogin(CLIENT_ID, REDIRECT_URI, SCOPES);
      if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission().then((permission) => {
          console.log("Notification permission:", permission);
        });
      }
    } catch (error) {
      setAuthError(error.message);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          backgroundColor: "#f8f9fa"
        }}
      >
        <img src={loadingGif} alt="Loading..." style={{ width: "100px" }} />
        <h3>Loading, please wait...</h3>
      </div>
    );
  }

  return (
    
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        position: "relative"
      }}
    >
      {userIdStored ? (
        hasCamera ? (
          <HomePage />
        ) : (

          <AddCameraComponent userId={user.userId} />
        )
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "20px"
          }}
        >
          <img src={mainlogo} alt="Home Security Logo" style={{ width: "400px" }} />
          <button
            onClick={loginWithGoogle}
            style={{
              backgroundColor: "white",
              color: "black",
              border: "1px solid black",
              padding: "10px 20px",
              borderRadius: "5px",
              fontSize: "16px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <img
              src={logo}
              alt="Google Logo"
              style={{ width: "20px", marginRight: "10px" }}
            />
            Login with Google
          </button>
        </div>
      )}
      {authError && <p style={{ color: "red" }}>Error: {authError}</p>}
    </div>
  );
}

export default App;
