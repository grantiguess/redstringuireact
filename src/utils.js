import { 
    NODE_WIDTH, 
    NODE_HEIGHT, 
    NODE_PADDING, 
    AVERAGE_CHAR_WIDTH, 
    LINE_HEIGHT_ESTIMATE, 
    EXPANDED_NODE_WIDTH, 
    NAME_AREA_FACTOR 
} from './constants'; // Import necessary constants

// --- Define constants for preview dimensions ---
const PREVIEW_NODE_WIDTH = 600; // Wider for preview
const PREVIEW_NODE_MIN_HEIGHT = 450; // Taller minimum for preview
const PREVIEW_TEXT_AREA_HEIGHT = 60; // Fixed height for name in preview

// --- getNodeDimensions Utility Function ---
export const getNodeDimensions = (node, isPreviewing = false) => {
    const hasImage = Boolean(node.image?.src);
    const hasValidImageDimensions = hasImage && node.image.naturalWidth > 0;

    // --- Determine base dimensions based on state ---
    let baseWidth, baseHeight, textWidthTarget;
    if (isPreviewing) {
        baseWidth = PREVIEW_NODE_WIDTH;
        baseHeight = PREVIEW_NODE_MIN_HEIGHT;
        textWidthTarget = baseWidth - 2 * NODE_PADDING;
    } else if (hasImage) {
        baseWidth = EXPANDED_NODE_WIDTH;
        baseHeight = NODE_HEIGHT; // Start with base, image adds later
        textWidthTarget = baseWidth - 2 * NODE_PADDING;
    } else {
        baseWidth = NODE_WIDTH;
        baseHeight = NODE_HEIGHT;
        textWidthTarget = baseWidth - 2 * NODE_PADDING;
    }

    // --- Text Measurement ---
    const tempSpan = document.createElement('span');
    tempSpan.style.fontSize = '20px';
    tempSpan.style.fontWeight = 'bold';
    tempSpan.style.visibility = 'hidden';
    tempSpan.style.position = 'absolute';
    tempSpan.style.whiteSpace = 'nowrap'; // Measure full width first
    tempSpan.textContent = node.name;
    document.body.appendChild(tempSpan);
    const textWidth = tempSpan.offsetWidth;
    document.body.removeChild(tempSpan);

    // --- Calculate Dimensions Based on State ---
    let currentWidth, currentHeight, textAreaHeight, imageWidth, calculatedImageHeight, innerNetworkWidth, innerNetworkHeight;

    if (isPreviewing) {
        currentWidth = baseWidth;
        // Calculate textAreaHeight dynamically based on preview width
        let estimatedLines = 1;
        if (textWidth > textWidthTarget * 2) { estimatedLines = 3; }
        else if (textWidth > textWidthTarget) { estimatedLines = 2; }
        textAreaHeight = Math.max(NODE_HEIGHT, estimatedLines * LINE_HEIGHT_ESTIMATE + 2 * NODE_PADDING);
        
        innerNetworkWidth = currentWidth - 2 * NODE_PADDING;
        // Calculate network height based on dynamic textAreaHeight and MIN height
        // Ensure enough space remains after accounting for text area and padding
        const availableHeightForNetwork = PREVIEW_NODE_MIN_HEIGHT - textAreaHeight - (NODE_PADDING * 2); 
        const minNetworkHeight = 150; // Set a minimum sensible height for the network view
        innerNetworkHeight = Math.max(minNetworkHeight, availableHeightForNetwork); 
        
        // Final node height is sum of text area, network area, and ONE bottom padding
        currentHeight = textAreaHeight + innerNetworkHeight + NODE_PADDING;
        
        // Reset image dimensions
        imageWidth = 0;
        calculatedImageHeight = 0;
    } else if (hasImage) {
        currentWidth = baseWidth;
        // Calculate text lines based on expanded width
        let estimatedLines = 1;
        if (textWidth > textWidthTarget * 2) { estimatedLines = 3; }
        else if (textWidth > textWidthTarget) { estimatedLines = 2; }
        textAreaHeight = Math.max(NODE_HEIGHT, estimatedLines * LINE_HEIGHT_ESTIMATE + 2 * NODE_PADDING);

        // Calculate image dimensions
        imageWidth = currentWidth - 2 * NODE_PADDING;
        if (hasValidImageDimensions) {
            const aspectRatio = node.image.naturalHeight / node.image.naturalWidth;
            calculatedImageHeight = imageWidth * aspectRatio;
        } else {
            calculatedImageHeight = 0; // Handle invalid image data
        }
        // Ensure this also uses one bottom padding
        currentHeight = textAreaHeight + calculatedImageHeight + NODE_PADDING; 
        // Reset network dimensions
        innerNetworkWidth = 0;
        innerNetworkHeight = 0;
    } else {
        // Calculate text lines based on standard width
        let estimatedLines = 1;
        if (textWidth > textWidthTarget * 2) { estimatedLines = 3; }
        else if (textWidth > textWidthTarget) { estimatedLines = 2; }
        textAreaHeight = Math.max(NODE_HEIGHT, estimatedLines * LINE_HEIGHT_ESTIMATE + 2 * NODE_PADDING);
        currentWidth = Math.max(NODE_WIDTH, Math.min(textWidth + 2 * NODE_PADDING, EXPANDED_NODE_WIDTH));
        // Text only node height is just the text area height (which includes its own padding)
        currentHeight = textAreaHeight;
        // Reset image and network dimensions
        imageWidth = 0;
        calculatedImageHeight = 0;
        innerNetworkWidth = 0;
        innerNetworkHeight = 0;
    }

    return {
        currentWidth,
        currentHeight,
        textAreaHeight, // Now dynamically calculated for preview
        imageWidth,
        calculatedImageHeight,
        innerNetworkWidth, // Add inner network dimensions
        innerNetworkHeight // Add inner network dimensions
    };
};

// Add other utility functions here if needed 