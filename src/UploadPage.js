import React, { useState } from "react";
import { useUser } from "./UserContext";

function UploadPage() {
    const { user } = useUser();
    const [file, setFile] = useState(null);
    const [uploadStatus, setUploadStatus] = useState("");

    const handleFileChange = (event) => {
        setFile(event.target.files[0]);
    };

    const storedUserId = localStorage.getItem("userId")

    const uploadFile = async () => {
        if (!file) {
            alert("Please select a file to upload.");
            return;
        }

        if (!user) {
            alert("User not authenticated.");
            return;
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("userId", storedUserId); // Pass the user ID
        console.log(storedUserId);

        try {
            const response = await fetch("http://localhost:3001/upload", {
                method: "POST",
                body: formData
            });

            const data = await response.json();
            if (response.ok) {
                setUploadStatus("Upload successful!");
            } else {
                setUploadStatus(`Error: ${data.message}`);
            }
        } catch (error) {
            setUploadStatus(`Upload failed: ${error.message}`);
        }
    };

    return (
        <div>
            <h2>Upload a File</h2>
            <input type="file" onChange={handleFileChange} />
            <button onClick={uploadFile}>Upload</button>
            {uploadStatus && <p>{uploadStatus}</p>}
        </div>
    );
}

export default UploadPage;
