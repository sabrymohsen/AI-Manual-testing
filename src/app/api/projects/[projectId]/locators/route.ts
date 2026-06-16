import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { chromium } from "playwright"
import { decryptSecret } from "@/lib/crypto"
import { saveFile } from "@/lib/storage"
import { handleLogin } from "@/lib/playwright/login-handler"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const locators = await prisma.elementLocator.findMany({
    where: { projectId: params.projectId },
    include: {
      moduleRelation: true,
      feature: true,
      component: true
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ locators })
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const body = await request.json()
  const { action } = body

  // Action: SAVE a locator
  if (action === "save") {
    const saved = await prisma.elementLocator.create({
      data: {
        projectId: params.projectId,
        moduleId: body.moduleId || null,
        featureId: body.featureId || null,
        componentId: body.componentId || null,
        friendlyName: body.friendlyName,
        description: body.description || null,
        pageUrl: body.pageUrl,
        tagName: body.tagName || null,
        visibleText: body.visibleText || null,
        locatorType: body.locatorType,
        locatorValue: body.locatorValue,
        recommendedSelector: body.recommendedSelector || null,
        cssSelector: body.cssSelector || null,
        xpathSelector: body.xpathSelector || null,
        idSelector: body.idSelector || null,
        testIdSelector: body.testIdSelector || null,
        roleSelector: body.roleSelector || null,
        textSelector: body.textSelector || null,
        labelSelector: body.labelSelector || null,
        placeholderSelector: body.placeholderSelector || null,
        reliabilityScore: body.reliabilityScore || 0,
        attributes: body.attributes || {},
        screenshotPath: body.screenshotPath || null,
        isValidated: true,
        matchCount: 1,
        lastValidatedAt: new Date(),
      },
    })
    return NextResponse.json({ locator: saved }, { status: 201 })
  }

  // Action: PICK elements via Playwright non-headless session
  if (action === "pick") {
    const { url, credentialId } = body
    if (!url) {
      return NextResponse.json({ error: "URL is required for picking" }, { status: 400 })
    }

    const project = await prisma.project.findFirst({
      where: { id: params.projectId, userId: session.user.id },
    })
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    let roleUsed = "None"
    let browser: any = null
    let context: any = null
    let page: any = null

    try {
      browser = await chromium.launch({ headless: false })
      context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      })
      page = await context.newPage()

      // Handle login if requested
      if (credentialId) {
        const cred = await prisma.projectCredential.findFirst({
          where: { id: credentialId, projectId: params.projectId },
        })
        if (cred) {
          roleUsed = cred.roleName
          const decryptedPassword = decryptSecret({
            encrypted: cred.encryptedPassword,
            iv: cred.encryptionIv,
            authTag: cred.encryptionAuthTag,
            keyVersion: cred.keyVersion,
          })

          const loginUrl = cred.loginUrl || project.webAppUrl
          await handleLogin(page, {
            url: loginUrl,
            username: cred.username,
            password: decryptedPassword,
          })

          // Audit credential usage
          await prisma.auditLog.create({
            data: {
              userId: session.user.id,
              projectId: params.projectId,
              credentialId: credentialId,
              action: "Use Credential for Locator Picker",
              details: `Credential role "${roleUsed}" used to log in for locator picker session.`,
            },
          })
        }
      }

      // Open target URL
      await page.goto(url, { waitUntil: "load" })

      // Set up communications channel
      let pickedData: any = null
      await page.exposeFunction("onElementPicked", (data: any) => {
        pickedData = data
      })

      // Inject selector generation logic and highlight script
      const clientSideInjectedScript = `(function() {
        function isDynamicValue(val) {
          if (!val) return false;
          const dynamicRegexes = [
            /ng-tns-c\\d+-\\d+/,
            /ng-star-inserted/,
            /css-[a-z0-9]+/i,
            /sc-[a-z0-9]+/i,
            /Mui[A-Z][a-zA-Z]+-root-\\d+/,
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            /^\\d+$/
          ];
          return dynamicRegexes.some((rx) => rx.test(val));
        }

        function getStableClasses(element) {
          const classList = element.className;
          if (typeof classList !== "string") return [];
          return classList
            .split(/\\s+/)
            .filter((c) => c && !isDynamicValue(c) && !c.startsWith("ng-") && !c.startsWith("css-") && !c.startsWith("sc-"));
        }

        function generateCssSelector(element) {
          const testId = element.getAttribute("data-testid") || element.getAttribute("data-test") || element.getAttribute("data-qa");
          if (testId && !isDynamicValue(testId)) {
            return '[data-testid="' + testId + '"]';
          }
          const id = element.id;
          if (id && !isDynamicValue(id)) {
            return '#' + id;
          }
          const name = element.getAttribute("name");
          if (name && !isDynamicValue(name)) {
            return element.tagName.toLowerCase() + '[name="' + name + '"]';
          }

          const path = [];
          let curr = element;
          while (curr && curr.nodeType === Node.ELEMENT_NODE) {
            const tagName = curr.tagName.toLowerCase();
            if (tagName === "body" || tagName === "html") {
              path.unshift(tagName);
              break;
            }
            const cTestId = curr.getAttribute("data-testid") || curr.getAttribute("data-test");
            if (cTestId && !isDynamicValue(cTestId)) {
              path.unshift('[data-testid="' + cTestId + '"]');
              break;
            }
            const cId = curr.id;
            if (cId && !isDynamicValue(cId)) {
              path.unshift('#' + cId);
              break;
            }
            const stableClasses = getStableClasses(curr);
            if (stableClasses.length > 0) {
              path.unshift(tagName + "." + stableClasses.join("."));
            } else {
              let siblingIndex = 1;
              let sibling = curr.previousElementSibling;
              while (sibling) {
                if (sibling.tagName.toLowerCase() === tagName) siblingIndex++;
                sibling = sibling.previousElementSibling;
              }
              path.unshift(tagName + ":nth-of-type(" + siblingIndex + ")");
            }
            curr = curr.parentElement;
          }
          return path.join(" > ");
        }

        function generateXPath(element) {
          const testId = element.getAttribute("data-testid") || element.getAttribute("data-test");
          if (testId && !isDynamicValue(testId)) {
            return "//*[@data-testid='" + testId + "']";
          }
          const id = element.id;
          if (id && !isDynamicValue(id)) {
            return "//*[@id='" + id + "']";
          }

          const paths = [];
          let curr = element;
          while (curr && curr.nodeType === Node.ELEMENT_NODE) {
            let index = 1;
            let sibling = curr.previousElementSibling;
            while (sibling) {
              if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === curr.tagName) {
                index++;
              }
              sibling = sibling.previousElementSibling;
            }
            const tagName = curr.tagName.toLowerCase();
            const indexPart = index > 1 || (curr.nextElementSibling && curr.nextElementSibling.tagName === curr.tagName)
              ? "[" + index + "]"
              : "";
            paths.unshift(tagName + indexPart);
            curr = curr.parentElement;
          }
          return "/" + paths.join("/");
        }

        function calculateReliabilityScore(locators) {
          let score = 0;
          if (locators.testIdSelector) score += 100;
          else if (locators.idSelector) score += 90;
          else if (locators.labelSelector) score += 80;
          else if (locators.placeholderSelector) score += 75;
          else if (locators.roleSelector) score += 70;
          else if (locators.textSelector && locators.textSelector.length < 40) score += 60;
          else if (locators.cssSelector) score += 40;
          else score += 10;

          if (locators.cssSelector && locators.cssSelector.includes("nth-of-type")) score -= 15;
          if (locators.xpathSelector && locators.xpathSelector.includes("/")) {
            const depth = locators.xpathSelector.split("/").length;
            if (depth > 5) score -= Math.min(25, depth * 2);
          }
          return Math.max(0, Math.min(100, score));
        }

        function chooseBestLocator(locators) {
          if (locators.testIdSelector) {
            return {
              locatorType: "test_id",
              locatorValue: locators.attributes["data-testid"] || locators.attributes["data-test"] || locators.attributes["data-qa"] || "",
              recommendedSelector: locators.testIdSelector,
            };
          }
          if (locators.idSelector) {
            const rawId = locators.idSelector.startsWith("#") ? locators.idSelector.substring(1) : locators.idSelector;
            return {
              locatorType: "css",
              locatorValue: "#" + rawId,
              recommendedSelector: locators.idSelector,
            };
          }
          if (locators.labelSelector) {
            return {
              locatorType: "label",
              locatorValue: locators.labelSelector,
              recommendedSelector: "Label: " + locators.labelSelector,
            };
          }
          if (locators.placeholderSelector) {
            return {
              locatorType: "placeholder",
              locatorValue: locators.placeholderSelector,
              recommendedSelector: "Placeholder: " + locators.placeholderSelector,
            };
          }
          if (locators.roleSelector) {
            const parts = locators.roleSelector.split(":");
            const role = parts[0];
            const name = parts.slice(1).join(":");
            return {
              locatorType: "role",
              locatorValue: role + ', name: "' + name + '"',
              recommendedSelector: "Role: " + role + " (" + name + ")",
            };
          }
          if (locators.textSelector && locators.textSelector.length < 50) {
            return {
              locatorType: "text",
              locatorValue: locators.textSelector,
              recommendedSelector: 'Text: "' + locators.textSelector + '"',
            };
          }
          if (locators.cssSelector) {
            return {
              locatorType: "css",
              locatorValue: locators.cssSelector,
              recommendedSelector: locators.cssSelector,
            };
          }
          return {
            locatorType: "xpath",
            locatorValue: locators.xpathSelector || "",
            recommendedSelector: locators.xpathSelector || "",
          };
        }

        function generateLocatorsForElement(element) {
          const tagName = element.tagName.toLowerCase();
          
          // SECURITY REQUIREMENT: Mask values from sensitive fields
          const isPasswordInput = tagName === "input" && (
            (element.getAttribute("type") || "").toLowerCase() === "password" ||
            (element.id || "").toLowerCase().includes("password") ||
            (element.getAttribute("name") || "").toLowerCase().includes("password") ||
            (element.getAttribute("autocomplete") || "").toLowerCase().includes("password")
          );

          let visibleText = isPasswordInput ? "" : (element.textContent?.trim().substring(0, 100) || "");

          const attributes = {};
          for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes[i];
            // Mask value of password fields
            if (isPasswordInput && ["value", "placeholder", "aria-label", "title"].includes(attr.name)) {
              attributes[attr.name] = "";
            } else {
              attributes[attr.name] = attr.value;
            }
          }

          const testId = element.getAttribute("data-testid") || element.getAttribute("data-test") || element.getAttribute("data-qa");
          const testIdSelector = testId && !isDynamicValue(testId) ? '[data-testid="' + testId + '"]' : undefined;

          const id = element.id;
          const idSelector = id && !isDynamicValue(id) ? '#' + id : undefined;

          const placeholder = isPasswordInput ? undefined : element.getAttribute("placeholder");
          const placeholderSelector = placeholder ? placeholder : undefined;

          let labelSelector;
          if (id) {
            const labelEl = document.querySelector('label[for="' + id + '"]');
            if (labelEl) labelSelector = labelEl.textContent?.trim() || undefined;
          }
          if (!labelSelector) {
            const labelParent = element.closest("label");
            if (labelParent) {
              const clone = labelParent.cloneNode(true);
              const input = clone.querySelector("input, select, textarea");
              if (input) input.remove();
              labelSelector = clone.textContent?.trim() || undefined;
            }
          }

          let roleSelector;
          let derivedRole = element.getAttribute("role");
          if (!derivedRole) {
            if (tagName === "button" || (tagName === "input" && (attributes["type"] === "button" || attributes["type"] === "submit"))) {
              derivedRole = "button";
            } else if (tagName === "a") {
              derivedRole = "link";
            } else if (tagName === "input" && attributes["type"] === "checkbox") {
              derivedRole = "checkbox";
            } else if (tagName === "input" && attributes["type"] === "radio") {
              derivedRole = "radio";
            } else if (tagName === "input" || tagName === "textarea") {
              derivedRole = "textbox";
            } else if (tagName === "select") {
              derivedRole = "combobox";
            } else if (tagName === "h1" || tagName === "h2" || tagName === "h3" || tagName === "h4" || tagName === "h5" || tagName === "h6") {
              derivedRole = "heading";
            }
          }

          if (derivedRole) {
            const accessibleName = element.getAttribute("aria-label") || labelSelector || visibleText || placeholder || attributes["title"] || "";
            roleSelector = derivedRole + ":" + accessibleName;
          }

          const textSelector = visibleText ? visibleText : undefined;
          const cssSelector = generateCssSelector(element);
          const xpathSelector = generateXPath(element);

          const partialLocators = {
            tagName,
            visibleText,
            idSelector,
            testIdSelector,
            roleSelector,
            textSelector,
            labelSelector,
            placeholderSelector,
            cssSelector,
            xpathSelector,
            attributes,
          };

          const score = calculateReliabilityScore(partialLocators);
          const best = chooseBestLocator(partialLocators);

          return {
            ...partialLocators,
            reliabilityScore: score,
            locatorType: best.locatorType,
            locatorValue: best.locatorValue,
            recommendedSelector: best.recommendedSelector,
          };
        }

        window.__startPicker = () => {
          const styleEl = document.createElement("style");
          styleEl.id = "qa-picker-style";
          styleEl.innerHTML = \`
            .qa-highlighted-element {
              outline: 3px solid #c084fc !important;
              outline-offset: -3px !important;
              background-color: rgba(192, 132, 252, 0.15) !important;
              cursor: crosshair !important;
            }
          \`;
          document.head.appendChild(styleEl);

          const onMouseOver = (e) => {
            e.target.classList.add("qa-highlighted-element");
          };

          const onMouseOut = (e) => {
            e.target.classList.remove("qa-highlighted-element");
          };

          const onClick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            e.target.classList.remove("qa-highlighted-element");
            document.removeEventListener("mouseover", onMouseOver, true);
            document.removeEventListener("mouseout", onMouseOut, true);
            document.removeEventListener("click", onClick, true);
            styleEl.remove();

            const data = generateLocatorsForElement(e.target);
            window.onElementPicked(data);
          };

          document.addEventListener("mouseover", onMouseOver, true);
          document.addEventListener("mouseout", onMouseOut, true);
          document.addEventListener("click", onClick, true);
        };
      })()`

      await page.evaluate(clientSideInjectedScript)
      await page.evaluate(() => (window as any).__startPicker())

      // Poll until pickedData is filled or window is closed
      const timeout = 60000 // 60s timeout
      let waited = 0
      while (!pickedData && waited < timeout) {
        await new Promise((r) => setTimeout(r, 500))
        waited += 500
        // Check if browser/page is closed
        if (page.isClosed()) {
          break
        }
      }

      if (!pickedData) {
        return NextResponse.json({ error: "No element picked within 60s timeout" }, { status: 408 })
      }

      // Take element screenshot
      let elementScreenshotPath: string | null = null
      try {
        const elementLocator = page.locator(pickedData.cssSelector)
        const screenshotBuffer = await elementLocator.screenshot({ type: "png" })
        elementScreenshotPath = await saveFile("screenshots", `picker-${Date.now()}.png`, screenshotBuffer)
      } catch (e) {
        // Fallback to page screenshot
        try {
          const screenshotBuffer = await page.screenshot({ type: "png" })
          elementScreenshotPath = await saveFile("screenshots", `picker-${Date.now()}.png`, screenshotBuffer)
        } catch {}
      }

      return NextResponse.json({
        locator: {
          ...pickedData,
          screenshotPath: elementScreenshotPath,
          pageUrl: url,
        },
      })
    } catch (err: any) {
      console.error("Locator picking error:", err)
      return NextResponse.json({ error: err.message || "Error running browser session" }, { status: 500 })
    } finally {
      if (context) await context.close()
      if (browser) await browser.close()
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
