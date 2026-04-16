const { withDangerousMod, createRunOncePlugin } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

function copyDirectoryRecursive(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    return false;
  }

  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourcePath, targetPath);
    } else if (entry.isSymbolicLink()) {
      const link = fs.readlinkSync(sourcePath);
      try {
        fs.unlinkSync(targetPath);
      } catch (_) {}
      fs.symlinkSync(link, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }

  return true;
}

function removeDirectoryContents(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  for (const entry of fs.readdirSync(dirPath)) {
    const entryPath = path.join(dirPath, entry);
    fs.rmSync(entryPath, { recursive: true, force: true });
  }
}

function withWakeWordModel(config, options = {}) {
  const sourceRelative = options.source || './native-assets/model';
  const required = options.required ?? false;

  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const sourceDir = path.resolve(projectRoot, sourceRelative);
      const targetDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'assets', 'model');

      if (!fs.existsSync(sourceDir)) {
        const message =
          "[withWakeWordModel] Model source folder not found at " +
          sourceDir +
          ". Wakeword model will not be copied.";

        if (required) {
          throw new Error(message);
        }

        console.warn(message);
        return modConfig;
      }

      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
      removeDirectoryContents(targetDir);
      copyDirectoryRecursive(sourceDir, targetDir);

      console.log('[withWakeWordModel] Copied wakeword model to android assets.');
      return modConfig;
    },
  ]);
}

module.exports = createRunOncePlugin(withWakeWordModel, 'with-wakeword-model', '1.0.0');
