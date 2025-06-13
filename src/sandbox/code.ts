import addOnSandboxSdk from "add-on-sdk-document-sandbox";

// Document Sandbox Runtime APIs
const documentApi = { 
    sandbox: addOnSandboxSdk, 
    runtime: addOnSandboxSdk.instance.runtime
};

// API exposed to the UI
const api = {
    createRectangle: async () => {
        // Sample rectangle creation - simplified for demo purposes
        try {
            console.log("Create rectangle function called");
            // In real implementation, we would use Adobe Express document API here
            // For now, just log that it was called
            return;
        } catch (error) {
            console.error("Failed to create rectangle:", error);
        }
    },

    getSelectedVideo: async () => {
        try {
            // For demo purposes, we'll return a sample video URL
            // In the real implementation, you would get the actual video from the document API
            return "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
        } catch (error) {
            console.error("Failed to get selected video:", error);
            return null;
        }
    },

    getVideoMetadata: async () => {
        try {
            // For demo purposes, we'll return sample metadata
            // In the real implementation, you would get the actual metadata from the video
            return {
                width: 1280,
                height: 720,
                duration: 30, // seconds
                fps: 30
            };
        } catch (error) {
            console.error("Failed to get video metadata:", error);
            return null;
        }
    },

    applyTrackingData: async (trackingData: any) => {
        try {
            // This is where you would apply the tracking data to the video in the document
            // Implementation depends on the Adobe Express API capabilities
            console.log("Applying tracking data:", trackingData);
            
            // Simulate success for now
            return true;
        } catch (error) {
            console.error("Failed to apply tracking data:", error);
            return false;
        }
    },

    saveTrackingData: async (key: string, data: any) => {
        try {
            // For demo purposes, we're just going to log the data
            // In a real implementation, we would use appropriate storage API
            console.log(`Saving data with key: ${key}`, data);
            
            // For demo purposes, we're just returning true
            return true;
        } catch (error) {
            console.error("Failed to save tracking data:", error);
            return false;
        }
    },

    getTrackingData: async (key: string) => {
        try {
            // For demo purposes, return a simple data object
            console.log(`Getting data for key: ${key}`);
            return {
                metadata: {
                    id: "demo_session",
                    videoSrc: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
                    fps: 30,
                    totalFrames: 900,
                    dateCreated: new Date().toISOString(),
                    dateModified: new Date().toISOString()
                },
                trackingPoints: []
            };
        } catch (error) {
            console.error("Failed to get tracking data:", error);
            return null;
        }
    }
};

// Expose our API to the UI
export const { createRectangle, getSelectedVideo, getVideoMetadata, applyTrackingData, saveTrackingData, getTrackingData } = api;
