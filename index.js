const actionBtn = document.getElementById("action-btn");
const volumeSlider = document.getElementById("volume-slider");
const volumeLabel = document.querySelector('label[for="volume"]');
const muteBtn = document.getElementById("mute-btn");
const resetBtn = document.getElementById("reset-btn");

let previousVolume = 100;
let isMuted = false;

// Helper function to handle tab queries
async function getActiveTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tabs || tabs.length === 0) {
    throw new Error("No active tab found");
  }
  if (!tabs[0].url || tabs[0].url.startsWith('about:')) {
    throw new Error("Cannot modify audio on this page");
  }
  return tabs[0];
}

// Update volume label and icon
function updateVolumeDisplay(value) {
  volumeLabel.textContent = `Volume: ${value}%`;
}

// Handle volume change
async function changeVolume(newValue) {
  try {
    const activeTab = await getActiveTab();
    volumeSlider.value = newValue;
    const volumeValue = newValue / 100;
    updateVolumeDisplay(newValue);
    
    if (volumeValue > 0 && isMuted) {
      isMuted = false;
      muteBtn.classList.remove('active');
      muteBtn.textContent = 'Mute';
    }
    
    await browser.runtime.sendMessage({ 
      type: 'updateVolume', 
      tabId: activeTab.id,
      volume: volumeValue
    });
  } catch (error) {
    console.error("Error updating volume:", error);
  }
}

// Handle keyboard shortcuts
document.addEventListener('keydown', async (event) => {
  if (event.target.tagName === 'INPUT') return; // Don't handle if user is typing in an input

  switch (event.key.toLowerCase()) {
    case 'm':
      // Trigger mute button click
      muteBtn.click();
      event.preventDefault();
      break;
    case 'r':
      resetBtn.click();
      event.preventDefault();
      break;
    case 'arrowup':
    case 'arrowright':
      const currentUpValue = parseInt(volumeSlider.value);
      const newUpValue = Math.min(600, currentUpValue + 10);
      if (newUpValue !== currentUpValue) {
        await changeVolume(newUpValue);
      }
      event.preventDefault();
      break;
    case 'arrowdown':
    case 'arrowleft':
      const currentDownValue = parseInt(volumeSlider.value);
      const newDownValue = Math.max(0, currentDownValue - 10);
      if (newDownValue !== currentDownValue) {
        await changeVolume(newDownValue);
      }
      event.preventDefault();
      break;
  }
});

actionBtn.addEventListener("click", async () => {
  console.log("Button clicked");
  try {
    const activeTab = await getActiveTab();
    actionBtn.disabled = true;
    await browser.runtime.sendMessage({ type: 'toggleAudio', tabId: activeTab.id });
    console.log("Message sent to background script");
  } catch (error) {
    console.error("Error in popup:", error);
  } finally {
    actionBtn.disabled = false;
  }
});

muteBtn.addEventListener("click", async () => {
  try {
    const activeTab = await getActiveTab();
    isMuted = !isMuted;
    
    if (isMuted) {
      previousVolume = volumeSlider.value;
      await changeVolume(0);
      muteBtn.classList.add('active');
      muteBtn.textContent = 'Unmute';
    } else {
      await changeVolume(previousVolume);
      muteBtn.classList.remove('active');
      muteBtn.textContent = 'Mute';
    }
  } catch (error) {
    console.error("Error toggling mute:", error);
  }
});

volumeSlider.addEventListener("input", async () => {
  await changeVolume(volumeSlider.value);
});

// Set initial volume display
updateVolumeDisplay(volumeSlider.value);

// Listen for state changes from background script
browser.runtime.onMessage.addListener((message) => {
  console.log("Received message in popup:", message);
  if (message.type === 'audioStateChanged') {
    actionBtn.textContent = message.isMonoActive ? 'Make Stereo' : 'Make Mono';
    actionBtn.dataset.mode = message.isMonoActive ? 'mono' : 'stereo';
    console.log("Button updated to:", actionBtn.textContent);
  } else if (message.type === 'volumeState') {
    volumeSlider.value = message.volume * 100;
    updateVolumeDisplay(volumeSlider.value);
  }
});

// Listen for keyboard commands from background script
browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'volume-command') {
    const currentValue = parseInt(volumeSlider.value);
    let newValue = currentValue;

    if (message.command === 'volume-up') {
      newValue = Math.min(600, currentValue + 10);
    } else if (message.command === 'volume-down') {
      newValue = Math.max(0, currentValue - 10);
    }

    if (newValue !== currentValue) {
      changeVolume(newValue);
    }
  }
});

// Add this function
async function syncWithBackgroundState() {
  try {
    const state = await browser.runtime.sendMessage({ type: 'getState' });
    if (state) {
      volumeSlider.value = state.volume;
      updateVolumeDisplay(state.volume);
      
      if (state.isMonoActive) {
        actionBtn.textContent = 'Make Stereo';
        actionBtn.dataset.mode = 'mono';
      } else {
        actionBtn.textContent = 'Make Mono';
        actionBtn.dataset.mode = 'stereo';
      }
    }
  } catch (error) {
    console.error("Error syncing with background state:", error);
  }
}

// Add this line right after your variable declarations
document.addEventListener('DOMContentLoaded', syncWithBackgroundState);

// Add reset function
async function resetVolume() {
  try {
    await changeVolume(100);
    if (isMuted) {
      isMuted = false;
      muteBtn.classList.remove('active');
      muteBtn.textContent = 'Mute';
    }
  } catch (error) {
    console.error("Error resetting volume:", error);
  }
}

// Add reset button click handler
resetBtn.addEventListener("click", resetVolume);
