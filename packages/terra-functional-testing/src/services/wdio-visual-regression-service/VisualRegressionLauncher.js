/* global browser */
const lodashIdentity = require('lodash.identity');
const lodashPickby = require('lodash.pickby');
const { LocalCompare } = require('./compare');
const makeElementScreenshot = require('./modules/makeElementScreenshot');
const getTerraFormFactor = require('./modules/getTerraFormFactor');

class VisualRegressionLauncher {
  /**
   * @param {Object} options - Service configuration options.
   * @param {Object} options.locale - The locale being tested.
   * @param {Object} options.theme - The theme being tested.
   */
  constructor(options = {}, _capabilities, config = {}) {
    const { launcherOptions } = config;
    const { locale, theme } = launcherOptions || {};

    /**
     * Always use the launcher options from the test runner if available before using
     * the options passed thru the service in wdio.conf.js. The reason is because the
     * service options set using env is cached and are unreliable if these options
     * are changed dynamically by the test runner.
     *
     * Reference: https://github.com/webdriverio/webdriverio/issues/6411
     */
    const visualRegressionOptions = {
      ...(locale || options.locale) && { locale: locale || options.locale },
      ...(theme || options.theme) && { theme: theme || options.theme },
    };

    this.compare = new LocalCompare(visualRegressionOptions);
    this.context = null;
    this.currentSuite = null;
    this.currentTest = null;
  }

  /**
   * Gets executed before test execution begins. At this point you can access
   * all global variables, such as `browser`.
   * @param {Object} capabilities - desiredCapabilities
   * @param {[type]} specs
   * @return null
   */
  async before(capabilities) {
    this.context = {
      desiredCapabilities: capabilities,
    };

    browser.addCommand('checkElement', this.wrapCommand(browser, makeElementScreenshot));
  }

  /**
   * Hook that gets executed before the suite starts.
   * @param {Object} suite - suite details
   */
  beforeSuite(suite) {
    this.currentSuite = suite;
  }

  /**
   * Hook that gets executed after the suite has ended.
   */
  afterSuite() {
    this.currentSuite = null;
  }

  /**
   * Function to be executed before a test in Mocha.
   * @param {Object} test - test details
   */
  beforeTest(test) {
    this.currentTest = test;
  }

  /**
   * Function to be executed after a test in Mocha.
   * @param {Object} test - test details
   */
  afterTest() {
    this.currentTest = null;
  }

  /**
   * Command wrapper to setup the command with the correct context values defined from the global
   * webdriver.IO WebDriver instance.
   *
   * @param {Object} browser - The global webdriver.IO WebDriver instance.
   * @param {function} command - The test command that should be executed.
   */
  wrapCommand(browser, command) {
    /**
     * The wrapped command with access to the global webdriver.IO WebDriver instance.
     *
     * @param {string} elementSelector - The css selector of the element that should be captured in the screenshot.
     * @param {Object=} options - The screenshot capturing and comparison options.
     * @param {string[]} options.hide - The list of elements to set opacity 0 on to 'hide' from the dom when capturing the screenshot.
     * @param {string[]} options.remove - The list of elements to set display: none on to 'remove' from dom when capturing the screenshot.
     * @param {string} options.ignoreComparison - The image comparison algorithm to use when processing the screenshot comparison.
     * @param {number} options.mismatchTolerance - The acceptable mismatch tolerance the screenshot can have when processing the screenshot comparison.
     * @param {string} options.name - The name of the screenshot.
     * @param {boolean} options.updateScreenshots - Whether or not to automatically update all reference screenshots with the latest screenshots.
     * @returns {Object} - The screenshot comparison results returned as { misMatchPercentage: Number, isSameDimensions: Boolean, getImageDataUrl: function }.
     */
    return async function wrappedScreenshotCommand(elementSelector, options) {
      let currentFormFactor;
      if (browser.isMobile) {
        currentFormFactor = await browser.getOrientation();
      } else {
        currentFormFactor = await getTerraFormFactor();
      }

      const screenshotContext = {
        desiredCapabilities: this.context.desiredCapabilities,
        suite: this.currentSuite,
        test: this.currentTest,
        meta: {
          currentFormFactor,
        },
        options,
      };

      const screenshotContextCleaned = lodashPickby(screenshotContext, lodashIdentity);
      const base64Screenshot = await command(browser, elementSelector, options);
      const results = await this.compare.processScreenshot(screenshotContextCleaned, base64Screenshot);
      return results;
    }.bind(this);
  }
}

module.exports = VisualRegressionLauncher;
