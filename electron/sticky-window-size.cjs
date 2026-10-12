const fs = require('node:fs');
const path = require('node:path');

const MIN_WIDTH = 360;
const MIN_HEIGHT = 240;

function validSize(size) {
  return (
    Number.isFinite(size?.width) &&
    size.width > 0 &&
    Number.isFinite(size?.height) &&
    size.height > 0
  );
}

function boundSize(size, workArea) {
  return {
    width: Math.min(
      Math.max(MIN_WIDTH, workArea.width - 16),
      Math.max(MIN_WIDTH, Math.ceil(size.width)),
    ),
    height: Math.min(
      Math.max(MIN_HEIGHT, workArea.height - 16),
      Math.max(MIN_HEIGHT, Math.ceil(size.height)),
    ),
  };
}

// Native geometry belongs to main; renderer settings are not available before window creation.
function createStickyWindowSize({ filePath, workArea, storage = fs, onError = console.warn }) {
  let saved;
  try {
    const value = JSON.parse(storage.readFileSync(filePath, 'utf8'));
    if (validSize(value)) saved = value;
  } catch (error) {
    if (error.code !== 'ENOENT') onError('Sticky Note size could not be loaded.', error);
  }
  let userSized = Boolean(saved);
  let timer;

  function save(windowInstance) {
    clearTimeout(timer);
    if (!userSized || windowInstance.isDestroyed()) return;
    const [width, height] = windowInstance.getContentSize();
    try {
      storage.mkdirSync(path.dirname(filePath), { recursive: true });
      storage.writeFileSync(filePath, JSON.stringify({ width, height }), 'utf8');
    } catch (error) {
      onError('Sticky Note size could not be saved.', error);
    }
  }

  return {
    options: {
      ...boundSize(saved ?? { width: 460, height: 360 }, workArea),
      useContentSize: true,
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      resizable: true,
    },
    attach(windowInstance) {
      // will-resize is a native user action on Windows; setContentSize does not emit it.
      windowInstance.on('will-resize', () => {
        userSized = true;
      });
      windowInstance.on('resize', () => {
        if (!userSized) return;
        clearTimeout(timer);
        timer = setTimeout(() => save(windowInstance), 250);
      });
      windowInstance.on('close', () => save(windowInstance));
      windowInstance.on('closed', () => clearTimeout(timer));
    },
    resizeToContent(windowInstance, height, displayWorkArea) {
      if (userSized) return false;
      const [width] = windowInstance.getContentSize();
      const bounded = boundSize({ width, height }, displayWorkArea);
      windowInstance.setContentSize(bounded.width, bounded.height);
      return true;
    },
    save,
  };
}

module.exports = { createStickyWindowSize };
