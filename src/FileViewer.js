import React, { useState, useEffect, useCallback, useMemo } from "react";
import loadingGif from "./loading.gif";
import EventGallery from "./EventGallery"; // Import the gallery component

// --- Helpers ---
// Helper function: convert a Blob to a base64 data URL (from original)
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Helper to format a Date object as "D-M-YYYY" for the server (from original)
function formatDateForServer(date) {
    // Ensure month and day are not zero-padded for the server format D-M-YYYY
    return `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;
}

// Helper to format a Date object as "YYYY-MM-DD" for the date input (NEW)
function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Ensure 2 digits
    const day = date.getDate().toString().padStart(2, '0'); // Ensure 2 digits
    return `${year}-${month}-${day}`;
}
// --- End Helpers ---

// --- Grouping Logic ---
const FIVE_MINUTES_MS = 5 * 60 * 1000;

function groupFilesByTime(files) {
  if (!files || files.length === 0) return [];

  const sortedFiles = files
    .map(f => ({ ...f, dateObj: new Date(f.captionTime) }))
    .sort((a, b) => b.dateObj - a.dateObj); // Newest first

  const groups = [];
  let currentGroup = null;

  sortedFiles.forEach(file => {
    // Ensure file has necessary props before grouping
    if (!file || !file.captionTime || !file.fileId) {
        console.warn("Skipping invalid file object during grouping:", file);
        return;
    }

    if (!currentGroup) {
      currentGroup = { groupId: file.fileId, files: [file] };
      groups.push(currentGroup);
    } else {
      const firstFileInGroupTime = currentGroup.files[0].dateObj.getTime();
      const currentFileTime = file.dateObj.getTime();

      if (Math.abs(firstFileInGroupTime - currentFileTime) < FIVE_MINUTES_MS) {
        currentGroup.files.push(file);
        currentGroup.files.sort((a, b) => b.dateObj - a.dateObj); // Maintain sort within group
      } else {
        currentGroup = { groupId: file.fileId, files: [file] };
        groups.push(currentGroup);
      }
    }
  });
  return groups;
}
// --- End Grouping Logic ---


function FileViewer({ mqttFileData }) {
  const [rawFiles, setRawFiles] = useState([]);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // Correctly initialize date state for the input field
  const [selectedDateInput, setSelectedDateInput] = useState(formatDateForInput(new Date()));
  const [noFiles, setNoFiles] = useState(false);
  const [loading, setLoading] = useState(false);

  const cachedUserData = localStorage.getItem("userData");
  const userData = cachedUserData ? JSON.parse(cachedUserData) : {};
  const userId = userData.userId;

  // --- Data Fetching ---

  // Fetch metadata (paginated) - use selectedDateInput to derive server format
  const fetchUploads = useCallback(async (pageNumber) => {
    if (!userId || !selectedDateInput) return []; // Guard clause

     // Convert YYYY-MM-DD input format to D-M-YYYY server format
     const dateForServer = (() => {
        try {
            const [year, month, day] = selectedDateInput.split('-');
            return `${parseInt(day)}-${parseInt(month)}-${year}`;
        } catch(e) {
            console.error("Error formatting date for server:", selectedDateInput, e);
            return formatDateForServer(new Date()); // fallback to today
        }
     })();

    setError(null); // Clear error before fetch

    try {
      const response = await fetch(
        `http://localhost:3001/download-files?userId=${userId}&date=${dateForServer}&page=${pageNumber}`
      );
      if (!response.ok) {
        if (response.status === 404) {
          // Set noFiles only if it's the first page and no raw files exist yet
          if (pageNumber === 1) setNoFiles(true);
          return [];
        } else {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
      }
      const data = await response.json();
      setTotalPages(data.totalPages || 1); // Default to 1 if missing
      setNoFiles(false); // Files found
      return data.files || []; // Ensure it returns an array
    } catch (err) {
      console.error("Error fetching uploads:", err);
      setError("Error fetching upload list.");
      setTotalPages(1); // Reset pages on error
      return [];
    }
  }, [userId, selectedDateInput]); // Depend on the input state format

  // Download file content (mostly same as original, ensure return structure)
  const downloadFile = useCallback(async (fileId, captionTime, event, cameraName, retain = false) => {
     if (!userId || !fileId) return null; // Guard clause

    const cacheKey = "cachedFile_" + fileId;
    const ttl = 24 * 3600 * 1000; // One day in ms
    const fileData = { fileId, captionTime, event, cameraName, retain };

    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < ttl) {
          // Ensure fileUrl and fileType are present
          if (parsed.data && parsed.fileType) {
            return { ...fileData, fileUrl: parsed.data, fileType: parsed.fileType };
          } else {
             console.warn("Cached data missing properties for:", fileId);
             localStorage.removeItem(cacheKey); // Remove incomplete cache
          }
        } else {
          localStorage.removeItem(cacheKey); // Expired
        }
      } catch (err) {
        console.error("Error parsing cached file:", err);
        localStorage.removeItem(cacheKey); // Corrupted
      }
    }

    // Fetch if not cached or cache invalid
    try {
      const response = await fetch(
        `http://localhost:3001/download-file?userId=${userId}&fileId=${fileId}`
      );
      if (!response.ok) {
          console.error(`Failed to download file ${fileId}. Status: ${response.status}`);
        throw new Error(`Failed to download file ${fileId}.`);
      }
      const contentType = response.headers.get("content-type");
      if (!contentType) {
          console.error(`Missing content-type header for file ${fileId}`);
          throw new Error(`Missing content-type for ${fileId}.`);
      }
      const blob = await response.blob();
      const base64Data = await blobToBase64(blob); // Ensure this helper works
      const cacheObj = { data: base64Data, fileType: contentType, timestamp: Date.now() };
       try {
           localStorage.setItem(cacheKey, JSON.stringify(cacheObj));
       } catch (storageError) {
           console.warn("Could not cache file to localStorage:", storageError);
       }
      // Ensure return object has fileUrl and fileType
      return { ...fileData, fileUrl: base64Data, fileType: contentType };
    } catch (err) {
      console.error(`Error downloading file ${fileId}:`, err);
      // Don't set global error here, just return null for this file
      return null;
    }
  }, [userId]); // Keep dependencies minimal

  // Fetch a page of file metadata and then download the actual file content.
  const fetchAndDownloadPage = useCallback(async (pageNumber) => {
    setLoading(true);
    // setError(null); // Cleared in fetchUploads
    setNoFiles(false); // Assume files exist initially

    try {
        const metadata = await fetchUploads(pageNumber);

        if (metadata.length === 0 && pageNumber === 1) {
             // fetchUploads already set noFiles if needed
             setRawFiles([]); // Ensure raw files are empty if first page has none
        } else if (metadata.length > 0) {
            const downloadPromises = metadata.map((record) =>
              downloadFile(record.fileId, record.time, record.event, record.cameraName, record.retain)
            );
            // Wait for all downloads and filter out any null results (failed downloads)
            const downloadedFilesData = (await Promise.all(downloadPromises)).filter(Boolean);

            // Check if any downloads actually succeeded
            if (downloadedFilesData.length === 0 && metadata.length > 0) {
                console.warn("Metadata fetched, but all file downloads failed for page", pageNumber);
                setError("Error downloading file content. Check console for details.");
            }

            setRawFiles((prevRawFiles) => {
              const existingIds = new Set(prevRawFiles.map(f => f.fileId));
              const newFilesToAdd = downloadedFilesData.filter(f => f && f.fileId && !existingIds.has(f.fileId)); // Extra safety checks
              // If it's the first page, replace; otherwise, append.
              return pageNumber === 1 ? newFilesToAdd : [...prevRawFiles, ...newFilesToAdd];
            });
        }
        // If metadata is empty but not page 1, just means no more pages
    } catch (err) {
        // Error state should be set by fetchUploads or downloadFile where appropriate
        console.error("Error during fetch/download process for page:", pageNumber, err);
        // Maybe set a generic error if not already set
        if (!error) setError("An unexpected error occurred while loading events.");
    } finally {
        setLoading(false);
    }
  }, [fetchUploads, downloadFile, error]); // Add error as dependency? Maybe not needed.

  // Effect for date change - resets everything and fetches page 1
  useEffect(() => {
    if (selectedDateInput && userId) {
      setPage(1);
      setRawFiles([]);
      setTotalPages(1);
      setError(null);
      setNoFiles(false);
      fetchAndDownloadPage(1); // Trigger fetch for new date
    }
     // Intentionally omitting fetchAndDownloadPage from deps array to avoid loop
     // as it depends on selectedDateInput itself. This effect should only run on date/user change.
  }, [selectedDateInput, userId]);

  // Effect for MQTT data - prepends new file to rawFiles
  useEffect(() => {
    async function handleNewMqttFile() {
       // Ensure we have needed data and user is identified
      if (!mqttFileData || !mqttFileData.fileId || !mqttFileData.time || !mqttFileData.event || !mqttFileData.cameraName || !userId) {
          if (mqttFileData) console.warn("Incomplete MQTT data received:", mqttFileData);
          return;
      }

      // Prevent adding duplicates if MQTT messages arrive quickly
       if (rawFiles.some(f => f.fileId === mqttFileData.fileId)) {
         return;
       }

      // Attempt to download/cache the new file
      // Assuming retain is false for new MQTT files initially
      const newFile = await downloadFile(
        mqttFileData.fileId,
        mqttFileData.time,
        mqttFileData.event,
        mqttFileData.cameraName,
        false // Default retain status
      );

      if (newFile && newFile.fileUrl && newFile.fileType) { // Check download succeeded
        setRawFiles((prevRawFiles) => {
           // Final check for duplicates before state update
           if (!prevRawFiles.some(f => f.fileId === newFile.fileId)) {
             return [newFile, ...prevRawFiles]; // Prepend
           }
           return prevRawFiles;
        });
        setNoFiles(false); // We definitely have at least one file now
        setError(null); // Clear any previous 'no files' related errors
      } else {
           console.error("Failed to process or download MQTT file for display:", mqttFileData.fileId);
           // Optionally set an error state? e.g., setError("Failed to load latest event image.")
      }
    }
    handleNewMqttFile();
    // Only depend on the MQTT data itself and the user ID
  }, [mqttFileData, userId, downloadFile]); // Added downloadFile, removed rawFiles


  // Memoize the grouped files
  const groupedFiles = useMemo(() => groupFilesByTime(rawFiles), [rawFiles]);

  // Toggle Retain (same as before, updates rawFiles)
  const toggleRetain = useCallback(async (fileId, currentRetain) => {
      if(!userId) return;
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
            setRawFiles((prevRawFiles) =>
                prevRawFiles.map((file) =>
                file.fileId === fileId ? { ...file, retain: !currentRetain } : file
                )
            );
            setError(null);
     } catch (err) {
          // ... (error handling remains the same) ...
           setError("Error updating file retention status.");
     }
  }, [userId]);

  // --- Pagination Logic ---
   const handleNextPage = () => {
     if (page < totalPages && !loading) {
       const nextPage = page + 1;
       setPage(nextPage);
       fetchAndDownloadPage(nextPage);
     }
   };

   // --- Render ---
  return (
    <div style={{ padding: "20px" }}>
      {/* Date Picker - Value bound to YYYY-MM-DD state */}
      <div style={{ marginBottom: "20px", textAlign: 'center' }}>
        <label htmlFor="datePicker" style={{ marginRight: "10px", fontWeight: "bold" }}>
          Select Date:
        </label>
        <input
          type="date"
          id="datePicker"
          value={selectedDateInput} // Directly use the state variable
          onChange={(e) => {
            setSelectedDateInput(e.target.value); // Update state directly
          }}
          disabled={loading}
          max={formatDateForInput(new Date())} // Prevent selecting future dates
        />
      </div>

      {/* Error Display */}
      {error && <p style={{ color: "red", textAlign: 'center', marginTop: "20px", fontWeight: 'bold' }}>{error}</p>}

      {/* Loading Indicator */}
      {loading && groupedFiles.length === 0 && (
        <div style={{ textAlign: 'center', marginTop: "40px" }}>
          <img src={loadingGif} alt="Loading..." style={{ width: "50px", height: "50px" }} />
        </div>
      )}

      {/* No Files Message */}
      {noFiles && !loading && groupedFiles.length === 0 && (
        <div style={{ fontWeight: "bold", textAlign: 'center', marginTop: "40px", color: '#666' }}>
          No Events Recorded on this Day
        </div>
      )}

      {/* Render Event Galleries */}
      {groupedFiles.length > 0 ? (
        groupedFiles.map((group) => (
          <EventGallery
            key={group.groupId}
            group={group}
            onToggleRetain={toggleRetain}
          />
        ))
      ) : (
         // Only show if not loading and not explicitly 'noFiles'
         !loading && !noFiles && <p style={{ textAlign: 'center', marginTop: '30px', color: '#888' }}>Select a date to view events.</p>
      )}

      {/* Spacer */}
      <div style={{height: '30px'}}></div>

      {/* "Load More" Button */}
        {page < totalPages && !loading && !noFiles && groupedFiles.length > 0 && (
           <div style={{ textAlign: 'center' }}>
          <button
            onClick={handleNextPage}
            disabled={loading}
            style={{
              padding: "10px 20px",
              fontSize: "16px",
              fontWeight: "bold",
              color: "#000000",
              backgroundColor: "#FFFFFF",
              border: "1px solid #000000",
              borderRadius: "5px",
              cursor: "pointer",
              transition: "background-color 0.3s ease",
            }}
            onMouseOver={(e) => (e.target.style.backgroundColor = "#d9d9d9")}
            onMouseOut={(e) => (e.target.style.backgroundColor = "#FFFFFF")}
          >
            Load More Events
          </button>
          </div>
        )}
        {loading && page > 1 && ( // Loading indicator for subsequent pages
             <div style={{ textAlign: 'center', marginTop: "20px" }}>
                <img src={loadingGif} alt="Loading more..." style={{ width: "30px", height: "30px" }} />
            </div>
        )}
    </div>
  );
}

export default FileViewer;