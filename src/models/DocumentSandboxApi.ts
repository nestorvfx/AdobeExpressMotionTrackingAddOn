// This interface declares all the APIs that the document sandbox runtime ( i.e. code.ts ) exposes to the UI/iframe runtime

export interface TrackingPoint {
    id: string;
    x: number;
    y: number;
    confidence: number;
}

export interface VideoInfo {
    duration: number;
    fps: number;
    width: number;
    height: number;
}

export interface DocumentSandboxApi {
    /**
     * Creates a rectangle in the document.
     */
    createRectangle(): Promise<void>;

    /**
     * Gets the selected video from the Adobe Express document
     * @returns Promise with the video data URL or null if no video is selected
     */
    getSelectedVideo(): Promise<string | null>;

    /**
     * Applies tracking data to the video in Express document
     * @param trackingData The tracking data to apply
     * @returns Promise indicating success of the operation
     */
    applyTrackingData(trackingData: any): Promise<boolean>;

    /**
     * Gets video metadata from the selected video
     * @returns Promise with video metadata or null if no video is selected
     */
    getVideoMetadata(): Promise<{
        width: number;
        height: number;
        duration: number;
        fps: number;
    } | null>;

    /**
     * Saves tracking data to the document storage
     * @param key Storage key
     * @param data Data to save
     * @returns Promise indicating success of the operation
     */
    saveTrackingData(key: string, data: any): Promise<boolean>;

    /**
     * Retrieves tracking data from the document storage
     * @param key Storage key
     * @returns Promise with the retrieved data or null if not found
     */
    getTrackingData(key: string): Promise<any>;
}
