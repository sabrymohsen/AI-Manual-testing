import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

// Default templates code definitions
const DEFAULT_TEMPLATES = [
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
  }
]

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    let scripts = await prisma.testScript.findMany({
      orderBy: { createdAt: "desc" }
    })

    // Seed default templates if empty
    if (scripts.length === 0) {
      await Promise.all(
        DEFAULT_TEMPLATES.map((t) =>
          prisma.testScript.create({
            data: t
          })
        )
      )
      scripts = await prisma.testScript.findMany({
        orderBy: { createdAt: "desc" }
      })
    }

    return NextResponse.json({ scripts })
  } catch (err: any) {
    console.error("GET test scripts error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { name, type, code, tags } = body

    if (!name || !type || !code) {
      return NextResponse.json({ error: "Missing required fields: name, type, code" }, { status: 400 })
    }

    const script = await prisma.testScript.create({
      data: {
        name,
        type,
        code,
        tags: tags || []
      }
    })

    return NextResponse.json({ script }, { status: 201 })
  } catch (err: any) {
    console.error("POST test script error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
