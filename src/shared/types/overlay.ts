/**
 * Image Overlay Types
 * Types for image overlays composited on top of the video
 */

export interface ImageOverlay {
  id: string
  projectId: string
  /** Path to the image file (copied into project directory) */
  imagePath: string
  /** Original filename for display purposes */
  originalFilename: string
  startTimeMs: number
  endTimeMs: number
  /** Position X as fraction of video width (0.0 = left edge, 1.0 = right edge) */
  positionX: number
  /** Position Y as fraction of video height (0.0 = top edge, 1.0 = bottom edge) */
  positionY: number
  /** Width as fraction of video width */
  widthFraction: number
  /** Height as fraction of video height */
  heightFraction: number
  /** Z-index for stacking order when overlays overlap in time */
  zIndex: number
  /** Opacity (0.0 = transparent, 1.0 = opaque) */
  opacity: number
  createdAt: string
  updatedAt: string
}

export interface ImageOverlayCreateInput {
  projectId: string
  /** Source image path — will be copied to project directory */
  sourceImagePath: string
  startTimeMs: number
  endTimeMs: number
}

export interface ImageOverlayUpdateInput {
  startTimeMs?: number
  endTimeMs?: number
  positionX?: number
  positionY?: number
  widthFraction?: number
  heightFraction?: number
  zIndex?: number
  opacity?: number
}
