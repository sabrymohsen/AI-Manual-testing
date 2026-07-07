package com.ourcompany.tests;

import org.testng.annotations.BeforeMethod;
import org.testng.annotations.AfterMethod;
import com.shaft.driver.SHAFT;

public class BaseTest {
    protected SHAFT.GUI.WebDriver driver;

    @BeforeMethod(description = "Initialize WebDriver browser session")
    public void setUp() {
        // Initialize SHAFT WebDriver browser session
        driver = new SHAFT.GUI.WebDriver();
    }

    @AfterMethod(alwaysRun = true, description = "Quit WebDriver session and release browser resources")
    public void tearDown() {
        // Quit the driver session if active to prevent orphaned browser processes
        if (driver != null) {
            driver.quit();
        }
    }

    /**
     * Navigates the browser to the specified URL.
     * @param url Target URL destination.
     */
    protected void navigateTo(String url) {
        driver.browser().navigateToURL(url);
    }

    /**
     * Asserts that the current browser URL is equal to the expected URL.
     * @param expectedUrl The expected URL.
     */
    protected void assertCurrentUrl(String expectedUrl) {
        driver.assertThat().browser().url().isEqualTo(expectedUrl).perform();
    }

    /**
     * Asserts that the current page title is equal to the expected title.
     * @param expectedTitle The expected page title.
     */
    protected void assertPageTitle(String expectedTitle) {
        driver.assertThat().browser().title().isEqualTo(expectedTitle).perform();
    }

    /**
     * Verifies that the current page title is equal to the expected title (soft assertion).
     * @param expectedTitle The expected page title.
     */
    protected void verifyPageTitle(String expectedTitle) {
        driver.verifyThat().browser().title().isEqualTo(expectedTitle).perform();
    }
}
