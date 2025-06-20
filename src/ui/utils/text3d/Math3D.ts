import { Vector3, Vector2, Transform3D } from './Text3DTypes';

/**
 * 3D Math utilities for text transformation and projection
 */
export class Math3D {
  
  // Matrix operations
  static createTransformMatrix(transform: Transform3D): number[] {
    const { position, rotation, scale } = transform;
    
    // Convert rotation from degrees to radians
    const rx = (rotation.x * Math.PI) / 180;
    const ry = (rotation.y * Math.PI) / 180;
    const rz = (rotation.z * Math.PI) / 180;
    
    // Create rotation matrices
    const rotX = this.createRotationMatrixX(rx);
    const rotY = this.createRotationMatrixY(ry);
    const rotZ = this.createRotationMatrixZ(rz);
    
    // Create scale matrix
    const scaleMatrix = this.createScaleMatrix(scale.x, scale.y, 1);
    
    // Create translation matrix
    const translationMatrix = this.createTranslationMatrix(position.x, position.y, position.z);
    
    // Combine matrices: Translation * RotationZ * RotationY * RotationX * Scale
    let result = this.multiplyMatrices(rotX, scaleMatrix);
    result = this.multiplyMatrices(rotY, result);
    result = this.multiplyMatrices(rotZ, result);
    result = this.multiplyMatrices(translationMatrix, result);
    
    return result;
  }
  
  // Create individual transformation matrices
  static createRotationMatrixX(angle: number): number[] {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
      1, 0, 0, 0,
      0, cos, -sin, 0,
      0, sin, cos, 0,
      0, 0, 0, 1
    ];
  }
  
  static createRotationMatrixY(angle: number): number[] {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
      cos, 0, sin, 0,
      0, 1, 0, 0,
      -sin, 0, cos, 0,
      0, 0, 0, 1
    ];
  }
  
  static createRotationMatrixZ(angle: number): number[] {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
      cos, -sin, 0, 0,
      sin, cos, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ];
  }
  
  static createScaleMatrix(sx: number, sy: number, sz: number): number[] {
    return [
      sx, 0, 0, 0,
      0, sy, 0, 0,
      0, 0, sz, 0,
      0, 0, 0, 1
    ];
  }
  
  static createTranslationMatrix(tx: number, ty: number, tz: number): number[] {
    return [
      1, 0, 0, tx,
      0, 1, 0, ty,
      0, 0, 1, tz,
      0, 0, 0, 1
    ];
  }
  
  // Matrix multiplication (4x4 matrices in column-major order)
  static multiplyMatrices(a: number[], b: number[]): number[] {
    const result = new Array(16);
    
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        result[i * 4 + j] = 
          a[i * 4 + 0] * b[0 * 4 + j] +
          a[i * 4 + 1] * b[1 * 4 + j] +
          a[i * 4 + 2] * b[2 * 4 + j] +
          a[i * 4 + 3] * b[3 * 4 + j];
      }
    }
    
    return result;
  }
  
  // Apply 4x4 transformation matrix to a 3D point
  static transformPoint(point: Vector3, matrix: number[]): Vector3 {
    const x = point.x * matrix[0] + point.y * matrix[4] + point.z * matrix[8] + matrix[12];
    const y = point.x * matrix[1] + point.y * matrix[5] + point.z * matrix[9] + matrix[13];
    const z = point.x * matrix[2] + point.y * matrix[6] + point.z * matrix[10] + matrix[14];
    const w = point.x * matrix[3] + point.y * matrix[7] + point.z * matrix[11] + matrix[15];
    
    // Perspective divide
    return {
      x: x / w,
      y: y / w,
      z: z / w
    };
  }
    // Project 3D point to 2D screen coordinates with perspective
  static projectToScreen(
    point3D: Vector3, 
    canvasWidth: number, 
    canvasHeight: number, 
    fov: number = 60, 
    near: number = 0.1, 
    far: number = 1000
  ): Vector2 {
    // Simple perspective projection for screen-space coordinates
    // Assume camera is at (0, 0, 500) looking at the screen plane
    const cameraZ = 500;
    const screenZ = 0; // Screen plane at Z = 0
    
    // Apply Z-depth perspective scaling
    // When Z is positive, text appears closer (larger)
    // When Z is negative, text appears farther (smaller)
    const distance = cameraZ - point3D.z;
    
    // Prevent division by zero and invalid distances
    if (distance <= 0) {
      // If text is behind camera or at camera position, place it at screen edge
      return { x: canvasWidth / 2, y: canvasHeight / 2 };
    }
    
    // Calculate perspective scale factor
    const perspectiveScale = cameraZ / distance;
    
    // Apply perspective to X and Y coordinates
    // The further from camera (larger distance), the smaller the text appears
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    
    const screenX = centerX + (point3D.x - centerX) * perspectiveScale;
    const screenY = centerY + (point3D.y - centerY) * perspectiveScale;
    
    return { x: screenX, y: screenY };
  }
  
  // Apply planar tracker homography to a 3D point
  static applyPlanarHomography(point: Vector3, homography: number[]): Vector3 {
    if (!homography || homography.length !== 9) {
      return point;
    }
    
    // Apply 2D homography to X and Y coordinates, keep Z unchanged
    const x = point.x * homography[0] + point.y * homography[1] + homography[2];
    const y = point.x * homography[3] + point.y * homography[4] + homography[5];
    const w = point.x * homography[6] + point.y * homography[7] + homography[8];
    
    return {
      x: x / w,
      y: y / w,
      z: point.z
    };
  }
  
  // Utility functions
  static degreesToRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }
  
  static radiansToDegrees(radians: number): number {
    return (radians * 180) / Math.PI;
  }
  
  static clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
  
  static lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }
  
  static distance3D(a: Vector3, b: Vector3): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  
  static distance2D(a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
