-- Remove the invented sample rows the old /api/autotest/* routes inserted.
-- Each row is matched on all listed columns; matched rows are copied to a
-- seed_backup_* table first, so they can be restored with INSERT ... SELECT.
BEGIN;

CREATE TABLE IF NOT EXISTS seed_backup_healingevent_20261126 AS SELECT * FROM "HealingEvent" WHERE false;
INSERT INTO seed_backup_healingevent_20261126 SELECT * FROM "HealingEvent" WHERE ("originalLocator" = 'By.id("submit-btn-old")' AND "recoveredLocator" = 'By.xpath("//button[@type=''submit'' and contains(@class, ''indigo'')]")' AND "testName" = 'LoginFlowTest.testLoginRedirection' AND "pageUrl" = 'https://example.com/login')
   OR ("originalLocator" = 'By.cssSelector("input.search-bar")' AND "recoveredLocator" = 'By.id("search-input")' AND "testName" = 'SearchFlowTest.testSearchFunctionality' AND "pageUrl" = 'https://example.com/products')
   OR ("originalLocator" = 'By.xpath("//a[text()=''Upgrade Plan'']")' AND "recoveredLocator" = 'By.cssSelector("a.pricing-btn-upgrade")' AND "testName" = 'SettingsTest.testBillingUpgrade' AND "pageUrl" = 'https://example.com/settings')
   OR ("originalLocator" = 'By.id("deprecated-delete-btn")' AND "recoveredLocator" = 'By.xpath("//button[contains(@class, ''btn-danger'')]")' AND "testName" = 'AdminUserTest.testDeleteUser' AND "pageUrl" = 'https://example.com/admin')
   OR ("originalLocator" = 'By.className("pricing-plan-free")' AND "recoveredLocator" = 'By.cssSelector(".pricing-card-free")' AND "testName" = 'PricingTest.testFreePlanSelection' AND "pageUrl" = 'https://example.com/pricing');
DELETE FROM "HealingEvent" WHERE ("originalLocator" = 'By.id("submit-btn-old")' AND "recoveredLocator" = 'By.xpath("//button[@type=''submit'' and contains(@class, ''indigo'')]")' AND "testName" = 'LoginFlowTest.testLoginRedirection' AND "pageUrl" = 'https://example.com/login')
   OR ("originalLocator" = 'By.cssSelector("input.search-bar")' AND "recoveredLocator" = 'By.id("search-input")' AND "testName" = 'SearchFlowTest.testSearchFunctionality' AND "pageUrl" = 'https://example.com/products')
   OR ("originalLocator" = 'By.xpath("//a[text()=''Upgrade Plan'']")' AND "recoveredLocator" = 'By.cssSelector("a.pricing-btn-upgrade")' AND "testName" = 'SettingsTest.testBillingUpgrade' AND "pageUrl" = 'https://example.com/settings')
   OR ("originalLocator" = 'By.id("deprecated-delete-btn")' AND "recoveredLocator" = 'By.xpath("//button[contains(@class, ''btn-danger'')]")' AND "testName" = 'AdminUserTest.testDeleteUser' AND "pageUrl" = 'https://example.com/admin')
   OR ("originalLocator" = 'By.className("pricing-plan-free")' AND "recoveredLocator" = 'By.cssSelector(".pricing-card-free")' AND "testName" = 'PricingTest.testFreePlanSelection' AND "pageUrl" = 'https://example.com/pricing');

CREATE TABLE IF NOT EXISTS seed_backup_flakytest_20261126 AS SELECT * FROM "FlakyTest" WHERE false;
INSERT INTO seed_backup_flakytest_20261126 SELECT * FROM "FlakyTest" WHERE ("testName" = 'LoginFlowTest.testLoginRedirection' AND "rootCause" = 'Sync Issue (Element not loaded fast enough)' AND "suggestedFix" = 'Locator ''id=submit-btn'' took 4.2s — consider using clickableField(''Submit'') with explicit wait')
   OR ("testName" = 'SearchFlowTest.testSearchFunctionality' AND "rootCause" = 'Locator Issue (Dynamic class name overrides)' AND "suggestedFix" = 'Avoid dynamic CSS classes; switch to fixed accessibilityId() or target text')
   OR ("testName" = 'ApiCrudTest.testGetUserList' AND "rootCause" = 'Network Issue (Rate limiting on mock API)' AND "suggestedFix" = 'Add retry block or stub API responses locally with dynamic mock endpoints')
   OR ("testName" = 'SettingsTest.testBillingUpgrade' AND "rootCause" = 'Data Issue (Stale credit card mock tokens)' AND "suggestedFix" = 'Reset sandbox tokens inside test teardown block to prevent state overlap');
DELETE FROM "FlakyTest" WHERE ("testName" = 'LoginFlowTest.testLoginRedirection' AND "rootCause" = 'Sync Issue (Element not loaded fast enough)' AND "suggestedFix" = 'Locator ''id=submit-btn'' took 4.2s — consider using clickableField(''Submit'') with explicit wait')
   OR ("testName" = 'SearchFlowTest.testSearchFunctionality' AND "rootCause" = 'Locator Issue (Dynamic class name overrides)' AND "suggestedFix" = 'Avoid dynamic CSS classes; switch to fixed accessibilityId() or target text')
   OR ("testName" = 'ApiCrudTest.testGetUserList' AND "rootCause" = 'Network Issue (Rate limiting on mock API)' AND "suggestedFix" = 'Add retry block or stub API responses locally with dynamic mock endpoints')
   OR ("testName" = 'SettingsTest.testBillingUpgrade' AND "rootCause" = 'Data Issue (Stale credit card mock tokens)' AND "suggestedFix" = 'Reset sandbox tokens inside test teardown block to prevent state overlap');

CREATE TABLE IF NOT EXISTS seed_backup_diagnosis_20261126 AS SELECT * FROM "Diagnosis" WHERE false;
INSERT INTO seed_backup_diagnosis_20261126 SELECT * FROM "Diagnosis" WHERE ("testName" = 'LoginFlowTest.testLoginRedirection' AND "errorMessage" = 'org.openqa.selenium.TimeoutException: Expected condition failed: waiting for visibility of element located by By.id("submit-btn-old") (tried for 10 second(s) with 500 milliseconds interval)')
   OR ("testName" = 'ApiCrudTest.testGetUserList' AND "errorMessage" = 'Error: expect(received).toBe(expected) — data[0].first_name expected ''Michael'', received null (HTTP 429 Too Many Requests)')
   OR ("testName" = 'SettingsTest.testBillingUpgrade' AND "errorMessage" = 'Error: locator.click: no element matches locator(''.pricing-plan-free'')')
   OR ("testName" = 'LoginFlowTest.testLoginRedirection' AND "errorMessage" = 'org.openqa.selenium.TimeoutException: Expected condition failed: waiting for visibility of element located by By.id("submit-btn-old") (tried for 10 second(s) with 500 milliseconds interval)')
   OR ("testName" = 'ApiCrudTest.testGetUserList' AND "errorMessage" = 'java.lang.AssertionError: JSON path data[0].first_name expected Michael but was null (HTTP Status 429 Too Many Requests)')
   OR ("testName" = 'SettingsTest.testBillingUpgrade' AND "errorMessage" = 'org.openqa.selenium.NoSuchElementException: Cannot locate element with class name pricing-plan-free');
DELETE FROM "Diagnosis" WHERE ("testName" = 'LoginFlowTest.testLoginRedirection' AND "errorMessage" = 'org.openqa.selenium.TimeoutException: Expected condition failed: waiting for visibility of element located by By.id("submit-btn-old") (tried for 10 second(s) with 500 milliseconds interval)')
   OR ("testName" = 'ApiCrudTest.testGetUserList' AND "errorMessage" = 'Error: expect(received).toBe(expected) — data[0].first_name expected ''Michael'', received null (HTTP 429 Too Many Requests)')
   OR ("testName" = 'SettingsTest.testBillingUpgrade' AND "errorMessage" = 'Error: locator.click: no element matches locator(''.pricing-plan-free'')')
   OR ("testName" = 'LoginFlowTest.testLoginRedirection' AND "errorMessage" = 'org.openqa.selenium.TimeoutException: Expected condition failed: waiting for visibility of element located by By.id("submit-btn-old") (tried for 10 second(s) with 500 milliseconds interval)')
   OR ("testName" = 'ApiCrudTest.testGetUserList' AND "errorMessage" = 'java.lang.AssertionError: JSON path data[0].first_name expected Michael but was null (HTTP Status 429 Too Many Requests)')
   OR ("testName" = 'SettingsTest.testBillingUpgrade' AND "errorMessage" = 'org.openqa.selenium.NoSuchElementException: Cannot locate element with class name pricing-plan-free');

CREATE TABLE IF NOT EXISTS seed_backup_crossbrowserresult_20261126 AS SELECT * FROM "CrossBrowserResult" WHERE false;
INSERT INTO seed_backup_crossbrowserresult_20261126 SELECT * FROM "CrossBrowserResult" WHERE ("testId" = 'LoginFlowTest' AND "browserName" = 'Chrome' AND "status" = 'pass' AND "duration" = 1850)
   OR ("testId" = 'LoginFlowTest' AND "browserName" = 'Firefox' AND "status" = 'fail' AND "duration" = 2420)
   OR ("testId" = 'LoginFlowTest' AND "browserName" = 'Edge' AND "status" = 'pass' AND "duration" = 1980)
   OR ("testId" = 'LoginFlowTest' AND "browserName" = 'Safari' AND "status" = 'flaky' AND "duration" = 2900)
   OR ("testId" = 'ApiCrudTest' AND "browserName" = 'Chrome' AND "status" = 'pass' AND "duration" = 420)
   OR ("testId" = 'ApiCrudTest' AND "browserName" = 'Firefox' AND "status" = 'pass' AND "duration" = 460)
   OR ("testId" = 'ApiCrudTest' AND "browserName" = 'Edge' AND "status" = 'pass' AND "duration" = 450)
   OR ("testId" = 'ApiCrudTest' AND "browserName" = 'Safari' AND "status" = 'pass' AND "duration" = 520)
   OR ("testId" = 'DbQueryTest' AND "browserName" = 'Chrome' AND "status" = 'pass' AND "duration" = 120)
   OR ("testId" = 'DbQueryTest' AND "browserName" = 'Firefox' AND "status" = 'pass' AND "duration" = 140)
   OR ("testId" = 'DbQueryTest' AND "browserName" = 'Edge' AND "status" = 'pass' AND "duration" = 130)
   OR ("testId" = 'DbQueryTest' AND "browserName" = 'Safari' AND "status" = 'not_run' AND "duration" = 0)
   OR ("testId" = 'SearchFlowTest' AND "browserName" = 'Chrome' AND "status" = 'pass' AND "duration" = 1100)
   OR ("testId" = 'SearchFlowTest' AND "browserName" = 'Firefox' AND "status" = 'fail' AND "duration" = 1650)
   OR ("testId" = 'SearchFlowTest' AND "browserName" = 'Edge' AND "status" = 'pass' AND "duration" = 1200)
   OR ("testId" = 'SearchFlowTest' AND "browserName" = 'Safari' AND "status" = 'fail' AND "duration" = 1900);
DELETE FROM "CrossBrowserResult" WHERE ("testId" = 'LoginFlowTest' AND "browserName" = 'Chrome' AND "status" = 'pass' AND "duration" = 1850)
   OR ("testId" = 'LoginFlowTest' AND "browserName" = 'Firefox' AND "status" = 'fail' AND "duration" = 2420)
   OR ("testId" = 'LoginFlowTest' AND "browserName" = 'Edge' AND "status" = 'pass' AND "duration" = 1980)
   OR ("testId" = 'LoginFlowTest' AND "browserName" = 'Safari' AND "status" = 'flaky' AND "duration" = 2900)
   OR ("testId" = 'ApiCrudTest' AND "browserName" = 'Chrome' AND "status" = 'pass' AND "duration" = 420)
   OR ("testId" = 'ApiCrudTest' AND "browserName" = 'Firefox' AND "status" = 'pass' AND "duration" = 460)
   OR ("testId" = 'ApiCrudTest' AND "browserName" = 'Edge' AND "status" = 'pass' AND "duration" = 450)
   OR ("testId" = 'ApiCrudTest' AND "browserName" = 'Safari' AND "status" = 'pass' AND "duration" = 520)
   OR ("testId" = 'DbQueryTest' AND "browserName" = 'Chrome' AND "status" = 'pass' AND "duration" = 120)
   OR ("testId" = 'DbQueryTest' AND "browserName" = 'Firefox' AND "status" = 'pass' AND "duration" = 140)
   OR ("testId" = 'DbQueryTest' AND "browserName" = 'Edge' AND "status" = 'pass' AND "duration" = 130)
   OR ("testId" = 'DbQueryTest' AND "browserName" = 'Safari' AND "status" = 'not_run' AND "duration" = 0)
   OR ("testId" = 'SearchFlowTest' AND "browserName" = 'Chrome' AND "status" = 'pass' AND "duration" = 1100)
   OR ("testId" = 'SearchFlowTest' AND "browserName" = 'Firefox' AND "status" = 'fail' AND "duration" = 1650)
   OR ("testId" = 'SearchFlowTest' AND "browserName" = 'Edge' AND "status" = 'pass' AND "duration" = 1200)
   OR ("testId" = 'SearchFlowTest' AND "browserName" = 'Safari' AND "status" = 'fail' AND "duration" = 1900);

CREATE TABLE IF NOT EXISTS seed_backup_mcpactivity_20261126 AS SELECT * FROM "McpActivity" WHERE false;
INSERT INTO seed_backup_mcpactivity_20261126 SELECT * FROM "McpActivity" WHERE ("action" = 'test_list' AND "result" = 'Exposed 4 test classes from com.ourcompany.tests.')
   OR ("action" = 'test_run' AND "result" = 'Ran LoginFlowTest on browser Chrome. Build outcome: BUILD SUCCESS.')
   OR ("action" = 'doctor_analyze' AND "result" = 'Analyzed login failure report. Triage: NoSuchElementException detected.')
   OR ("action" = 'browser_navigate' AND "result" = 'Opened Chrome browser session and loaded target URL.')
   OR ("action" = 'report_get' AND "result" = 'Allure diagnostic metrics retrieved successfully.');
DELETE FROM "McpActivity" WHERE ("action" = 'test_list' AND "result" = 'Exposed 4 test classes from com.ourcompany.tests.')
   OR ("action" = 'test_run' AND "result" = 'Ran LoginFlowTest on browser Chrome. Build outcome: BUILD SUCCESS.')
   OR ("action" = 'doctor_analyze' AND "result" = 'Analyzed login failure report. Triage: NoSuchElementException detected.')
   OR ("action" = 'browser_navigate' AND "result" = 'Opened Chrome browser session and loaded target URL.')
   OR ("action" = 'report_get' AND "result" = 'Allure diagnostic metrics retrieved successfully.');

CREATE TABLE IF NOT EXISTS seed_backup_evidencefile_20261126 AS SELECT * FROM "EvidenceFile" WHERE false;
INSERT INTO seed_backup_evidencefile_20261126 SELECT * FROM "EvidenceFile" WHERE ("filePath" = '/assets/mock-screenshot-login-fail.png' AND "pageUrl" = 'https://example.com/login' AND "elementLocator" = 'By.id("submit-btn-old")')
   OR ("filePath" = '/assets/mock-screenshot-dashboard.png' AND "pageUrl" = 'https://example.com/dashboard' AND "elementLocator" = 'By.cssSelector(".user-profile-menu")')
   OR ("filePath" = '/assets/mock-api-response-429.json' AND "pageUrl" = 'https://reqres.in/api/users?page=2' AND "elementLocator" = 'GET /api/users')
   OR ("filePath" = '/assets/mock-execution-video.mp4' AND "pageUrl" = 'https://example.com/pricing' AND "elementLocator" = 'By.className("pricing-plan-free")')
   OR ("filePath" = '/assets/mock-network-trace.har' AND "pageUrl" = 'https://example.com/settings' AND "elementLocator" = 'By.xpath("//a[text()=''Upgrade Plan'']")');
DELETE FROM "EvidenceFile" WHERE ("filePath" = '/assets/mock-screenshot-login-fail.png' AND "pageUrl" = 'https://example.com/login' AND "elementLocator" = 'By.id("submit-btn-old")')
   OR ("filePath" = '/assets/mock-screenshot-dashboard.png' AND "pageUrl" = 'https://example.com/dashboard' AND "elementLocator" = 'By.cssSelector(".user-profile-menu")')
   OR ("filePath" = '/assets/mock-api-response-429.json' AND "pageUrl" = 'https://reqres.in/api/users?page=2' AND "elementLocator" = 'GET /api/users')
   OR ("filePath" = '/assets/mock-execution-video.mp4' AND "pageUrl" = 'https://example.com/pricing' AND "elementLocator" = 'By.className("pricing-plan-free")')
   OR ("filePath" = '/assets/mock-network-trace.har' AND "pageUrl" = 'https://example.com/settings' AND "elementLocator" = 'By.xpath("//a[text()=''Upgrade Plan'']")');

COMMIT;
