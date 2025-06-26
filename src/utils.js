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
const PREVIEW_NODE_MIN_HEIGHT = 600; // Taller minimum for preview (Increased from 450)
const PREVIEW_TEXT_AREA_HEIGHT = 60; // Fixed height for name in preview
const DESCRIPTION_LINE_HEIGHT = 24; // Height per line for description text
const DESCRIPTION_MAX_LINES = 3; // Maximum lines to show
const DESCRIPTION_PADDING = 8; // Padding around description text

// --- getNodeDimensions Utility Function ---
export const getNodeDimensions = (node, isPreviewing = false, descriptionContent = null) => {
    // --- ADDED: Handle placeholder nodes from AbstractionCarousel ---
    if (node && (node.type === 'add_generic' || node.type === 'add_specific')) {
        const placeholderWidth = NODE_WIDTH * 1.2;
        return {
            currentWidth: placeholderWidth,
            currentHeight: NODE_HEIGHT,
            textAreaHeight: NODE_HEIGHT,
            imageWidth: 0,
            calculatedImageHeight: 0,
            innerNetworkWidth: 0,
            innerNetworkHeight: 0,
            descriptionAreaHeight: 0
        };
    }

    // Use getters to access node properties
    const nodeName = node.getName ? node.getName() : node.name; // Handle potential plain objects gracefully for now?
    const thumbnailSrc = node.getThumbnailSrc ? node.getThumbnailSrc() : node.thumbnailSrc; // Use getter
    // const imageSrc = node.getImageSrc ? node.getImageSrc() : node.imageSrc; // If needed for dimensions

    const hasImage = Boolean(thumbnailSrc); // Check based on thumbnail
    // We can't easily get naturalWidth/Height from a src string here.
    // We might need to pass pre-calculated image dimensions into the node data itself,
    // or adjust the logic to not rely on naturalWidth/Height if possible.
    // For now, let's assume hasValidImageDimensions might be simplified or handled differently.
    // const hasValidImageDimensions = hasImage && node.image.naturalWidth > 0; // This needs re-evaluation
    const hasValidImageDimensions = hasImage; // Simplification for now

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
    tempSpan.textContent = nodeName; // Use nodeName variable
    document.body.appendChild(tempSpan);
    const textWidth = tempSpan.offsetWidth;
    document.body.removeChild(tempSpan);

    // --- Calculate Dimensions Based on State ---
    let currentWidth, currentHeight, textAreaHeight, imageWidth, calculatedImageHeight, innerNetworkWidth, innerNetworkHeight, descriptionAreaHeight;

    if (isPreviewing) {
        currentWidth = baseWidth;
        // Calculate textAreaHeight dynamically based on preview width
        let estimatedLines = 1;
        if (textWidth > textWidthTarget * 2) { estimatedLines = 3; }
        else if (textWidth > textWidthTarget) { estimatedLines = 2; }
        textAreaHeight = Math.max(NODE_HEIGHT, estimatedLines * LINE_HEIGHT_ESTIMATE + 2 * NODE_PADDING);
        
        innerNetworkWidth = currentWidth - 2 * NODE_PADDING;
        
        // Calculate description area height dynamically based on actual content
        if (descriptionContent && descriptionContent.trim() && descriptionContent !== 'No description.') {
            // Measure actual text to determine how many lines we need
            const tempDiv = document.createElement('div');
            tempDiv.style.fontSize = '20px';
            tempDiv.style.fontWeight = 'normal';
            tempDiv.style.lineHeight = '24px';
            tempDiv.style.width = `${innerNetworkWidth}px`;
            tempDiv.style.visibility = 'hidden';
            tempDiv.style.position = 'absolute';
            tempDiv.style.wordWrap = 'break-word';
            tempDiv.style.overflowWrap = 'break-word';
            tempDiv.textContent = descriptionContent;
            document.body.appendChild(tempDiv);
            
            const actualHeight = tempDiv.offsetHeight;
            document.body.removeChild(tempDiv);
            
            // Cap at maximum 3 lines but use actual height if smaller
            const maxAllowedHeight = DESCRIPTION_MAX_LINES * DESCRIPTION_LINE_HEIGHT;
            const contentHeight = Math.min(actualHeight, maxAllowedHeight);
            descriptionAreaHeight = contentHeight + 8; // Minimal padding (4px top + 4px bottom)
        } else {
            // If no description, set height to 0
            descriptionAreaHeight = 0;
        }
        // Calculate network height based on dynamic textAreaHeight and description area, ensuring minimum height
        const availableHeightForNetwork = PREVIEW_NODE_MIN_HEIGHT - textAreaHeight - descriptionAreaHeight - (NODE_PADDING * 2); 
        const minNetworkHeight = 150; // Set a minimum sensible height for the network view
        innerNetworkHeight = Math.max(minNetworkHeight, availableHeightForNetwork); 
        
        // Final node height is sum of text area, network area, description area, and ONE bottom padding
        currentHeight = textAreaHeight + innerNetworkHeight + descriptionAreaHeight + NODE_PADDING;
        
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
            // Get stored aspect ratio or use a default (e.g., 1 for square)
            const aspectRatio = node.getImageAspectRatio ? node.getImageAspectRatio() : 1;

            // Calculate height based on width and aspect ratio
            calculatedImageHeight = aspectRatio ? imageWidth * aspectRatio : 0;

            // Adjust overall node height to accommodate image
            currentHeight = textAreaHeight + calculatedImageHeight + NODE_PADDING; // Text + Image + Bottom Padding
        } else {
            calculatedImageHeight = 0; // Handle invalid image data
            currentHeight = textAreaHeight + NODE_PADDING; // Adjusted height calc for no image
        }
        // Reset network and description dimensions for non-preview modes
        innerNetworkWidth = 0;
        innerNetworkHeight = 0;
        descriptionAreaHeight = 0;
    } else {
        // --- Node WITHOUT Image --- 

        // Determine width based on text length, clamped between NODE_WIDTH and EXPANDED_NODE_WIDTH
        currentWidth = Math.max(NODE_WIDTH, Math.min(textWidth + 2 * NODE_PADDING, EXPANDED_NODE_WIDTH));

        // Calculate text area height needed for the determined width
        textAreaHeight = calculateTextAreaHeight(nodeName, currentWidth - 2 * NODE_PADDING);

        // Total height is the text area height (ensure minimum)
        currentHeight = Math.max(NODE_HEIGHT, textAreaHeight); 

        // Reset image, network, and description dimensions for non-preview modes
        imageWidth = 0;
        calculatedImageHeight = 0;
        innerNetworkWidth = 0;
        innerNetworkHeight = 0;
        descriptionAreaHeight = 0;
    }

    // Ensure minimum height (redundant check, but safe)
    currentHeight = Math.max(currentHeight, NODE_HEIGHT);

    // Ensure all return values are numbers (prevent NaN)
    currentWidth = Number(currentWidth) || NODE_WIDTH;
    currentHeight = Number(currentHeight) || NODE_HEIGHT;
    textAreaHeight = Number(textAreaHeight) || NODE_HEIGHT;
    imageWidth = Number(imageWidth) || 0;
    calculatedImageHeight = Number(calculatedImageHeight) || 0;
    innerNetworkWidth = Number(innerNetworkWidth) || 0;
    innerNetworkHeight = Number(innerNetworkHeight) || 0;
    descriptionAreaHeight = Number(descriptionAreaHeight) || 0;

    return {
        currentWidth,
        currentHeight,
        textAreaHeight: textAreaHeight, // Return calculated text area height
        imageWidth,
        calculatedImageHeight, // Return calculated image height
        innerNetworkWidth, // Add inner network dimensions
        innerNetworkHeight, // Add inner network dimensions
        descriptionAreaHeight // Add description area height
    };
};

// Add other utility functions here if needed 

export const calculateTextAreaHeight = (name, width) => {
    // ... existing code ...
};

/**
 * Generates a thumbnail data URL from an image source.
 * @param {string | File} imageSource - The image source (data URL or File object).
 * @param {number} maxDimension - The maximum width or height for the thumbnail.
 * @returns {Promise<string>} A promise that resolves with the thumbnail data URL.
 */
export const generateThumbnail = (imageSource, maxDimension) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      let { width, height } = img;

      // Calculate new dimensions
      if (width > height) {
        if (width > maxDimension) {
          height = Math.round(height * (maxDimension / width));
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width = Math.round(width * (maxDimension / height));
          height = maxDimension;
        }
      }

      canvas.width = width;
      canvas.height = height;

      // Draw the image onto the canvas
      ctx.drawImage(img, 0, 0, width, height);

      // Get the data URL (default is PNG, can specify JPEG with quality)
      // For thumbnails, JPEG might be smaller
      const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.8); // Adjust quality as needed
      resolve(thumbnailDataUrl);
    };
    img.onerror = (error) => {
      console.error("Error loading image for thumbnail generation:", error);
      reject(new Error("Could not load image"));
    };

    // Set the image source
    if (imageSource instanceof File) {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target.result;
      };
      reader.onerror = (error) => {
          console.error("Error reading file for thumbnail generation:", error);
          reject(new Error("Could not read file"));
      };
      reader.readAsDataURL(imageSource);
    } else if (typeof imageSource === 'string') {
      img.src = imageSource;
    } else {
       reject(new Error("Invalid image source type"));
    }
  });
}; 