import React, { useState } from 'react';
import styles from './EventGallery.module.css';

// Simple Arrow Icons
const ArrowLeft = () => <span>❮</span>;
const ArrowRight = () => <span>❯</span>;

function EventGallery({ group, onToggleRetain }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Robust check for valid group and files
  if (!group || !group.files || group.files.length === 0) {
    console.warn("EventGallery received invalid group:", group);
    return <div className={styles.galleryContainer}><p>Error displaying event group.</p></div>; // Render an error or null
  }

  // Ensure currentIndex is valid
  const safeCurrentIndex = Math.max(0, Math.min(currentIndex, group.files.length - 1));
  const currentFile = group.files[safeCurrentIndex];

  // Check if currentFile object is valid before accessing properties
  if (!currentFile || !currentFile.fileId || !currentFile.captionTime) {
     console.error("Invalid file data at index", safeCurrentIndex, "in group:", group);
     // Attempt to show the next/previous valid one? Or just show error for this slot?
     // For simplicity, show error for the whole gallery if any file is corrupt
     return <div className={styles.galleryContainer}><p>Error loading file details.</p></div>;
  }


  const goToPrevious = () => {
    setCurrentIndex((prevIndex) => (prevIndex === 0 ? group.files.length - 1 : prevIndex - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex === group.files.length - 1 ? 0 : prevIndex + 1));
  };

  const caption = `${currentFile.event || 'Event'} at ${currentFile.cameraName || 'Unknown'} on ${new Date(
    currentFile.captionTime
  ).toLocaleDateString()} ${new Date(currentFile.captionTime).toLocaleTimeString()}`;

  const firstFileTime = new Date(group.files[0].captionTime);
  const lastFileTime = new Date(group.files[group.files.length - 1].captionTime);
  // Check if times are valid before formatting
  const groupTimeRange = firstFileTime && lastFileTime && !isNaN(firstFileTime) && !isNaN(lastFileTime)
     ? `${firstFileTime.toLocaleTimeString()} - ${lastFileTime.toLocaleTimeString()}`
     : 'Time N/A';
  const groupTitle = `Event Cluster (${groupTimeRange})`;


  // Check if fileUrl and fileType exist before rendering media
  const canRenderMedia = currentFile.fileUrl && currentFile.fileType;

  return (
    <div className={styles.galleryContainer}>
      <div className={styles.mediaWrapper}>
        {group.files.length > 1 && (
          <button onClick={goToPrevious} className={`${styles.arrow} ${styles.leftArrow}`}>
            <ArrowLeft />
          </button>
        )}

        {/* Media Content - Conditional Rendering */}
        <div className={styles.mediaContent}>
          {canRenderMedia ? (
             currentFile.fileType.startsWith('image/') ? (
              <img src={currentFile.fileUrl} alt={caption} className={styles.mediaElement} />
            ) : currentFile.fileType.startsWith('video/') ? (
              <video controls key={currentFile.fileId} className={styles.mediaElement}>
                <source src={currentFile.fileUrl} type={currentFile.fileType} />
                Your browser does not support the video tag.
              </video>
            ) : (
              <p className={styles.mediaPlaceholder}>Unsupported file type: {currentFile.fileType}</p>
            )
          ) : (
              // Placeholder or message if fileUrl/fileType is missing
              <p className={styles.mediaPlaceholder}>Media loading or unavailable...</p>
          )}
        </div>

        {group.files.length > 1 && (
          <button onClick={goToNext} className={`${styles.arrow} ${styles.rightArrow}`}>
            <ArrowRight />
          </button>
        )}
      </div>

      {/* Dots Indicator */}
      {group.files.length > 1 && (
        <div className={styles.dotsContainer}>
          {group.files.map((_, index) => (
            <span
              key={index}
              className={`${styles.dot} ${index === safeCurrentIndex ? styles.activeDot : ''}`}
              onClick={() => setCurrentIndex(index)}
            ></span>
          ))}
        </div>
      )}

      <p className={styles.caption}>{caption}</p>

      <button
        onClick={() => onToggleRetain(currentFile.fileId, currentFile.retain)}
        className={`${styles.retainButton} ${currentFile.retain ? styles.undoRetain : styles.doRetain}`}
      >
        {currentFile.retain ? 'Undo Retain' : 'Retain'}
      </button>
    </div>
  );
}

export default EventGallery;