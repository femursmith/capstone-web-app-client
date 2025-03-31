import React, { useState, useEffect } from "react";
import loadingGif from "./loading.gif"; // Ensure loading.gif is in the correct path

// Helper function: convert a Blob to a base64 data URL.
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function FileViewer({ mqttFileData }) {
  const [files, setFiles] = useState([]); // Each file: { fileId, fileUrl, fileType, captionTime, event, cameraName, retain }
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [accessToken, setAccessToken] = useState(null);
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date())); // default: today in "D-M-YYYY" format
  const [noFiles, setNoFiles] = useState(false);
  const [loading, setLoading] = useState(false);

  // Retrieve userData from localStorage and extract the userId.
  const cachedUserData = localStorage.getItem("userData");
  const userData = cachedUserData ? JSON.parse(cachedUserData) : {};
  const userId = userData.userId;

  // Helper to format a Date object as "D-M-YYYY" for the server
  function formatDate(date) {
    return `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;
  }

  // Helper to convert an input date (YYYY-MM-DD) to "D-M-YYYY" format.
  function formatInputDate(inputDateStr) {
    const [year, month, day] = inputDateStr.split("-");
    return `${parseInt(day)}-${parseInt(month)}-${year}`;
  }

  // Fetch metadata (paginated) from the backend.
  async function fetchUploads(pageNumber) {
    try {
      const response = await fetch(
        `http://localhost:3001/download-files?userId=${userId}&date=${selectedDate}&page=${pageNumber}`
      );
      if (!response.ok) {
        if (response.status === 404) {
          setNoFiles(true);
          return [];
        } else {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
      }
      const data = await response.json();
      setTotalPages(data.totalPages);
      if (!accessToken && data.accessToken) {
        setAccessToken(data.accessToken);
      }
      setNoFiles(false);
      // data.files now includes the "retain" status among other properties.
      return data.files;
    } catch (err) {
      console.error("Error fetching uploads:", err);
      setError("Error fetching uploads.");
      return [];
    }
  }

  // Download file content using caching (1 day TTL) and include the "retain" status.
  async function downloadFile(fileId, captionTime, event, cameraName, retain = false) {
    const cacheKey = "cachedFile_" + fileId;
    const ttl = 24 * 3600 * 1000; // One day in ms
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < ttl) {
          return { fileId, fileUrl: parsed.data, fileType: parsed.fileType, captionTime, event, cameraName, retain };
        } else {
          localStorage.removeItem(cacheKey);
        }
      } catch (err) {
        console.error("Error parsing cached file:", err);
        localStorage.removeItem(cacheKey);
      }
    }
    try {
      const response = await fetch(
        `http://localhost:3001/download-file?userId=${userId}&fileId=${fileId}`
      );
      if (!response.ok) {
        throw new Error("Failed to download file.");
      }
      const contentType = response.headers.get("content-type");
      const blob = await response.blob();
      const base64Data = await blobToBase64(blob);
      const cacheObj = { data: base64Data, fileType: contentType, timestamp: Date.now() };
      localStorage.setItem(cacheKey, JSON.stringify(cacheObj));
      return { fileId, fileUrl: base64Data, fileType: contentType, captionTime, event, cameraName, retain };
    } catch (err) {
      console.error("Error downloading file:", err);
      return null;
    }
  }

  // Fetch a page of file metadata and then download the actual file content.
  async function fetchAndDownloadPage(pageNumber) {
    setLoading(true);
    const metadata = await fetchUploads(pageNumber);
    const downloadedFiles = await Promise.all(
      metadata.map((record) =>
        downloadFile(record.fileId, record.time, record.event, record.cameraName, record.retain)
      )
    );
    setFiles((prevFiles) => [...prevFiles, ...downloadedFiles.filter(Boolean)]);
    setLoading(false);
  }

  // When the selected date changes, reset pagination and files.
  useEffect(() => {
    if (selectedDate) {
      setPage(1);
      setFiles([]);
      fetchAndDownloadPage(1);
    }
  }, [selectedDate, userId]);

  // Handle new MQTT file event (initialize with retain = false).
  useEffect(() => {
    async function handleNewMqttFile() {
      if (!mqttFileData || !mqttFileData.fileId) return;
      const cacheKey = "cachedFile_" + mqttFileData.fileId;
      const cachedData = localStorage.getItem(cacheKey);
      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData);
          setFiles((prevFiles) => {
            if (!prevFiles.some((f) => f.fileId === mqttFileData.fileId)) {
              return [
                {
                  fileId: mqttFileData.fileId,
                  fileUrl: parsed.data,
                  fileType: parsed.fileType,
                  captionTime: mqttFileData.time,
                  event: mqttFileData.event,
                  cameraName: mqttFileData.cameraName,
                  retain: false,
                },
                ...prevFiles,
              ];
            }
            return prevFiles;
          });
          setNoFiles(false);
          return;
        } catch (e) {
          localStorage.removeItem(cacheKey);
        }
      }
      const newFile = await downloadFile(
        mqttFileData.fileId,
        mqttFileData.time,
        mqttFileData.event,
        mqttFileData.cameraName,
        false
      );
      if (newFile) {
        setFiles((prevFiles) => [newFile, ...prevFiles]);
        setNoFiles(false);
      }
    }
    handleNewMqttFile();
  }, [mqttFileData, userId]);

  // Toggle the retain status of a file by calling the appropriate endpoint.
  async function toggleRetain(fileId, currentRetain) {
    const endpoint = currentRetain ? "undo-retain-file" : "retain-file";
    try {
      const response = await fetch(`http://localhost:3001/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, fileId }),
      });
      if (!response.ok) {
        throw new Error("Failed to update file retention status");
      }
      // Update file status in state.
      setFiles((prevFiles) =>
        prevFiles.map((file) =>
          file.fileId === fileId ? { ...file, retain: !currentRetain } : file
        )
      );
    } catch (err) {
      console.error("Error toggling retain status:", err);
      setError("Error updating file retention status.");
    }
  }

  return (
    <div style={{ textAlign: "center", padding: "20px" }}>
      {/* Date Picker for selecting any day */}
      <div style={{ marginBottom: "20px" }}>
        <label htmlFor="datePicker" style={{ marginRight: "10px", fontWeight: "bold" }}>
          Select Date:
        </label>
        <input
          type="date"
          id="datePicker"
          // Convert the stored "D-M-YYYY" format back to "YYYY-MM-DD" for the input value.
          value={(() => {
            const parts = selectedDate.split("-");
            if (parts.length === 3) {
              let [d, m, y] = parts;
              d = d.padStart(2, "0");
              m = m.padStart(2, "0");
              return `${y}-${m}-${d}`;
            }
            return "";
          })()}
          onChange={(e) => {
            const formatted = formatInputDate(e.target.value);
            setSelectedDate(formatted);
          }}
        />
      </div>

      {error && <p style={{ color: "red", marginTop: "20px" }}>{error}</p>}

      {/* Display loading.gif if files haven't been printed yet */}
      {loading && files.length === 0 && (
        <div style={{ marginTop: "20px" }}>
          <img src={loadingGif} alt="Loading..." style={{ width: "50px", height: "50px" }} />
        </div>
      )}

      {noFiles && !loading && (
        <div style={{ fontWeight: "bold", marginTop: "20px" }}>
          No Events Occurred on this day
        </div>
      )}

      {/* Display the files with a Retain/Undo Retain button */}
      {files.length > 0 &&
        files.map((file, index) => {
          const caption = `${file.event} at ${file.cameraName} around ${new Date(file.captionTime).toLocaleTimeString()}`;
          return (
            <div key={index} style={{ marginTop: "20px", border: "1px solid #ccc", padding: "10px" }}>
              {file.fileType.startsWith("image/") ? (
                <img src={file.fileUrl} alt="Downloaded" style={{ maxWidth: "100%", maxHeight: "500px" }} />
              ) : file.fileType.startsWith("video/") ? (
                <video controls style={{ maxWidth: "100%", maxHeight: "500px" }}>
                  <source src={file.fileUrl} type={file.fileType} />
                  Your browser does not support the video tag.
                </video>
              ) : (
                <p>Unsupported file type.</p>
              )}
              <p style={{ marginTop: "10px", fontStyle: "italic" }}>{caption}</p>
              <button
                onClick={() => toggleRetain(file.fileId, file.retain)}
                style={{
                  padding: "8px 16px",
                  cursor: "pointer",
                  background: file.retain ? "#ff6b6b" : "#4caf50",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                }}
              >
                {file.retain ? "Undo Retain" : "Retain"}
              </button>
            </div>
          );
        })}

      {/* Pagination: load next page if available */}
      {page < totalPages && !loading && (
        <button
          onClick={() => {
            const nextPage = page + 1;
            setPage(nextPage);
            fetchAndDownloadPage(nextPage);
          }}
          style={{
            padding: "10px 20px",
            marginTop: "20px",
            cursor: "pointer",
          }}
        >
          Next
        </button>
      )}
    </div>
  );
}

export default FileViewer;
