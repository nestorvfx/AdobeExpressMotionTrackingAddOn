/*
 * MP4 Post-Processor for Adobe Express Compatibility
 * 
 * This module solves the definitive moov atom placement problem:
 * - MediaRecorder API places moov atom at END of MP4 files
 * - Adobe Express SDK requires moov atom at BEGINNING of MP4 files
 * - This post-processor moves the moov atom using proven qt-faststart algorithm
 */

// @ts-ignore - Package doesn't have perfect TypeScript definitions but it works
import { faststart } from '@fyreware/moov-faststart';

export interface Mp4PostProcessingResult {
  success: boolean;
  processedBuffer?: ArrayBuffer;
  originalSize: number;
  processedSize: number;
  processingTimeMs: number;
  error?: string;
}

/**
 * Post-processes an MP4 file to move the moov atom to the beginning
 * This is the definitive solution for Adobe Express compatibility
 */
export class Mp4PostProcessor {
  private static readonly MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB safety limit

  /**
   * Processes an MP4 buffer to move moov atom to beginning (faststart)
   * Based on the proven qt-faststart algorithm used by FFmpeg
   */
  static async processForAdobeExpress(mp4Buffer: ArrayBuffer): Promise<Mp4PostProcessingResult> {
    const startTime = performance.now();
    const originalSize = mp4Buffer.byteLength;

    console.log('EXPORT-MP4-POST-PROCESSOR: Starting moov atom relocation');
    console.log(`EXPORT-MP4-POST-PROCESSOR: Original file size: ${(originalSize / 1024 / 1024).toFixed(2)}MB`);

    try {
      // Safety check for file size
      if (originalSize > this.MAX_FILE_SIZE) {
        throw new Error(`File too large: ${(originalSize / 1024 / 1024).toFixed(2)}MB exceeds ${this.MAX_FILE_SIZE / 1024 / 1024}MB limit`);
      }

      // Validate it's actually an MP4 file
      if (!this.isValidMp4Buffer(mp4Buffer)) {
        throw new Error('Invalid MP4 file: Missing ftyp box signature');
      }

      // Convert ArrayBuffer to Buffer for the faststart library
      const inputBuffer = Buffer.from(mp4Buffer);
      
      console.log('EXPORT-MP4-POST-PROCESSOR: Analyzing MP4 structure and relocating moov atom...');
      
      // Apply the faststart algorithm (moves moov atom to beginning)
      const processedBuffer = faststart(inputBuffer);
      
      const endTime = performance.now();
      const processingTimeMs = endTime - startTime;
      const processedSize = processedBuffer.byteLength;

      console.log('EXPORT-MP4-POST-PROCESSOR: Successfully relocated moov atom to beginning');
      console.log(`EXPORT-MP4-POST-PROCESSOR: Processed file size: ${(processedSize / 1024 / 1024).toFixed(2)}MB`);
      console.log(`EXPORT-MP4-POST-PROCESSOR: Processing took ${processingTimeMs.toFixed(2)}ms`);      // Convert back to ArrayBuffer for return (ensure it's a proper ArrayBuffer)
      const outputArrayBuffer = new ArrayBuffer(processedBuffer.byteLength);
      const outputView = new Uint8Array(outputArrayBuffer);
      const processedView = new Uint8Array(processedBuffer);
      outputView.set(processedView);
      
      // Validate the processed file
      if (!this.isValidMp4Buffer(outputArrayBuffer)) {
        throw new Error('Post-processing corrupted the MP4 file');
      }

      return {
        success: true,
        processedBuffer: outputArrayBuffer,
        originalSize,
        processedSize,
        processingTimeMs
      };

    } catch (error) {
      const endTime = performance.now();
      const processingTimeMs = endTime - startTime;
      
      console.error('EXPORT-MP4-POST-PROCESSOR: Failed to process MP4:', error);
      
      return {
        success: false,
        originalSize,
        processedSize: 0,
        processingTimeMs,
        error: error instanceof Error ? error.message : 'Unknown error during MP4 post-processing'
      };
    }
  }

  /**
   * Validates that a buffer contains a valid MP4 file
   * Checks for the required ftyp box at the beginning
   */
  private static isValidMp4Buffer(buffer: ArrayBuffer): boolean {
    if (buffer.byteLength < 8) return false;
    
    const view = new DataView(buffer);
    
    // Check for ftyp box (4-byte size + 4-byte type 'ftyp')
    try {
      // Skip the size (first 4 bytes) and check the type
      const type = view.getUint32(4, false); // big-endian
      const ftypSignature = 0x66747970; // 'ftyp' in hex
      
      return type === ftypSignature;
    } catch {
      return false;
    }
  }

  /**
   * Checks if the moov atom is already at the beginning of the file
   * This can help avoid unnecessary processing
   */
  static isAlreadyFastStart(mp4Buffer: ArrayBuffer): boolean {
    if (mp4Buffer.byteLength < 32) return false;
    
    try {
      const view = new DataView(mp4Buffer);
      let offset = 0;
      
      // Read first box (should be ftyp)
      const firstBoxSize = view.getUint32(offset, false);
      const firstBoxType = view.getUint32(offset + 4, false);
      const ftypSignature = 0x66747970; // 'ftyp'
      
      if (firstBoxType !== ftypSignature) return false;
      
      // Move to second box
      offset += firstBoxSize;
      if (offset + 8 >= mp4Buffer.byteLength) return false;
      
      // Check if second box is moov
      const secondBoxType = view.getUint32(offset + 4, false);
      const moovSignature = 0x6D6F6F76; // 'moov'
      
      return secondBoxType === moovSignature;
    } catch {
      return false;
    }
  }

  /**
   * Gets diagnostic information about the MP4 file structure
   */
  static getDiagnosticInfo(mp4Buffer: ArrayBuffer): {
    isValidMp4: boolean;
    fileSize: number;
    isAlreadyFastStart: boolean;
    boxes: Array<{ type: string; size: number; offset: number }>;
  } {
    const result = {
      isValidMp4: this.isValidMp4Buffer(mp4Buffer),
      fileSize: mp4Buffer.byteLength,
      isAlreadyFastStart: this.isAlreadyFastStart(mp4Buffer),
      boxes: [] as Array<{ type: string; size: number; offset: number }>
    };

    if (!result.isValidMp4) return result;

    try {
      const view = new DataView(mp4Buffer);
      let offset = 0;
      
      // Read first few boxes for diagnostic purposes
      while (offset + 8 < mp4Buffer.byteLength && result.boxes.length < 10) {
        const size = view.getUint32(offset, false);
        const typeBytes = view.getUint32(offset + 4, false);
        
        // Convert type to string
        const type = String.fromCharCode(
          (typeBytes >>> 24) & 0xFF,
          (typeBytes >>> 16) & 0xFF,
          (typeBytes >>> 8) & 0xFF,
          typeBytes & 0xFF
        );
        
        result.boxes.push({ type, size, offset });
        
        if (size <= 8) break; // Invalid size
        offset += size;
      }
    } catch (error) {
      console.warn('EXPORT-MP4-POST-PROCESSOR: Error reading MP4 structure:', error);
    }

    return result;
  }
}
