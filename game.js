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
const MAX_COMMAND_HISTORY = 5;
let permissionRequested = false;
let recognitionRestartTimer = null; // Track the timer for restarts

// DOM elements
const container = document.getElementById("gameContainer");
const voiceControls = document.getElementById("voiceControls");
const voiceLevel = document.getElementById("voiceLevel");
const voiceStatus = document.getElementById("voiceStatus");
const voiceCommandLog = document.getElementById("voiceCommandLog");
const scoreElement = document.getElementById("score");
const beepSound = document.getElementById("beepSound");

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

// Initialize Web Speech API
const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
let recognition = null;
let isRecognitionActive = false; // Track recognition state

// Clear any pending recognition restart timers
function clearRecognitionTimer() {
  if (recognitionRestartTimer) {
    clearTimeout(recognitionRestartTimer);
    recognitionRestartTimer = null;
  }
}

// Request microphone permission
function requestMicrophonePermission() {
  return new Promise((resolve, reject) => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        // Stop the tracks immediately, we just needed the permission
        stream.getTracks().forEach(track => track.stop());
        permissionRequested = true;
        resolve(true);
      })
      .catch(err => {
        console.error("Microphone permission denied:", err);
        reject(err);
      });
  });
}

// Stop voice recognition safely
function stopVoiceRecognition() {
  // Clear any pending restart timers first
  clearRecognitionTimer();
  
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
    }
  }
}

// Start voice recognition safely
function startVoiceRecognition() {
  // Don't attempt to start if already active
  if (isRecognitionActive) {
    console.log("Recognition already active, not starting");
    return false;
  }
  
  // Clear any pending restart timers
  clearRecognitionTimer();
  
  if (recognition && !isRecognitionActive) {
    try {
      recognition.start();
      isRecognitionActive = true;
      voiceStatus.textContent = "Voice control active";
      console.log("Voice recognition started successfully");
      return true;
    } catch (error) {
      console.error("Failed to start voice recognition:", error);
      isRecognitionActive = false; // Ensure state is properly reset
      voiceStatus.textContent = "Voice start failed - retrying soon";
      
      // Try again after a delay
      clearRecognitionTimer(); // Clear any existing timers
      recognitionRestartTimer = setTimeout(() => {
        console.log("Attempting to restart voice recognition");
        // Double-check that we're still not active
        if (!isRecognitionActive && isVoiceControlActive && !isPaused) {
          try {
            recognition.start();
            isRecognitionActive = true;
            voiceStatus.textContent = "Voice control active";
            console.log("Voice recognition restarted successfully");
          } catch (innerError) {
            isRecognitionActive = false;
            voiceStatus.textContent = "Voice control failed";
            console.error("Retry failed:", innerError);
          }
        }
      }, 2000);
      
      return false;
    }
  }
  return false;
}

// Log voice commands
function logVoiceCommand(command, isRecognized) {
  lastVoiceCommands.unshift({
    command,
    timestamp: new Date().toLocaleTimeString(),
    recognized: isRecognized
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

// Update command log display
function updateCommandLog() {
  if (lastVoiceCommands.length === 0) {
    voiceCommandLog.textContent = "No commands detected yet";
    return;
  }
  
  const logContent = lastVoiceCommands.map(entry => {
    const statusIndicator = entry.recognized ? '✅' : '❓';
    return `${statusIndicator} [${entry.timestamp}] "${entry.command}"`;
  }).join('\n');
  
  voiceCommandLog.textContent = logContent;
}

// Create/recreate voice recognition instance
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
  }
  
  // Reset state
  isRecognitionActive = false;
  
  // Create new instance
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  
  // Set up event handlers
  recognition.onresult = (event) => {
    const lastResult = event.results[event.results.length - 1];
    const transcript = lastResult[0].transcript.trim().toLowerCase();
    
    // Audio volume visualization
    const confidence = lastResult[0].confidence;
    voiceLevel.style.width = `${confidence * 100}%`;
    
    const isFinal = lastResult.isFinal;
    let commandRecognized = false;
    
    // Process commands - simplified for better recognition
    if (transcript.includes("up") && direction.y !== 1) {
      nextDirection = { x: 0, y: -1 };
      voiceStatus.textContent = "Command: UP";
      commandRecognized = true;
    } else if (transcript.includes("down") && direction.y !== -1) {
      nextDirection = { x: 0, y: 1 };
      voiceStatus.textContent = "Command: DOWN";
      commandRecognized = true;
    } else if (transcript.includes("left") && direction.x !== 1) {
      nextDirection = { x: -1, y: 0 };
      voiceStatus.textContent = "Command: LEFT";
      commandRecognized = true;
    } else if (transcript.includes("right") && direction.x !== -1) {
      nextDirection = { x: 1, y: 0 };
      voiceStatus.textContent = "Command: RIGHT";
      commandRecognized = true;
    } else if (transcript.includes("stop") || transcript.includes("pause")) {
      togglePause();
      voiceStatus.textContent = isPaused ? "Game paused" : "Game resumed";
      commandRecognized = true;
    }
    
    if (isFinal) {
      logVoiceCommand(transcript, commandRecognized);
      
      // Reset volume visualization
      setTimeout(() => {
        voiceLevel.style.width = "0%";
      }, 500);
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
    logVoiceCommand(`Error: ${event.error}`, false);
    
    // Mark as inactive
    isRecognitionActive = false;
  };

  recognition.onend = () => {
    console.log("Recognition ended naturally");
    isRecognitionActive = false;
    
    // Auto-restart only if voice control is active and game is not paused
    if (isVoiceControlActive && !isPaused) {
      clearRecognitionTimer();
      recognitionRestartTimer = setTimeout(() => {
        if (isVoiceControlActive && !isRecognitionActive && !isPaused) {
          console.log("Auto-restarting voice recognition after end event");
          startVoiceRecognition();
        }
      }, 1000);
    }
  };

  return true;
}

// Setup voice recognition
function setupVoiceRecognition() {
  if (!SpeechRecognition) {
    console.warn("Web Speech API is not supported in this browser.");
    voiceStatus.textContent = "Voice control not supported in this browser";
    return false;
  }
  
  return createRecognitionInstance();
}

// Toggle voice control
document.getElementById("voice").addEventListener("click", async () => {
  controlMode = "voice";
  isVoiceControlActive = true;

  // Show voice control UI elements
  voiceControls.style.display = "block";
  
  // Request microphone permission if not already done
  if (!permissionRequested) {
    try {
      await requestMicrophonePermission();
      voiceStatus.textContent = "Microphone access granted";
    } catch (error) {
      voiceStatus.textContent = "Microphone access denied";
      console.error("Microphone permission error:", error);
      alert("Voice control requires microphone access. Please allow microphone access and try again.");
      return;
    }
  }

  // Create a fresh recognition instance
  if (setupVoiceRecognition()) {
    voiceStatus.textContent = "Voice control ready";
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
  
  // Render snake parts
  snake.forEach((part, index) => {
    const snakePart = document.createElement("div");
    snakePart.style.left = part.x * 5 + "%";
    snakePart.style.top = part.y * 5 + "%";
    snakePart.classList.add("snake-part");
    
    // Add special class for head
    if (index === 0) {
      snakePart.classList.add("snake-head");
    }
    
    container.appendChild(snakePart);
  });

  // Render apple
  const appleElement = document.createElement("div");
  appleElement.style.left = apple.x * 5 + "%";
  appleElement.style.top = apple.y * 5 + "%";
  appleElement.classList.add("apple");
  container.appendChild(appleElement);
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

// Move the snake
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
    score++;
    scoreElement.textContent = score;
    
    // Update highest score if needed
    if (score > highestScore) {
      localStorage.setItem("highestScore", score);
      document.getElementById("highestScore").textContent = score;
    }
    
    placeApple();
  } else {
    snake.pop(); // Remove tail
  }

  renderGame();
};

// Game over handling
function gameOver() {
  // Stop the game interval
  if (gameInterval) {
    clearInterval(gameInterval);
    gameInterval = null;
  }
  
  // Pause voice recognition
  stopVoiceRecognition();
  
  // Show game over dialog with retry option
  const retry = confirm(`Game Over! Your score: ${score}\n\nWould you like to try again?`);
  
  if (retry) {
    resetGame();
    // Short delay before restarting to ensure cleanup is complete
    setTimeout(() => {
      startGame();
    }, 500);
  } else {
    showPage(0); // Return to main menu
  }
}

// Toggle pause
function togglePause() {
  isPaused = !isPaused;

  if (isPaused) {
    clearInterval(gameInterval);
    gameInterval = null;

    // Pause voice recognition
    stopVoiceRecognition();
    
    voiceStatus.textContent = "Game paused";
  } else {
    gameInterval = setInterval(moveSnake, speed);

    // Resume voice recognition with fresh instance
    if (isVoiceControlActive) {
      setupVoiceRecognition();
      startVoiceRecognition();
    }
    
    voiceStatus.textContent = "Game resumed";
  }
}

// Reset game state
function resetGame() {
  snake = [{ x: 5, y: 5 }];
  apple = { x: 8, y: 8 };
  direction = { x: 0, y: 0 };
  nextDirection = { x: 0, y: 0 };
  score = 0;
  isPaused = false;
  lastVoiceCommands = [];

  scoreElement.textContent = "0";

  if (gameInterval) {
    clearInterval(gameInterval);
    gameInterval = null;
  }

  renderGame();
  updateCommandLog();
}

// Change speed
document.getElementById("slow").addEventListener("click", () => {
  speed = 300;
  originalSpeed = 300;
  showPage(2);
});

document.getElementById("medium").addEventListener("click", () => {
  speed = 200;
  originalSpeed = 200;
  showPage(2);
});

document.getElementById("fast").addEventListener("click", () => {
  speed = 100;
  originalSpeed = 100;
  showPage(2);
});

// Start the game
const startGame = () => {
  resetGame();

  // Set initial direction
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };

  // Start game loop
  gameInterval = setInterval(moveSnake, speed);

  // Show game page
  showPage(3);

  // Configure for selected control mode
  if (isVoiceControlActive) {
    voiceControls.style.display = "block";
    
    // Request microphone permission if not already granted
    if (!permissionRequested) {
      requestMicrophonePermission()
        .then(() => {
          // Always create a fresh recognition instance
          setupVoiceRecognition();
          // Start recognition with a slight delay to ensure it's ready
          setTimeout(() => {
            startVoiceRecognition();
          }, 300);
        })
        .catch(error => {
          console.error("Microphone permission error:", error);
          voiceStatus.textContent = "Microphone access denied";
        });
    } else {
      // Always create a fresh recognition instance
      setupVoiceRecognition();
      // Start recognition with a slight delay to ensure it's ready
      setTimeout(() => {
        startVoiceRecognition();
      }, 300);
    }
  } else {
    voiceControls.style.display = "none";
  }
};

// Pause button
document.getElementById("resumeGame").addEventListener("click", togglePause);

// Keyboard controls
document.addEventListener("keydown", (e) => {
  if (controlMode !== "keyboard") return;

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
    case " ": // Spacebar
      togglePause();
      break;
  }
});

// Prevent browser from scrolling when using arrow keys
window.addEventListener("keydown", function(e) {
  if(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].indexOf(e.key) > -1) {
    e.preventDefault();
  }
});

// Add additional debugging display
function updateDebugInfo() {
  // Add debug info to voice status if needed
  if (isVoiceControlActive) {
    const recognitionStateText = isRecognitionActive ? "ACTIVE" : "INACTIVE";
    const debugText = document.createElement("div");
    debugText.classList.add("debug-info");
    debugText.textContent = `Recognition: ${recognitionStateText} | Game: ${isPaused ? "PAUSED" : "RUNNING"}`;
    voiceControls.appendChild(debugText);
    
    // Remove after a short while
    setTimeout(() => {
      if (debugText.parentNode) {
        debugText.parentNode.removeChild(debugText);
      }
    }, 3000);
  }
}

// Preload sound to avoid 404 errors
const preloadSound = () => {
  beepSound.load();
  beepSound.volume = 0.5; // Lower volume
  
  // Test if sound can play
  beepSound.play()
    .then(() => {
      // Pause it immediately, just testing
      beepSound.pause();
      beepSound.currentTime = 0;
    })
    .catch(error => {
      console.warn("Sound preload failed:", error);
      // Continue anyway, sound is not critical
    });
};

// Add a test/debug button for voice
const addVoiceTestButton = () => {
  const testBtn = document.createElement("button");
  testBtn.textContent = "Test Voice Recognition";
  testBtn.classList.add("voice-test-btn");
  testBtn.addEventListener("click", () => {
    if (isVoiceControlActive) {
      // Recreate recognition instance
      setupVoiceRecognition();
      
      // Try to start a fresh instance
      stopVoiceRecognition();
      setTimeout(() => {
        startVoiceRecognition();
        updateDebugInfo();
        voiceStatus.textContent = "Voice recognition restarted";
      }, 500);
    } else {
      alert("Please select voice control mode first");
    }
  });
  
  // Append to voice controls section
  voiceControls.appendChild(testBtn);
};

// Initialize the game
preloadSound();
showPage(0);
renderGame();
addVoiceTestButton();