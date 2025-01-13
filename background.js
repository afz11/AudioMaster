let isMonoActive = false;
let currentVolume = 100;
let volumeChanged = false;
const BADGE_COLOR = '#FF9800'; // Orange color for both states

// Add these functions to handle storage
async function saveState(tabId) {
  try {
    await browser.storage.local.set({
      [`tab-${tabId}`]: {
        volume: currentVolume,
        isMonoActive: isMonoActive
      }
    });
  } catch (error) {
    console.error('Error saving state:', error);
  }
}

async function loadState(tabId) {
  try {
    const data = await browser.storage.local.get(`tab-${tabId}`);
    const state = data[`tab-${tabId}`];
    if (state) {
      currentVolume = state.volume;
      isMonoActive = state.isMonoActive;
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error loading state:', error);
    return false;
  }
}

// Add tab update listener
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    const hasState = await loadState(tabId);
    if (hasState) {
      await injectAudioProcessor(tabId);
      await updateVolume(tabId, currentVolume / 100);
      if (isMonoActive) {
        await toggleAudio(tabId);
      }
      await updateBadge(currentVolume, isMonoActive);
    }
  }
});

browser.runtime.onMessage.addListener(async (message) => {
  console.log("Background script received message:", message);
  try {
    switch (message.type) {
      case 'toggleAudio':
        await toggleAudio(message.tabId);
        return true;
      case 'updateVolume':
        await updateVolume(message.tabId, message.volume);
        return true;
      case 'getState':
        return getCurrentState();
      default:
        console.warn('Unknown message type:', message.type);
    }
  } catch (error) {
    console.error("Error in message listener:", error);
  }
});

browser.commands.onCommand.addListener(async (command) => {
  if (command === 'volume-up' || command === 'volume-down') {
    browser.runtime.sendMessage({
      type: 'volume-command',
      command: command
    });
  }
});

async function injectAudioProcessor(tabId) {
  return await browser.tabs.executeScript(tabId, {
    code: `
      (function() {
        if (!window.audioProcessor) {
          const audioContext = new AudioContext();
          const mediaElements = [...document.getElementsByTagName('audio'), 
                               ...document.getElementsByTagName('video')];
          
          if (mediaElements.length === 0) return false;
          
          window.audioProcessor = {
            context: audioContext,
            isMonoActive: false,
            elements: []
          };

          mediaElements.forEach(element => {
            try {
              const source = audioContext.createMediaElementSource(element);
              const splitter = audioContext.createChannelSplitter(2);
              const merger = audioContext.createChannelMerger(2);
              const gainNode = audioContext.createGain();
              
              source.connect(splitter);
              splitter.connect(merger, 0, 0);
              splitter.connect(merger, 1, 1);
              merger.connect(gainNode);
              gainNode.connect(audioContext.destination);
              
              window.audioProcessor.elements.push({
                splitter,
                merger,
                gainNode
              });
            } catch (e) {
              console.error('Error processing media element:', e);
            }
          });
          
          return true;
        }
        return true;
      })();
    `
  });
}

async function updateBadge(volume, isMonoMode, forceVolumeDisplay = false) {
  await browser.browserAction.setTitle({
    title: `Volume: ${Math.round(volume)}% (${isMonoMode ? 'Mono' : 'Stereo'})`
  });

  // Show volume if it's not 100% or if it was just changed
  if (forceVolumeDisplay || volumeChanged || volume !== 100) {
    await browser.browserAction.setBadgeText({ text: `${Math.round(volume)}` });
  } else {
    // Show M/S only if volume is 100%
    await browser.browserAction.setBadgeText({ text: isMonoMode ? 'M' : 'S' });
  }

  await browser.browserAction.setBadgeBackgroundColor({ color: BADGE_COLOR });
}

async function updateBrowserAction(volume) {
  currentVolume = volume;
  volumeChanged = true;
  await updateBadge(volume, isMonoActive, true);
  
  // Reset volumeChanged after 3 seconds but keep showing volume if not 100%
  setTimeout(() => {
    volumeChanged = false;
    updateBadge(currentVolume, isMonoActive);
  }, 3000);
}

async function updateVolume(tabId, volume) {
  try {
    await injectAudioProcessor(tabId);
    await browser.tabs.executeScript(tabId, {
      code: `
        (function() {
          if (window.audioProcessor) {
            window.audioProcessor.elements.forEach(el => {
              el.gainNode.gain.setValueAtTime(${volume}, window.audioProcessor.context.currentTime);
            });
            return true;
          }
          return false;
        })();
      `
    });
    await updateBrowserAction(volume * 100);
    await saveState(tabId); // Save state after volume change
    console.log("Volume updated:", volume);
  } catch (error) {
    console.error("Error in updateVolume:", error);
    throw error;
  }
}

async function toggleAudio(tabId) {
  console.log("Toggling audio for tab:", tabId);
  try {
    await injectAudioProcessor(tabId);
    
    const results = await browser.tabs.executeScript(tabId, {
      code: `
        (function() {
          if (!window.audioProcessor) return false;
          
          window.audioProcessor.isMonoActive = !window.audioProcessor.isMonoActive;
          
          window.audioProcessor.elements.forEach(el => {
            if (window.audioProcessor.isMonoActive) {
              el.splitter.connect(el.merger, 0, 1);
              el.splitter.connect(el.merger, 1, 0);
            } else {
              el.splitter.disconnect(el.merger, 0, 1);
              el.splitter.disconnect(el.merger, 1, 0);
            }
          });
          
          return window.audioProcessor.isMonoActive;
        })();
      `
    });
    
    isMonoActive = results[0];
    console.log("Audio state updated, isMonoActive:", isMonoActive);
    
    if (!volumeChanged) {
      await updateBadge(currentVolume, isMonoActive);
    }
    
    await saveState(tabId); // Save state after mono/stereo toggle
    
    await browser.runtime.sendMessage({
      type: 'audioStateChanged',
      isMonoActive: isMonoActive
    });
  } catch (error) {
    console.error("Error in toggleAudio:", error);
    throw error;
  }
}

// Initialize with volume display if not 100%
browser.browserAction.setBadgeText({ text: currentVolume !== 100 ? `${currentVolume}` : '' });
browser.browserAction.setBadgeBackgroundColor({ color: BADGE_COLOR });

// Add this function to get current state
async function getCurrentState() {
  return {
    volume: currentVolume,
    isMonoActive: isMonoActive
  };
} 