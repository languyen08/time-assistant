module.exports = {
  packagerConfig: {
    name: 'Friendly Task Reminder',
    executableName: 'friendly-task-reminder',
    asar: true,
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
    },
  ],
};
