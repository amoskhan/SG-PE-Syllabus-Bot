// Frame extraction counts per model
export const NEMOTRON_FRAME_COUNT = 10;
export const NOVA_FRAME_COUNT = 16;
export const FRONTIER_FRAME_COUNT = 24;

// Video frame extraction
export const MAX_FRAME_DIMENSION = 640;
export const FRAME_JPEG_QUALITY = 0.8;

// Pose visualization
export const POSE_JPEG_QUALITY = 0.8;
export const SKELETON_LINE_WIDTH = 8;
export const SKELETON_INNER_LINE_WIDTH = 4;
export const LANDMARK_BORDER_WIDTH = 2;

// Image compression (for Vercel payload limits)
export const COMPRESS_MAX_WIDTH = 640;
export const COMPRESS_QUALITY = 0.6;

// Thumbnail generation
export const THUMBNAIL_WIDTH = 160;
export const THUMBNAIL_HEIGHT = 90;
export const THUMBNAIL_JPEG_QUALITY = 0.6;

// Object detection
export const OBJECT_DETECTION_SCORE_THRESHOLD = 0.15;
export const BALL_CONFIDENCE_THRESHOLD = 0.85;
export const BALL_PROXIMITY_WIDTH_RATIO = 0.3;
export const BALL_PROXIMITY_MIN_PX = 250;
export const STATIC_OBJECT_THRESHOLD_PX = 30;

// Biomechanics thresholds
export const STEP_MOVEMENT_THRESHOLD = 0.05;
export const STANCE_WIDTH_RATIO = 0.8;
export const STANCE_ISSUE_RATIO = 0.6;
export const MOVEMENT_CONFIDENCE_RATIO = 1.2;
export const STRIDE_EXPANSION_THRESHOLD = 1.2;
export const FOOT_VELOCITY_RATIO = 1.2;
export const DIVISION_ZERO_GUARD = 0.001;
export const KNEE_BEND_THRESHOLD = 170.0;
export const BALL_RELEASE_DISTANCE = 0.15;

// History truncation
export const SMALL_MODEL_MAX_HISTORY = 6;
export const LARGE_MODEL_MAX_HISTORY = 10;
