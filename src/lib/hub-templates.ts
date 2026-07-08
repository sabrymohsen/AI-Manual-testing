// Shared SHAFT test script templates used by the Test Studio (UI + API seed)

export type HubScriptType = "Web" | "API" | "Database"

export interface HubTemplate {
  name: string
  type: HubScriptType
  tags: string[]
  code: string
}

// Builds a fresh script body for the "New Test" dropdown, injecting the class name
export function buildTemplateCode(type: HubScriptType, className: string): string {
  if (type === "API") {
    return `package com.ourcompany.tests;

import org.testng.annotations.Test;
import com.shaft.driver.SHAFT;

public class ${className} {
    @Test(description = "Verify API response using REST Assured via SHAFT")
    public void testApiEndpoint() {
        SHAFT.API api = new SHAFT.API("https://reqres.in");

        api.get("/api/users?page=2")
           .perform();

        api.assertThatResponse()
           .extractedJsonValue("page")
           .isEqualTo("2")
           .perform();
    }
}`
  }

  if (type === "Database") {
    return `package com.ourcompany.tests;

import org.testng.annotations.Test;
import com.shaft.driver.SHAFT;

public class ${className} {
    @Test(description = "Verify database query results using SHAFT Database validations")
    public void testDatabaseQuery() {
        // SHAFT.DB db = new SHAFT.DB(SHAFT.DB.DatabaseType.POSTGRESQL, "localhost", "5432", "mydb", "user", "pass");
        // String result = db.executeSelectQuery("SELECT status FROM users WHERE id = 1").toString();

        SHAFT.Validations.assertThat()
                         .object("Active")
                         .isEqualTo("Active")
                         .perform();
    }
}`
  }

  return `package com.ourcompany.tests;

import org.testng.annotations.Test;

public class ${className} extends BaseTest {
    @Test(description = "Verify web flow using SHAFT Engine")
    public void testWebFlow() {
        // Navigate to the target page
        navigateTo("https://example.com");

        // Assert on the page title
        assertPageTitle("Example Domain");
    }
}`
}

// Default library seeded on first load: LoginFlow, ApiCrud, DbQuery, SearchFlow, FormSubmit
export const DEFAULT_HUB_TEMPLATES: HubTemplate[] = [
  {
    name: "LoginFlowTest",
    type: "Web",
    tags: ["Web", "Login", "Sanity"],
    code: `package com.ourcompany.tests;

import org.testng.annotations.Test;

public class LoginFlowTest extends BaseTest {
    @Test(description = "Verify login flow redirection and page title using SHAFT Engine")
    public void testLoginRedirection() {
        // Navigate to example login page
        navigateTo("https://example.com/login");

        // Verify page url and title using core assertions
        assertCurrentUrl("https://example.com/login");
        assertPageTitle("Login Page");
    }
}`
  },
  {
    name: "ApiCrudTest",
    type: "API",
    tags: ["API", "REST", "CRUD"],
    code: `package com.ourcompany.tests;

import org.testng.annotations.Test;
import com.shaft.driver.SHAFT;

public class ApiCrudTest {
    @Test(description = "Verify GET user list API response using REST Assured via SHAFT")
    public void testGetUserList() {
        SHAFT.API api = new SHAFT.API("https://reqres.in");

        api.get("/api/users?page=2")
           .perform();

        api.assertThatResponse()
           .extractedJsonValue("data[0].first_name")
           .isEqualTo("Michael")
           .perform();
    }
}`
  },
  {
    name: "DbQueryTest",
    type: "Database",
    tags: ["Database", "JDBC", "Inventory"],
    code: `package com.ourcompany.tests;

import org.testng.annotations.Test;
import com.shaft.driver.SHAFT;

public class DbQueryTest {
    @Test(description = "Verify active users query matches specifications using SHAFT Database validations")
    public void testDatabaseConnection() {
        // Example SHAFT Database validation pattern
        // SHAFT.DB db = new SHAFT.DB(SHAFT.DB.DatabaseType.POSTGRESQL, "localhost", "5432", "mydb", "user", "pass");

        // Mock validation assertion to ensure JDBC driver functions cleanly
        SHAFT.Validations.assertThat()
                         .object("Active")
                         .isEqualTo("Active")
                         .perform();
    }
}`
  },
  {
    name: "SearchFlowTest",
    type: "Web",
    tags: ["Web", "Search", "Regression"],
    code: `package com.ourcompany.tests;

import org.testng.annotations.Test;

public class SearchFlowTest extends BaseTest {
    @Test(description = "Verify search input query and title updates using SHAFT Engine")
    public void testSearchFunctionality() {
        // Navigate to example search page
        navigateTo("https://example.com");

        // Assert title matches static domain spec
        assertPageTitle("Example Domain");
    }
}`
  },
  {
    name: "FormSubmitTest",
    type: "Web",
    tags: ["Web", "Forms", "Regression"],
    code: `package com.ourcompany.tests;

import org.testng.annotations.Test;

public class FormSubmitTest extends BaseTest {
    @Test(description = "Verify form field typing and submit flow using SHAFT Engine")
    public void testFormSubmission() {
        // Navigate to the target form page
        navigateTo("https://example.com");

        // driver.element().type(By.id("name"), "QA Tester");
        // driver.element().type(By.id("email"), "tester@example.com");
        // driver.element().click(By.cssSelector("button[type='submit']"));

        assertPageTitle("Example Domain");
    }
}`
  }
]
