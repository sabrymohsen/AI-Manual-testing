package com.ourcompany.tests;

import org.testng.annotations.Test;

public class SampleTest extends BaseTest {

    @Test(description = "Verify page navigation and URL assertion to example.com using SHAFT Engine")
    public void testExampleNavigation() {
        // Navigate to target URL
        navigateTo("https://example.com");

        // Verify page title and URL using shared assertions from BaseTest
        assertCurrentUrl("https://example.com/");
        assertPageTitle("Example Domain");
    }
}
