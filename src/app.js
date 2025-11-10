// Make React hooks available
const { useState, useEffect, useRef, useCallback } = React;

// Define the connections for the hand skeleton
const handConnections = [
  [0, 1], [1, 2], [2, 3], [3, 4],         // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],         // Index
  [5, 9], [9, 10], [10, 11], [11, 12],     // Middle
  [9, 13], [13, 14], [14, 15], [15, 16],   // Ring
  [13, 17], [17, 18], [18, 19], [19, 20],  // Pinky
  [0, 17]                                  // Palm
];

// Hand gesture images
const gestureImages = {
  default: {
    monkey: 'https://placehold.co/400x400/374151/e5e7eb?text=Show+a+Hand+Sign',
    human: 'https://placehold.co/400x400/374151/e5e7eb?text=Show+a+Hand+Sign',
  },
  point: {
    monkey: 'https://media1.tenor.com/m/I9qt03YKkjQAAAAC/monkey-thinking.gif',
    human: 'https://i.imgur.com/rQ0Y0bS.jpeg',
  },
  fist: {
    monkey: 'https://media1.tenor.com/m/mpPkmFDS7hEAAAAd/lion-monkey.gif',
    human: 'https://placehold.co/400x400/374151/e5e7eb?text=Human+Fist!',
  },
  paper: {
    monkey: 'https://placehold.co/400x400/374151/e5e7eb?text=Monkey+Paper!',
    human: 'https://placehold.co/400x400/374151/e5e7eb?text=Human+Paper!',
  },
  // You can add more gestures here
};

// Simplified classifier
const classifyGesture = (landmarks) => {
  try {
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];

    // --- Check for extended fingers (Y coordinate smaller = higher on screen) ---
    const isIndexExtended = indexTip[1] < landmarks[6][1]; // Compare to PIP
    const isMiddleExtended = middleTip[1] < landmarks[10][1]; // Compare to PIP
    const isRingExtended = ringTip[1] < landmarks[14][1]; // Compare to PIP
    const isPinkyExtended = pinkyTip[1] < landmarks[18][1]; // Compare to PIP

    // --- Check for curled fingers (Y coordinate larger = lower on screen) ---
    const isThumbCurled = thumbTip[0] > landmarks[5][0];
    const isIndexCurled = indexTip[1] > landmarks[6][1];
    const isMiddleCurled = middleTip[1] > landmarks[10][1];
    const isRingCurled = ringTip[1] > landmarks[14][1];
    const isPinkyCurled = pinkyTip[1] > landmarks[18][1];

    // --- Check for distance between thumb and index finger ---
    const dx = indexTip[0] - thumbTip[0];
    const dy = indexTip[1] - thumbTip[1];
    const circleDistance = Math.sqrt(dx * dx + dy * dy);

    // --- 'OK Sign' Logic ---
    // Middle, ring, and pinky extended, with index/thumb in a circle
    if (
      isMiddleExtended &&
      isRingExtended &&
      isPinkyExtended &&
      !isIndexExtended && // Index finger should be curled
      circleDistance < 40 // Check if index and thumb tips are close
    ) {
      return 'ok_sign';
    }

    // --- 'Point' Logic ---
    // Index finger extended, all others curled
    if (
      isThumbCurled &&
      isIndexExtended &&
      isMiddleCurled &&
      isRingCurled &&
      isPinkyCurled
    ) {
      return 'point'; // Trigger 'point' event
    }

    // --- 'Fist' Logic ---
    // All fingers curled
    if (
      isThumbCurled &&
      isIndexCurled &&
      isMiddleCurled &&
      isRingCurled &&
      isPinkyCurled
    ) {
      return 'fist';
    }

    // --- 'C Logic' ---
    // All fingers slightly curled



  } catch (e) {
    // Landmarks might be incomplete
    // console.error(e);
  }
  return null;
};

// Main App Component
function App() {
  const [handposeModel, setHandposeModel] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [foundGesture, setFoundGesture] = useState('default');
  const [leftHandStatus, setLeftHandStatus] = useState('None');
  const [rightHandStatus, setRightHandStatus] = useState('None');
  const [isModelReady, setIsModelReady] = useState(false);
  const [librariesLoaded, setLibrariesLoaded] = useState(false);
  const [libraryError, setLibraryError] = useState(null);
  const [handLandmarks, setHandLandmarks] = useState([]);
  const [imageSubject, setImageSubject] = useState('monkey');

  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const rafId = useRef(null);
  const lastLeftGestureAction = useRef(null);
  const lastRightGestureAction = useRef(null);
  const okSoundRef = useRef(null); // Ref for our audio file

  // Get libraries from the window object
  const Webcam = window.Webcam;

  // 0. Check if libraries are loaded from window
  useEffect(() => {
    // Give libraries a moment to load
    setTimeout(() => {
     // MediaPipe Hands is exposed directly on window
     const hasMediaPipe = window.Hands;
     if (window.Webcam && hasMediaPipe) {
        setLibrariesLoaded(true);
        console.log('Libraries loaded from window object.');

       // Initialize audio object
       okSoundRef.current = new Audio('https://audio.jukehost.co.uk/16BXpbuI9FZWVlb8Uwm5zF1cJrHHfwGW');
       okSoundRef.current.preload = 'auto'; // Tell the browser to start loading the audio
      } else {
        const missing = [
          !window.Webcam ? 'ReactWebcam' : '',
          !hasMediaPipe ? 'MediaPipe Hands' : '',
        ].filter(Boolean).join(', ');
        console.error('Failed to load libraries from window:', missing);
        console.log('Available window properties:', Object.keys(window).filter(k => k.includes('Hands') || k.includes('MediaPipe')));
        setLibraryError(`Error: Could not load libraries: ${missing}. Check script tags.`);
      }
    }, 1000); // Increased timeout for MediaPipe to load
  }, []);

  // 1. Load MediaPipe Hands model
  useEffect(() => {
    if (!librariesLoaded) return;

    console.log('Initializing MediaPipe Hands...');
    try {
      const hands = new window.Hands({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
      });

      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      setHandposeModel(hands);
      setIsModelReady(true);
      console.log('MediaPipe Hands initialized successfully.');
    } catch (err) {
      console.error("Failed to initialize MediaPipe Hands", err);
      setLibraryError("Failed to load AI model.");
    }
  }, [librariesLoaded]);

  // 2. Cleanup function to cancel animation frames
  useEffect(() => {
    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, []);

  // Function to draw landmarks on canvas
  const drawHand = useCallback((predictions) => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    if (predictions.length > 0) {
      predictions.forEach((prediction) => {
        const landmarks = prediction.landmarks;
        setHandLandmarks(landmarks); // Store for state if needed

        // 1. Draw Lines (Skeleton)
        ctx.strokeStyle = '#00FF00'; // Green
        ctx.lineWidth = 2;
        for (let i = 0; i < handConnections.length; i++) {
          const [startIdx, endIdx] = handConnections[i];
          const startPoint = landmarks[startIdx];
          const endPoint = landmarks[endIdx];

          ctx.beginPath();
          ctx.moveTo(startPoint[0], startPoint[1]);
          ctx.lineTo(endPoint[0], endPoint[1]);
          ctx.stroke();
        }

        // 2. Draw Points (Joints)
        ctx.fillStyle = '#FF00FF'; // Magenta
        ctx.strokeStyle = '#FFFFFF'; // White border
        ctx.lineWidth = 1;
        for (let i = 0; i < landmarks.length; i++) {
          const x = landmarks[i][0];
          const y = landmarks[i][1];
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
        }
      });
    } else {
      setHandLandmarks([]);
    }
  }, []); // handConnections is constant, no need to add as dependency


  // 3. The main tracking loop
  const detectionLoop = useCallback(async () => {
    if (
      isTracking &&
      handposeModel &&
      webcamRef.current &&
      webcamRef.current.video &&
      webcamRef.current.video.readyState === 4
    ) {
      const video = webcamRef.current.video;
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;

      if (canvasRef.current) {
        canvasRef.current.width = videoWidth;
        canvasRef.current.height = videoHeight;
      }

      try {
        // Set up the onResults callback for MediaPipe
        handposeModel.onResults((results) => {
          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            // Convert MediaPipe landmarks to the format expected by our code
            const predictions = results.multiHandLandmarks.map((handLandmarks, index) => ({
              landmarks: handLandmarks.map(landmark => [
                landmark.x * videoWidth,
                landmark.y * videoHeight,
                landmark.z
              ]),
              handedness: results.multiHandedness?.[index]?.label || 'Unknown'
            }));

            drawHand(predictions);

            // Reset hand statuses
            let leftDetected = false;
            let rightDetected = false;
            let anyGesture = false;

            // Process each detected hand
            predictions.forEach((hand) => {
              const gesture = classifyGesture(hand.landmarks);
              // Reverse handedness because camera is mirrored
              const isLeftHand = hand.handedness === 'Right';
              const isRightHand = hand.handedness === 'Left';

              if (isLeftHand) {
                leftDetected = true;
                if (gesture === 'point') {
                  setLeftHandStatus('Point');
                  setFoundGesture('point');
                  anyGesture = true;
                  if (lastLeftGestureAction.current !== 'point') {
                    lastLeftGestureAction.current = 'point';
                  }
                } else if (gesture === 'ok_sign') {
                  setLeftHandStatus('OK Sign');
                  if (lastLeftGestureAction.current !== 'ok_sign' && okSoundRef.current) {
                    okSoundRef.current.currentTime = 0;
                    okSoundRef.current.play().catch(e => console.error("Audio play failed:", e));
                    lastLeftGestureAction.current = 'ok_sign';
                  }
                } else if (gesture === 'fist') {
                  setLeftHandStatus('Fist');
                  setFoundGesture('fist');
                  anyGesture = true;
                  if (lastLeftGestureAction.current !== 'fist') {
                    lastLeftGestureAction.current = 'fist';
                  }
                } else {
                  setLeftHandStatus('Detected');
                  lastLeftGestureAction.current = null;
                }
              }

              if (isRightHand) {
                rightDetected = true;
                if (gesture === 'point') {
                  setRightHandStatus('Point');
                  setFoundGesture('point');
                  anyGesture = true;
                  if (lastRightGestureAction.current !== 'point') {
                    lastRightGestureAction.current = 'point';
                  }
                } else if (gesture === 'ok_sign') {
                  setRightHandStatus('OK Sign');
                  if (lastRightGestureAction.current !== 'ok_sign' && okSoundRef.current) {
                    okSoundRef.current.currentTime = 0;
                    okSoundRef.current.play().catch(e => console.error("Audio play failed:", e));
                    lastRightGestureAction.current = 'ok_sign';
                  }
                } else if (gesture === 'fist') {
                  setRightHandStatus('Fist');
                  setFoundGesture('fist');
                  anyGesture = true;
                  if (lastRightGestureAction.current !== 'fist') {
                    lastRightGestureAction.current = 'fist';
                  }
                } else {
                  setRightHandStatus('Detected');
                  lastRightGestureAction.current = null;
                }
              }
            });

            // Set status for hands not detected
            if (!leftDetected) {
              setLeftHandStatus('None');
              lastLeftGestureAction.current = null;
            }
            if (!rightDetected) {
              setRightHandStatus('None');
              lastRightGestureAction.current = null;
            }
            if (!anyGesture) {
              setFoundGesture('default');
            }
          } else {
            setLeftHandStatus('None');
            setRightHandStatus('None');
            setFoundGesture('default');
            lastLeftGestureAction.current = null;
            lastRightGestureAction.current = null;
            drawHand([]);
          }
        });

        // Send the video frame to MediaPipe for processing
        await handposeModel.send({ image: video });
      } catch (error) {
        console.error('MediaPipe prediction error:', error);
        setHandStatus('None');
        drawHand([]);
      }

      if(rafId.current) {
         rafId.current = requestAnimationFrame(detectionLoop);
      }
    } else if (isTracking) {
      rafId.current = requestAnimationFrame(detectionLoop);
    } else {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      }
    }
  }, [isTracking, handposeModel, drawHand]);

  // Start/Stop tracking
  const toggleTracking = () => {
    if (!isTracking) {
      // Play a silent audio to activate audio context
      if(okSoundRef.current) {
        okSoundRef.current.muted = true;
        okSoundRef.current.play().then(() => {
          okSoundRef.current.muted = false;
          console.log('Audio context started');
        }).catch(e => {});
      }
      setIsTracking(true);
    } else {
      setIsTracking(false);
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      setLeftHandStatus('None');
      setRightHandStatus('None');
      setFoundGesture('default');
      setHandLandmarks([]);
      lastLeftGestureAction.current = null;
      lastRightGestureAction.current = null;
    }
  };

  // Effect to manage the animation frame loop
  useEffect(() => {
    if (isTracking && isModelReady) {
      rafId.current = requestAnimationFrame(detectionLoop);
    } else {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    }
    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    }
  }, [isTracking, isModelReady, detectionLoop]);

  // --- Render Logic ---

  if (libraryError) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center bg-gray-900 text-gray-200 p-8 font-sans">
        <span className="text-3xl font-bold text-red-500 mb-6">Error</span>
        <div className="w-full max-w-lg bg-gray-800 rounded-lg p-6 border-l-4 border-red-500">
          <span className="text-xl font-semibold text-red-400 block mb-2">Library Load Error</span>
          <span className="text-gray-300">{libraryError}</span>
        </div>
      </div>
    );
  }

  if (!librariesLoaded) {
     return (
      <div className="flex flex-col min-h-screen items-center justify-center bg-gray-900 text-gray-200 p-8 font-sans">
        <div className="flex items-center space-x-2">
          <svg className="animate-spin h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-xl font-medium text-gray-400">Loading Core Libraries...</span>
        </div>
      </div>
    );
  }

  // Determine the image to display
  const currentGestureImage = gestureImages[foundGesture] ? gestureImages[foundGesture][imageSubject] : gestureImages.default[imageSubject];

  // Render the main app
  return (
    <div className="flex flex-col min-h-screen items-center bg-gray-900 text-gray-200 p-4 md:p-8 font-sans">
      <span className="text-2xl md:text-3xl font-bold text-gray-200 mb-6">Brainrot Detector</span>

      <div className="flex flex-col md:flex-row w-full max-w-4xl justify-around mb-6 space-y-4 md:space-y-0 md:space-x-4">

        {/* Box 1: Camera and Processing */}
        <div className="flex flex-col items-center bg-gray-800 rounded-xl border border-gray-700 p-4 w-full md:w-1/2 h-[350px] shadow-lg">
          <span className="text-lg font-semibold text-gray-300 mb-2">Processing</span>
          {!isModelReady && librariesLoaded && (
            <div className="flex-1 flex flex-col items-center justify-center h-full">
              <svg className="animate-spin h-5 w-5 text-blue-400 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-gray-400">Loading AI Model...</span>
            </div>
          )}
          {isModelReady && Webcam && (
            <div className="w-full h-[250px] rounded-lg overflow-hidden relative bg-gray-900">
              <Webcam
                ref={webcamRef}
                audio={false}
                className="webcam-canvas-overlay" /* REMOVED object-cover */
                mirrored={true}
                videoConstraints={{ width: 400, height: 250, facingMode: "user" }}
                style={{
                  width: '100%',
                  height: '100%',
                }}
              />
              {/* Canvas for drawing landmarks */}
              <canvas
                ref={canvasRef}
                className="webcam-canvas-overlay z-10"
                style={{
                  transform: 'scaleX(-1)', /* FIX: Mirror canvas to match video */
                  width: '100%',
                  height: '100%',
                }}
              ></canvas>
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 p-2 rounded-md text-sm">
                <span className="text-white block">Tracking: {isTracking ? 'ON' : 'OFF'}</span>
                <span className="text-white block">Left Hand: {leftHandStatus}</span>
                <span className="text-white block">Right Hand: {rightHandStatus}</span>
              </div>
            </div>
          )}
        </div>

        {/* Box 2: Image Generation */}
        <div className="flex flex-col items-center bg-gray-800 rounded-xl border border-gray-700 p-4 w-full md:w-1/2 h-[350px] shadow-lg">
          <span className="text-lg font-semibold text-gray-300 mb-2">Image Generation</span>
          <div className="w-full h-[250px] flex items-center justify-center bg-gray-700 rounded-lg relative">
            <img
              src={currentGestureImage}
              alt="Detected gesture"
              className="max-w-full max-h-full rounded-lg object-contain"
            />
            <div className="absolute top-2 right-2 flex space-x-2">
              <button
                onClick={() => setImageSubject('monkey')}
                className={`px-3 py-1 text-xs rounded-full transition-all ${imageSubject === 'monkey' ? 'bg-blue-500 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
              >
                Monkey
              </button>
              <button
                onClick={() => setImageSubject('human')}
                className={`px-3 py-1 text-xs rounded-full transition-all ${imageSubject === 'human' ? 'bg-blue-500 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
              >
                Human
              </button>
            </div>
          </div>
        </div>
      </div>

      <button
        className={`px-8 py-3 text-lg font-bold text-white rounded-full transition-all duration-300 transform hover:scale-105 ${
          isModelReady
            ? 'bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-blue-500/50'
            : 'bg-gray-600 cursor-not-allowed opacity-50'
        }`}
        onClick={toggleTracking}
        disabled={!isModelReady}
      >
        {isTracking ? 'Stop Tracking' : 'Start Tracking'}
      </button>

      <div className="w-full max-w-4xl bg-gray-800 rounded-lg p-4 border-l-4 border-yellow-500 mt-8 shadow-lg">
        <span className="text-lg font-semibold text-yellow-400 block mb-2">Engineer's Note:</span>
        <span className="text-gray-300 text-sm">
          This is a proof-of-concept. The "Sign Language" detection is a simple
          classifier. A true sign language app
          requires a much more advanced AI model. The image search is
          simulated with placeholder URLs.
        </span>
      </div>
    </div>
  );
}

// Mount the app
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
