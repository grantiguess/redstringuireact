export const NODE_WIDTH = 150;
export const NODE_HEIGHT = 100;
export const LONG_PRESS_DURATION = 300;
export const LERP_SPEED = 0.8;
export const HEADER_HEIGHT = 50;
export const MAX_ZOOM = 3;
export const MOVEMENT_THRESHOLD = 3;
export const SCROLL_SENSITIVITY = 0.5;
export const PLUS_SIGN_SIZE = 40;
export const PLUS_LINE_SIZE = PLUS_SIGN_SIZE / 2;
export const PLUS_SIGN_ANIMATION_DURATION = 200;

// Node Layout Constants (Moved from Node.jsx)
export const NODE_PADDING = 30; // Unified padding for horizontal, bottom, and gap
export const NODE_CORNER_RADIUS = 40;
export const NAME_AREA_FACTOR = 0.7; // Determines effective height for name positioning
export const EXPANDED_NODE_WIDTH = 300; // Width when image is present
export const AVERAGE_CHAR_WIDTH = 9; // Approx width per char for 16px font
export const WRAPPED_NODE_HEIGHT = 110; // Height for text-only nodes when text wraps
export const LINE_HEIGHT_ESTIMATE = 28; // Approx height of one line of text (px)

export const EDGE_MARGIN = 75; // Pixels from viewport edge for decomposed view placement

export const TRACKPAD_ZOOM_SENSITIVITY = 5;       // Sensitivity for trackpad pinch-zooming (macOS)
export const PAN_DRAG_SENSITIVITY = 1.2;
export const MOUSE_WHEEL_ZOOM_SENSITIVITY = 1.5; // Renaming this slightly for clarity, adjust value if needed
export const SMOOTH_MOUSE_WHEEL_ZOOM_SENSITIVITY = 0.2; // Adjust as needed - Increased from 0.1
export const KEYBOARD_PAN_SPEED = 0.115;                // for keyboard panning
export const KEYBOARD_ZOOM_SPEED = 0.15;               // for keyboard zooming

// Image Processing
export const THUMBNAIL_MAX_DIMENSION = 800; // Max width/height for thumbnails (increased again)

// Define default node color
export const NODE_DEFAULT_COLOR = 'maroon';