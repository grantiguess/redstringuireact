import { useEffect, useRef } from 'react';

export const useCanvasWorker = () => {
  const workerRef = useRef(null);
  const messageQueueRef = useRef([]);
  const isProcessingRef = useRef(false);
  const requestCounterRef = useRef(0);
  const pendingRequestsRef = useRef(new Map());

  useEffect(() => {
    // Path to the worker script, assuming it's in the public directory
    // Adjust the path if your project structure is different.
    workerRef.current = new Worker(new URL('../canvasWorker.js', import.meta.url), { type: 'module' });

    const processNextMessage = () => {
      if (messageQueueRef.current.length > 0 && !isProcessingRef.current) {
        isProcessingRef.current = true;
        const { type, data, id } = messageQueueRef.current.shift();
        workerRef.current.postMessage({ type, data, id });
      }
    };

    workerRef.current.onmessage = (e) => {
      isProcessingRef.current = false;
      const { id, result, error } = e.data;
      if (pendingRequestsRef.current.has(id)) {
        const { resolve, reject } = pendingRequestsRef.current.get(id);
        if (error) {
          reject(new Error(error));
        } else {
          resolve(result);
        }
        pendingRequestsRef.current.delete(id);
      }
      processNextMessage(); // Process next in queue after current is done
    };

    workerRef.current.onerror = (e) => {
      // console.error("Worker error:", e);
      isProcessingRef.current = false;
      // Reject all pending requests on a critical worker error
      pendingRequestsRef.current.forEach(({ reject }) => {
        reject(new Error('Worker encountered an unrecoverable error.'));
      });
      pendingRequestsRef.current.clear();
      // Potentially try to re-initialize the worker or notify the user
    };

    // Process any messages that might have been queued before the worker was fully ready
    // This is unlikely if the queueing logic is only called after this effect, but good for safety.
    // processNextMessage(); 

    return () => {
      workerRef.current.terminate();
    };
  }, []);

  const postQueuedMessage = (type, data) => {
    return new Promise((resolve, reject) => {
      const id = requestCounterRef.current++;
      pendingRequestsRef.current.set(id, { resolve, reject });
      // Instead of direct postMessage, add to our queue
      messageQueueRef.current.push({ type, data, id });
      // Trigger processing if not already active
      if (workerRef.current && !isProcessingRef.current && messageQueueRef.current.length === 1) {
         isProcessingRef.current = true;
         const nextMessage = messageQueueRef.current.shift();
         workerRef.current.postMessage(nextMessage);
      }
    });
  };

  // --- Pan Calculation --- 
  const calculatePan = async (data) => {
    // console.log("Pan calculation promise returned");
    return postQueuedMessage('pan', data);
  };

  // --- Node Position Calculation --- 
  const calculateNodePositions = async (data) => {
    // console.log("Position calculation promise returned");
    return postQueuedMessage('calculatePositions', data);
  };

  // --- Selection Box Calculation --- 
  const calculateSelection = async (data) => {
    // console.log("Selection calculation promise returned");
    return postQueuedMessage('calculateSelection', data);
  };

  // --- Zoom Calculation --- 
  const calculateZoom = async (data) => {
    // console.log("Zoom calculation promise returned");
    return postQueuedMessage('zoom', data);
  };

  return { worker: workerRef.current, calculatePan, calculateNodePositions, calculateSelection, calculateZoom };
}; 