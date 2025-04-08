const { defineConfig } = require('cypress');

module.exports = defineConfig({
  chromeWebSecurity: false,
  chromeArgs: ['--headless'],
  viewportWidth: 1280,
  viewportHeight: 720,
  defaultCommandTimeout: 5000,
  video: false,
  fixturesFolder: 'cypress/fixtures',
  screenshotsFolder: 'cypress/screenshots',
  videosFolder: 'cypress/videos',
  e2e: {
    setupNodeEvents(on, config) {
      on('task', {
        log(message) {
          console.log(message);
          return null
        },
        table(message) {
          console.table(message);
          return null
        }
      });
    }
  },
  reporter: 'cypress-multi-reporters',
  reporterOptions: {
    configFile: "reporter.json"
  }
});
