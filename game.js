// Game variables
let snake = [{ x: 5, y: 5 }];
let apple = { x: 8, y: 8 };
let direction = { x: 0, y: 0 };
let nextDirection = { x: 0, y: 0 };
let gameInterval;
let speed = 200;
let originalSpeed = 200; // Store original speed for voice control
let score = 0;
let isVoiceControlActive = false;
let controlMode = "keyboard";
let isPaused = false;
let lastVoiceCommands = []; // Array to store last few commands
const MAX_COMMAND_HISTORY = 10; // Increased history size
let permissionRequested = false;
let recognitionRestartTimer = null; // Track the timer for restarts
let voiceRecognitionAttempts = 0;
const MAX_RECOGNITION_ATTEMPTS = 5;
let lastRecognizedCommand = null;
let commandCooldown = false; // Prevent multiple rapid commands
let audioContext = null;
let analyser = null;
let microphone = null;
let isListening = false;
let audioVisualizationFrame = null;

// DOM elements
const container = document.getElementById("gameContainer");
const voiceControls = document.getElementById("voiceControls");
const voiceLevel = document.getElementById("voiceLevel");
const voiceStatus = document.getElementById("voiceStatus");
const voiceCommandLog = document.getElementById("voiceCommandLog");
const scoreElement = document.getElementById("score");
const beepSound = document.getElementById("beepSound");
const audioVisualizer = document.getElementById("audioVisualizer") || createAudioVisualizer();

// Create audio visualizer if it doesn't exist
function createAudioVisualizer() {
  const canvas = document.createElement("canvas");
  canvas.id = "audioVisualizer";
  canvas.width = 300;
  canvas.height = 100;
  canvas.style.width = "100%";
  canvas.style.height = "100px";
  canvas.style.backgroundColor = "#f0f0f0";
  canvas.style.borderRadius = "4px";
  canvas.style.marginTop = "10px";
  
  if (voiceControls) {
    voiceControls.appendChild(canvas);
  } else {
    document.body.appendChild(canvas);
  }
  
  return canvas;
}

// Get highest score from local storage
const highestScore = localStorage.getItem("highestScore") || 0;
document.getElementById("highestScore").textContent = highestScore;

// Page navigation
const pages = document.querySelectorAll("section");
const showPage = (pageIndex) => {
  pages.forEach((page, index) => {
    page.classList.toggle("active", index === pageIndex);
  });
};

// Event listeners for navigation
document.getElementById("startGame").addEventListener("click", () => showPage(1));
document.getElementById("chooseMode").addEventListener("click", () => showPage(2));
document.getElementById("resetGame").addEventListener("click", () => {
  localStorage.removeItem("highestScore");
  document.getElementById("highestScore").textContent = "0";
  alert("Highest score has been reset!");
});

document.getElementById("backToMenu").addEventListener("click", () => {
  // Stop voice recognition if active
  stopVoiceRecognition();

  // Clean up audio visualization
  stopAudioVisualization();

  // Clear any pending recognition restart timers
  clearRecognitionTimer();

  // Stop game interval
  if (gameInterval) {
    clearInterval(gameInterval);
    gameInterval = null;
  }

  // Go back to main menu
  showPage(0);
});

// Initialize Web Speech API - global variable for recognition
let recognition = null;
let isRecognitionActive = false; // Track recognition state
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// Pre-initialize speech recognition to avoid cold start issues
function preInitializeSpeechRecognition() {
  if (!SpeechRecognition) {
    console.warn("Web Speech API is not supported in this browser.");
    return false;
  }
  
  try {
    // Create an instance that we'll discard, just to warm up the API
    const tempRecognition = new SpeechRecognition();
    tempRecognition.continuous = true; // Changed to true for continuous recognition
    tempRecognition.interimResults = true; // Get interim results for more responsiveness
    tempRecognition.lang = "en-US";
    
    // Set dummy handlers
    tempRecognition.onstart = () => {
      console.log("Pre-initialization recognition started");
      
      // Stop it after a brief moment
      setTimeout(() => {
        try {
          tempRecognition.stop();
        } catch (e) {
          console.warn("Error stopping pre-initialization recognition", e);
        }
      }, 300); // Increased from 100ms to 300ms for better initialization
    };
    
    tempRecognition.onend = () => {
      console.log("Pre-initialization recognition ended");
    };
    
    tempRecognition.onerror = (e) => {
      console.warn("Pre-initialization recognition error", e);
    };
    
    // Try to start it briefly
    tempRecognition.start();
    console.log("Speech recognition pre-initialized");
    return true;
  } catch (error) {
    console.error("Failed to pre-initialize speech recognition:", error);
    return false;
  }
}

// Clear any pending recognition restart timers
function clearRecognitionTimer() {
  if (recognitionRestartTimer) {
    clearTimeout(recognitionRestartTimer);
    recognitionRestartTimer = null;
  }
}

// Start audio visualization
function startAudioVisualization(stream) {
  // Create audio context if not already created
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      
      // Get microphone input
      microphone = audioContext.createMediaStreamSource(stream);
      microphone.connect(analyser);
      
      // Start visualization loop
      visualizeAudio();
      
      isListening = true;
      console.log("Audio visualization started");
    } catch (error) {
      console.error("Error starting audio visualization:", error);
    }
  }
}

// Stop audio visualization
function stopAudioVisualization() {
  isListening = false;
  
  if (audioVisualizationFrame) {
    cancelAnimationFrame(audioVisualizationFrame);
    audioVisualizationFrame = null;
  }
  
  // Disconnect and clean up audio nodes
  if (microphone) {
    microphone.disconnect();
    microphone = null;
  }
  
  if (analyser) {
    analyser = null;
  }
  
  if (audioContext && audioContext.state !== "closed") {
    try {
      // Some browsers don't support closing
      if (typeof audioContext.close === 'function') {
        audioContext.close();
      }
    } catch (error) {
      console.warn("Error closing audio context:", error);
    }
    audioContext = null;
  }
  
  console.log("Audio visualization stopped");
  
  // Clear canvas
  const canvas = document.getElementById("audioVisualizer");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

// Visualize audio data
function visualizeAudio() {
  if (!isListening || !analyser || !audioContext) {
    return;
  }
  
  const canvas = document.getElementById("audioVisualizer");
  if (!canvas) return;
  
  const ctx = canvas.getContext("2d");
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Get audio data
  analyser.getByteFrequencyData(dataArray);
  
  // Calculate average volume
  let average = 0;
  let max = 0;
  dataArray.forEach(value => {
    average += value;
    max = Math.max(max, value);
  });
  average /= bufferLength;
  
  // Update voice level indicator
  if (voiceLevel) {
    const volumePercentage = (average / 255) * 100;
    voiceLevel.style.width = `${volumePercentage}%`;
    
    // Color changes based on volume
    if (volumePercentage > 80) {
      voiceLevel.style.backgroundColor = "#ff4444"; // Red for loud
    } else if (volumePercentage > 40) {
      voiceLevel.style.backgroundColor = "#4CAF50"; // Green for normal
    } else {
      voiceLevel.style.backgroundColor = "#2196F3"; // Blue for quiet
    }
  }
  
  // Draw visualization bars
  const barWidth = (canvas.width / bufferLength) * 2.5;
  let x = 0;
  
  ctx.fillStyle = "#2196F3"; // Default blue
  
  for (let i = 0; i < bufferLength; i++) {
    const barHeight = (dataArray[i] / 255) * canvas.height;
    
    // Color gradient based on frequency
    const hue = (i / bufferLength) * 360;
    ctx.fillStyle = `hsl(${hue}, 70%, 60%)`;
    
    ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
    x += barWidth + 1;
  }
  
  // Continue visualization loop
  audioVisualizationFrame = requestAnimationFrame(visualizeAudio);
}

// Request microphone permission with improved error handling
async function requestMicrophonePermission() {
  try {
    const constraints = { 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    };
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // Start audio visualization
    startAudioVisualization(stream);
    
    permissionRequested = true;
    voiceStatus.textContent = "Microphone access granted";
    updateVoiceStatusIndicator(true);
    
    return stream;
  } catch (err) {
    console.error("Microphone permission denied:", err);
    voiceStatus.textContent = "Microphone access denied";
    updateVoiceStatusIndicator(false);
    
    // Show more specific error messages
    if (err.name === 'NotAllowedError') {
      alert("You need to allow microphone access for voice control to work. Please check your browser settings.");
    } else if (err.name === 'NotFoundError') {
      alert("No microphone detected. Please connect a microphone and try again.");
    } else {
      alert(`Microphone error: ${err.message || err.name}`);
    }
    
    return null;
  }
}

// Stop voice recognition safely - improved
function stopVoiceRecognition() {
  // Clear any pending restart timers first
  clearRecognitionTimer();
  
  // Stop audio visualization
  stopAudioVisualization();
  
  if (recognition && isRecognitionActive) {
    try {
      recognition.stop();
      console.log("Voice recognition stopped successfully");
    } catch (error) {
      console.warn("Error stopping recognition:", error);
    } finally {
      // Always mark as inactive
      isRecognitionActive = false;
      voiceStatus.textContent = "Voice control inactive";
      updateVoiceStatusIndicator(false);
    }
  }
}

// Visual indicator for voice status
function updateVoiceStatusIndicator(active) {
  const indicator = document.createElement('span');
  indicator.className = active ? 'status-indicator active' : 'status-indicator inactive';
  
  // Replace any existing indicator
  const existingIndicator = voiceStatus.querySelector('.status-indicator');
  if (existingIndicator) {
    voiceStatus.removeChild(existingIndicator);
  }
  
  voiceStatus.prepend(indicator);
  
  // Pulse animation for active indicator
  if (active) {
    indicator.classList.add('pulse');
  }
}

// Start voice recognition safely - improved with better error handling and retry logic
function startVoiceRecognition() {
  // Don't attempt to start if already active
  if (isRecognitionActive) {
    console.log("Recognition already active, not starting");
    return false;
  }
  
  // Clear any pending restart timers
  clearRecognitionTimer();
  
  // Check if recognition is available
  if (!recognition) {
    if (!createRecognitionInstance()) {
      voiceStatus.textContent = "Failed to create recognition instance";
      return false;
    }
  }
  
  try {
    recognition.start();
    isRecognitionActive = true;
    voiceStatus.textContent = "Voice control active";
    updateVoiceStatusIndicator(true);
    voiceRecognitionAttempts = 0; // Reset attempt counter on success
    console.log("Voice recognition started successfully");
    return true;
  } catch (error) {
    console.error("Failed to start voice recognition:", error);
    isRecognitionActive = false; // Ensure state is properly reset
    voiceStatus.textContent = "Voice start failed - retrying soon";
    updateVoiceStatusIndicator(false);
    
    // Increment attempt counter
    voiceRecognitionAttempts++;
    
    // If we've tried too many times in a row, recreate the instance
    if (voiceRecognitionAttempts >= MAX_RECOGNITION_ATTEMPTS) {
      console.log("Too many failed attempts, recreating recognition instance");
      createRecognitionInstance();
      voiceRecognitionAttempts = 0;
    }
    
    // Try again after a delay
    clearRecognitionTimer(); // Clear any existing timers
    recognitionRestartTimer = setTimeout(() => {
      console.log("Attempting to restart voice recognition");
      // Double-check that we're still not active and should be running
      if (!isRecognitionActive && isVoiceControlActive && !isPaused) {
        startVoiceRecognition();
      }
    }, 1000); // Reduced from 2000ms to 1000ms for faster recovery
    
    return false;
  }
}

// Enhanced voice command processing with fuzzy matching and confidence threshold
function processVoiceCommand(transcript, confidence) {
  // Skip processing if on cooldown
  if (commandCooldown) return false;
  
  // Convert to lowercase and trim for better matching
  const processedTranscript = transcript.toLowerCase().trim();
  
  // Confidence threshold - adjust based on testing
  const CONFIDENCE_THRESHOLD = 0.4;
  
  // Skip low confidence results
  if (confidence < CONFIDENCE_THRESHOLD) {
    console.log(`Skipping low confidence (${confidence}) result: ${processedTranscript}`);
    return false;
  }
  
  // Keywords for each direction with alternatives
  const upKeywords = ["up", "top", "north", "above"];
  const downKeywords = ["down", "bottom", "south", "below"];
  const leftKeywords = ["left", "west"];
  const rightKeywords = ["right", "east"];
  const pauseKeywords = ["stop", "pause", "wait", "halt", "freeze"];
  const resumeKeywords = ["start", "go", "resume", "continue", "play"];
  
  // Check for direction commands with word boundary matching
  let commandRecognized = false;
  
  // Helper function to check if any keyword is in the transcript
  const containsKeyword = (keywords) => {
    return keywords.some(keyword => 
      // Check for whole word match using regex
      new RegExp(`\\b${keyword}\\b`, 'i').test(processedTranscript)
    );
  };
  
  // Process directional commands
  if (containsKeyword(upKeywords) && direction.y !== 1) {
    nextDirection = { x: 0, y: -1 };
    voiceStatus.textContent = "Command: UP";
    commandRecognized = true;
  } else if (containsKeyword(downKeywords) && direction.y !== -1) {
    nextDirection = { x: 0, y: 1 };
    voiceStatus.textContent = "Command: DOWN";
    commandRecognized = true;
  } else if (containsKeyword(leftKeywords) && direction.x !== 1) {
    nextDirection = { x: -1, y: 0 };
    voiceStatus.textContent = "Command: LEFT";
    commandRecognized = true;
  } else if (containsKeyword(rightKeywords) && direction.x !== -1) {
    nextDirection = { x: 1, y: 0 };
    voiceStatus.textContent = "Command: RIGHT";
    commandRecognized = true;
  } else if (containsKeyword(pauseKeywords)) {
    if (!isPaused) {
      togglePause();
      voiceStatus.textContent = "Game paused";
      commandRecognized = true;
    }
  } else if (containsKeyword(resumeKeywords)) {
    if (isPaused) {
      togglePause();
      voiceStatus.textContent = "Game resumed";
      commandRecognized = true;
    }
  }
  
  // Add command cooldown to prevent rapid command changes
  if (commandRecognized) {
    // Visual feedback
    container.classList.add('command-received');
    setTimeout(() => {
      container.classList.remove('command-received');
    }, 300);
    
    // Set cooldown
    commandCooldown = true;
    setTimeout(() => {
      commandCooldown = false;
    }, 300); // Short cooldown to prevent accidental double commands
    
    // Track last recognized command
    lastRecognizedCommand = {
      command: processedTranscript,
      direction: {...nextDirection},
      timestamp: Date.now()
    };
  }
  
  return commandRecognized;
}

// Log voice commands with enhanced details
function logVoiceCommand(transcript, isRecognized, confidence) {
  lastVoiceCommands.unshift({
    command: transcript,
    timestamp: new Date().toLocaleTimeString(),
    recognized: isRecognized,
    confidence: confidence ? Math.round(confidence * 100) : 0
  });
  
  // Keep only the last MAX_COMMAND_HISTORY commands
  lastVoiceCommands = lastVoiceCommands.slice(0, MAX_COMMAND_HISTORY);
  
  // Update command log display
  updateCommandLog();
  
  // Visual feedback
  if (isRecognized) {
    container.classList.add('voice-active');
    setTimeout(() => {
      container.classList.remove('voice-active');
    }, 500);
  }
}

// Update command log display with enhanced styling
function updateCommandLog() {
  if (lastVoiceCommands.length === 0) {
    voiceCommandLog.textContent = "No commands detected yet";
    return;
  }
  
  // Create styled log
  voiceCommandLog.innerHTML = "";
  
  lastVoiceCommands.forEach(entry => {
    const logEntry = document.createElement("div");
    logEntry.className = "command-entry";
    
    // Status indicator
    const statusIndicator = document.createElement("span");
    statusIndicator.className = `command-status ${entry.recognized ? 'recognized' : 'unrecognized'}`;
    statusIndicator.textContent = entry.recognized ? '✅' : '❓';
    
    // Command text with timestamp
    const commandText = document.createElement("span");
    commandText.className = "command-text";
    commandText.innerHTML = `<span class="command-time">[${entry.timestamp}]</span> "${entry.command}"`;
    
    // Confidence indicator
    const confidenceIndicator = document.createElement("span");
    confidenceIndicator.className = "command-confidence";
    confidenceIndicator.textContent = entry.confidence ? `${entry.confidence}%` : "";
    
    // Add elements to entry
    logEntry.appendChild(statusIndicator);
    logEntry.appendChild(commandText);
    logEntry.appendChild(confidenceIndicator);
    
    voiceCommandLog.appendChild(logEntry);
  });
}

// Improved create/recreate voice recognition instance with better error handling
function createRecognitionInstance() {
  // First ensure any existing instance is properly stopped
  if (recognition) {
    try {
      if (isRecognitionActive) {
        recognition.stop();
      }
    } catch (e) {
      console.warn("Error stopping existing recognition:", e);
    }
    
    // Remove event listeners to prevent memory leaks
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition.onstart = null;
    recognition = null;
  }
  
  // Reset state
  isRecognitionActive = false;
  
  // Check if speech recognition is supported
  if (!SpeechRecognition) {
    console.warn("Web Speech API is not supported in this browser.");
    voiceStatus.textContent = "Voice control not supported in this browser";
    return false;
  }
  
  try {
    // Create new instance with optimized settings for gaming
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 3; // Get multiple interpretations for better accuracy
    
    // Set up event handlers
    recognition.onstart = () => {
      console.log("Recognition started event fired");
      isRecognitionActive = true;
      voiceStatus.textContent = "Voice control active - speak a direction";
      updateVoiceStatusIndicator(true);
      
      // Reset attempt counter
      voiceRecognitionAttempts = 0;
    };
    
    recognition.onresult = (event) => {
      // Process all results including interim for responsiveness
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript.trim();
        const confidence = result[0].confidence;
        const isFinal = result.isFinal;
        
        // Process command immediately even for interim results
        const commandRecognized = processVoiceCommand(transcript, confidence);
        
        // Audio volume visualization handled separately by audio processing
        
        // Log only final results to prevent spam
        if (isFinal) {
          logVoiceCommand(transcript, commandRecognized, confidence);
        }
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      
      if (event.error === 'network') {
        voiceStatus.textContent = "Network error - check connection";
      } else if (event.error === 'not-allowed') {
        voiceStatus.textContent = "Microphone access denied";
        permissionRequested = false;
      } else if (event.error === 'aborted') {
        voiceStatus.textContent = "Recognition aborted";
      } else {
        voiceStatus.textContent = `Error: ${event.error}`;
      }
      
      // Log the error
      logVoiceCommand(`Error: ${event.error}`, false, 0);
      
      // Mark as inactive
      isRecognitionActive = false;
      updateVoiceStatusIndicator(false);
      
      // Auto-restart on certain errors with more aggressive retry for better gameplay
      if (event.error === 'network' || event.error === 'aborted' || event.error === 'audio-capture') {
        voiceRecognitionAttempts++;
        
        // If we've had too many consecutive errors, recreate the instance
        if (voiceRecognitionAttempts >= MAX_RECOGNITION_ATTEMPTS) {
          setTimeout(() => {
            console.log("Too many errors, recreating recognition instance");
            createRecognitionInstance();
            voiceRecognitionAttempts = 0;
            
            // Try to start again after recreating
            if (isVoiceControlActive && !isPaused) {
              setTimeout(startVoiceRecognition, 300);
            }
          }, 500);
        } else {
          // Otherwise just try to restart
          if (isVoiceControlActive && !isPaused) {
            clearRecognitionTimer();
            recognitionRestartTimer = setTimeout(startVoiceRecognition, 1000);
          }
        }
      }
    };

    recognition.onend = () => {
      console.log("Recognition ended naturally");
      isRecognitionActive = false;
      updateVoiceStatusIndicator(false);
      
      // Auto-restart only if voice control is active and game is not paused
      if (isVoiceControlActive && !isPaused) {
        clearRecognitionTimer();
        recognitionRestartTimer = setTimeout(() => {
          if (isVoiceControlActive && !isRecognitionActive && !isPaused) {
            console.log("Auto-restarting voice recognition after end event");
            startVoiceRecognition();
          }
        }, 500); // Reduced from 1000ms to 500ms for faster recovery
      }
    };

    return true;
  } catch (error) {
    console.error("Error creating speech recognition instance:", error);
    voiceStatus.textContent = "Failed to create recognition";
    return false;
  }
}

// Setup voice recognition - improved with better initialization
function setupVoiceRecognition() {
  if (!SpeechRecognition) {
    console.warn("Web Speech API is not supported in this browser.");
    voiceStatus.textContent = "Voice control not supported in this browser";
    return false;
  }
  
  // Create a fresh instance
  return createRecognitionInstance();
}

// Toggle voice control with improved initialization
document.getElementById("voice").addEventListener("click", async () => {
  controlMode = "voice";
  isVoiceControlActive = true;

  // Show voice control UI elements
  voiceControls.style.display = "block";
  
  // Pre-initialize speech recognition
  preInitializeSpeechRecognition();
  
  // Request microphone permission if not already done
  if (!permissionRequested) {
    voiceStatus.textContent = "Requesting microphone access...";
    const stream = await requestMicrophonePermission();
    
    if (!stream) {
      // If permission denied, still show the game but with a warning
      alert("Voice control requires microphone access. The game will start with keyboard controls instead.");
      controlMode = "keyboard";
      isVoiceControlActive = false;
      voiceControls.style.display = "none";
      resetGame();
      setTimeout(startGame, 300);
      return;
    }
  }

  // Create a fresh recognition instance
  if (setupVoiceRecognition()) {
    voiceStatus.textContent = "Voice control ready - say UP, DOWN, LEFT, or RIGHT";
  } else {
    // Fallback to keyboard if voice setup fails
    controlMode = "keyboard";
    isVoiceControlActive = false;
    voiceControls.style.display = "none";
    alert("Failed to initialize voice control. The game will start with keyboard controls instead.");
  }

  // Proceed to game page
  resetGame();
  setTimeout(startGame, 300); // Start the game with a slight delay
});

// Choose keyboard control
document.getElementById("hand").addEventListener("click", () => {
  controlMode = "keyboard";
  isVoiceControlActive = false;
  
  resetGame();
  setTimeout(startGame, 300);
});

// Disable eye tracking for now
document.getElementById("eyes").addEventListener("click", () => {
  alert("Eye tracking is not available in this version.");
});

// Render the game
const renderGame = () => {
  container.innerHTML = "";
  
  // Add grid lines for better visibility (optional)
  const grid = document.createElement("div");
  grid.className = "game-grid";
  container.appendChild(grid);
  
  // Render snake parts
  snake.forEach((part, index) => {
    const snakePart = document.createElement("div");
    snakePart.style.left = part.x * 5 + "%";
    snakePart.style.top = part.y * 5 + "%";
    snakePart.classList.add("snake-part");
    
    // Add special class for head
    if (index === 0) {
      snakePart.classList.add("snake-head");
      
      // Add direction indicator to head
      if (direction.x === 1) snakePart.classList.add("facing-right");
      else if (direction.x === -1) snakePart.classList.add("facing-left");
      else if (direction.y === 1) snakePart.classList.add("facing-down");
      else if (direction.y === -1) snakePart.classList.add("facing-up");
    }
    
    container.appendChild(snakePart);
  });

  // Render apple with animation
  const appleElement = document.createElement("div");
  appleElement.style.left = apple.x * 5 + "%";
  appleElement.style.top = apple.y * 5 + "%";
  appleElement.classList.add("apple");
  appleElement.classList.add("apple-pulse"); // Add pulsing animation
  container.appendChild(appleElement);
  
  // Add visual indicator for current direction
  const directionIndicator = document.createElement("div");
  directionIndicator.className = "direction-indicator";
  
  if (direction.x === 1) directionIndicator.textContent = "→";
  else if (direction.x === -1) directionIndicator.textContent = "←";
  else if (direction.y === 1) directionIndicator.textContent = "↓";
  else if (direction.y === -1) directionIndicator.textContent = "↑";
  else directionIndicator.textContent = "•";
  
  container.appendChild(directionIndicator);
};

// Place apple in a new random position
const placeApple = () => {
  let newApple;
  
  // Make sure apple isn't placed on the snake
  do {
    newApple = {
      x: Math.floor(Math.random() * 20),
      y: Math.floor(Math.random() * 20)
    };
  } while (snake.some(part => part.x === newApple.x && part.y === newApple.y));
  
  apple = newApple;
  
  // Play sound
  try {
    beepSound.currentTime = 0;
    beepSound.play().catch(err => {
      console.warn("Error playing sound:", err);
    });
  } catch (error) {
    console.error("Error playing sound:", error);
  }
};

const moveSnake = () => {
  // Skip movement if game is paused
  if (isPaused) return;
  
  // Apply latest direction
  direction = { ...nextDirection };

  if (direction.x === 0 && direction.y === 0) return;

  const head = {
    x: snake[0].x + direction.x,
    y: snake[0].y + direction.y,
  };

  // Collision detection (walls, self)
  if (
    head.x < 0 ||
    head.x >= 20 ||
    head.y < 0 ||
    head.y >= 20 ||
    snake.some((part) => part.x === head.x && part.y === head.y)
  ) {
    gameOver();
    return;
  }

  snake.unshift(head);

  // Eat apple
  if (head.x === apple.x && head.y === apple.y) {
    // Increase score
    score += 10;
    scoreElement.textContent = score;
    
    // Place new apple
    placeApple();
    
    // Speed up slightly
    speed = Math.max(50, speed - 5);
    if (gameInterval) {
      clearInterval(gameInterval);
      gameInterval = setInterval(gameLoop, speed);
    }
  } else {
    // Remove tail if we didn't eat an apple
    snake.pop();
  }
  
  // Render updated game state
  renderGame();
};

// Reset game to initial state
function resetGame() {
  // Reset snake position and direction
  snake = [{ x: 5, y: 5 }];
  direction = { x: 0, y: 0 };
  nextDirection = { x: 0, y: 0 };
  
  // Reset game speed
  speed = originalSpeed;
  
  // Reset score
  score = 0;
  scoreElement.textContent = "0";
  
  // Place initial apple
  placeApple();
  
  // Clear any existing game interval
  if (gameInterval) {
    clearInterval(gameInterval);
    gameInterval = null;
  }
  
  // Reset pause state
  isPaused = false;
  
  // Render initial state
  renderGame();
}

// Start the game
function startGame() {
  // Show the game page
  showPage(3);
  
  // Start the game loop
  gameInterval = setInterval(gameLoop, speed);
  
  // Start voice recognition if needed
  if (controlMode === "voice" && isVoiceControlActive) {
    startVoiceRecognition();
  }
  
  // Set up keyboard controls
  document.addEventListener("keydown", handleKeyPress);
}

// Main game loop
function gameLoop() {
  moveSnake();
}

// Handle keyboard input
function handleKeyPress(e) {
  // Ignore if using voice control
  if (controlMode === "voice" && isVoiceControlActive) return;
  
  // Handle arrow keys
  switch (e.key) {
    case "ArrowUp":
      if (direction.y !== 1) nextDirection = { x: 0, y: -1 };
      break;
    case "ArrowDown":
      if (direction.y !== -1) nextDirection = { x: 0, y: 1 };
      break;
    case "ArrowLeft":
      if (direction.x !== 1) nextDirection = { x: -1, y: 0 };
      break;
    case "ArrowRight":
      if (direction.x !== -1) nextDirection = { x: 1, y: 0 };
      break;
    case " ":
      // Space bar toggles pause
      togglePause();
      break;
  }
}

// Toggle pause state
function togglePause() {
  isPaused = !isPaused;
  
  // Update UI to show pause state
  container.classList.toggle("paused", isPaused);
  
  // If using voice control, update status
  if (controlMode === "voice") {
    voiceStatus.textContent = isPaused ? "Game paused - say 'resume' to continue" : "Voice control active";
  }
}

// Game over function
function gameOver() {
  // Stop the game loop
  clearInterval(gameInterval);
  gameInterval = null;
  
  // Stop voice recognition if active
  if (isRecognitionActive) {
    stopVoiceRecognition();
  }
  
  // Update highest score if needed
  if (score > highestScore) {
    localStorage.setItem("highestScore", score);
    document.getElementById("highestScore").textContent = score;
  }
  
  // Show game over message
  alert(`Game Over! Your score: ${score}`);
  
  // Go back to main menu
  showPage(0);
}
