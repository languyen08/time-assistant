module.exports = {
  packagerConfig: {
    name: 'Time Assistant',
    executableName: 'Time Assistant',
    icon: 'build-resources/app-icon',
    asar: true,
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        setupIcon: 'build-resources/app-icon.ico',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
    },
  ],
};
