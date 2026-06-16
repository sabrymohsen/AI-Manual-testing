# Data Model: AI Manual QA Tester

## Entity Relationship Overview

```
User ──< Project ──< ProjectCredential
                ├──< FigmaConfig (1:1)
                ├──< TestCase ──< TestStep
                ├──< TestRun ──< TestJob (1:1)
                │           ├──< TestStepResult
                │           ├──< Log
                │           ├──< NetworkLog
                │           ├──< VisualComparisonResult
                │           ├──< BugReport ──< Attachment
                │           └──< Attachment
                └──< AuditLog
```

## Entity Definitions

### User
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| email | String | Unique, used for login |
| passwordHash | String | bcrypt/argon2 hash |
| name | String? | Display name |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

### Project
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| name | String | Project display name |
| webAppUrl | String | Target application URL |
| figmaUrl | String? | Optional Figma design URL |
| description | String? | Free text |
| environment | Enum(Dev, Staging, UAT, Production) | Default: Staging |
| browserType | Enum(Chromium, Firefox, WebKit) | Default: Chromium |
| viewport | Enum(Desktop, Tablet, Mobile, Custom) | Default: Desktop |
| testType | Enum(Functional, VisualDesign, E2E, Regression, Smoke, Exploratory) | Default: Functional |
| customViewportWidth | Int? | Only when viewport=Custom |
| customViewportHeight | Int? | Only when viewport=Custom |
| userId | UUID | FK → User |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

### ProjectCredential
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| roleName | String | e.g. "Admin", "Viewer" |
| username | String | Login username/email |
| encryptedPassword | String | AES-256-GCM ciphertext |
| encryptionIv | String | Initialization vector |
| encryptionAuthTag | String | GCM auth tag |
| keyVersion | String | Key rotation version |
| loginUrl | String? | Custom login page URL |
| notes | String? | Free text |
| projectId | UUID | FK → Project |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

### FigmaConfig
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| projectId | UUID | FK → Project (unique) |
| encryptedApiToken | String? | AES-256-GCM ciphertext |
| encryptionIv | String? | |
| encryptionAuthTag | String? | |
| keyVersion | String | Default: v1 |
| fileKey | String? | Extracted from Figma URL |
| nodeId | String? | Extracted from Figma URL |
| visualTolerancePercent | Float | Default: 1.0 |
| lastFetchedAt | DateTime? | Last sync timestamp |

### TestCase
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| title | String | |
| module | String | e.g. "Login", "Checkout" |
| priority | Enum(Low, Medium, High, Critical) | Default: Medium |
| preconditions | String? | |
| source | Enum(Manual, AIGenerated, Imported, Exploratory) | Default: Manual |
| requiredCredentialId | UUID? | FK → ProjectCredential |
| testData | Json? | JSON object for test data |
| tags | String[] | Array of tags |
| projectId | UUID | FK → Project |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

### TestStep
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| testCaseId | UUID | FK → TestCase |
| stepNumber | Int | Order within test case |
| actionDescription | String | Human-readable |
| expectedResult | String | |
| actionType | Enum(open_url, click, fill, select, upload_file, wait_for_text, wait_for_url, assert_visible, assert_hidden, assert_text, assert_url, assert_api_status, screenshot, custom_instruction) | Default: custom_instruction |
| targetType | Enum(test_id, role, text, label, placeholder, css, xpath, url, none) | Default: none |
| targetValue | String? | The actual selector value |
| inputValue | String? | Text to fill, file path, etc. |
| timeoutMs | Int | Default: 10000 |
| assertions | Json? | Array of assertion objects |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

### TestRun
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| projectId | UUID | FK → Project |
| testCaseId | UUID? | FK → TestCase (nullable for ad-hoc) |
| credentialId | UUID? | FK → ProjectCredential |
| status | Enum(Queued, Running, Passed, Failed, Blocked, Warning, Cancelled) | Default: Queued |
| roleUsed | String | Default: "None" |
| browserType | Enum(Chromium, Firefox, WebKit) | Copied from project |
| viewport | Enum(Desktop, Tablet, Mobile, Custom) | Copied from project |
| viewportWidth | Int? | |
| viewportHeight | Int? | |
| triggeredBy | Enum(Manual, AIGenerated, Imported, Exploratory) | Default: Manual |
| startedAt | DateTime? | |
| completedAt | DateTime? | |
| durationMs | Int | Default: 0 |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

### TestJob
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| testRunId | UUID | FK → TestRun (unique) |
| status | Enum(Queued, Running, Completed, Failed, Cancelled) | Default: Queued |
| attempts | Int | Default: 0 |
| error | String? | Error message if failed |
| workerId | String? | Which worker picked it up |
| createdAt | DateTime | Auto |
| startedAt | DateTime? | |
| completedAt | DateTime? | |

### TestStepResult
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| testRunId | UUID | FK → TestRun |
| testStepId | UUID? | FK → TestStep |
| stepNumber | Int | |
| actionDescription | String | |
| expectedResult | String | |
| actualResult | String? | What actually happened |
| status | Enum(Pending, Running, Passed, Failed, Blocked, Warning, Skipped) | Default: Pending |
| screenshotBefore | String? | File path |
| screenshotAfter | String? | File path |
| errorDetails | String? | |
| notes | String? | |
| durationMs | Int | Default: 0 |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

### Log
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| testRunId | UUID | FK → TestRun |
| testStepResultId | UUID? | FK → TestStepResult |
| source | Enum(browser, server, playwright, ai, network) | |
| level | Enum(info, warning, error, debug) | |
| message | String | |
| raw | Json? | Original log data (sanitized) |
| timestamp | DateTime | |

### NetworkLog
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| testRunId | UUID | FK → TestRun |
| testStepResultId | UUID? | FK → TestStepResult |
| url | String | Request URL (sanitized) |
| method | String | GET, POST, etc. |
| status | Int? | Response status code |
| error | String? | Error message if failed |
| resourceType | String? | Document, XHR, Fetch, etc. |
| durationMs | Int | Default: 0 |
| requestHeaders | Json? | Sanitized |
| responseHeaders | Json? | Sanitized |
| responseBodyPreview | String? | First 1KB only, sanitized |
| timestamp | DateTime | |

### VisualComparisonResult
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| testRunId | UUID | FK → TestRun |
| stepResultId | UUID? | FK → TestStepResult |
| figmaImagePath | String | |
| actualImagePath | String | |
| diffImagePath | String? | |
| mismatchPercent | Float | 0.0 to 100.0 |
| tolerancePercent | Float | Configurable threshold |
| viewportWidth | Int | |
| viewportHeight | Int | |
| status | Enum(Pending, Running, Passed, Failed, Blocked, Warning, Skipped) | |
| createdAt | DateTime | Auto |

### BugReport
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| testRunId | UUID | FK → TestRun |
| title | String | |
| severity | Enum(Low, Medium, High, Critical) | |
| priority | Enum(Low, Medium, High, Critical) | |
| environment | Enum(Dev, Staging, UAT, Production) | |
| roleUsed | String | |
| stepsToReproduce | String | |
| expectedResult | String | |
| actualResult | String | |
| screenshotPath | String? | |
| consoleLogs | String? | Text summary |
| networkErrors | String? | Text summary |
| browser | Enum(Chromium, Firefox, WebKit) | |
| viewport | Enum(Desktop, Tablet, Mobile, Custom) | |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

### Attachment
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| testRunId | UUID | FK → TestRun |
| bugReportId | UUID? | FK → BugReport |
| fileName | String | |
| filePath | String | |
| fileType | String | MIME type |
| fileSize | Int? | Bytes |
| createdAt | DateTime | Auto |

### AuditLog
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| action | String | e.g. "USE_CREDENTIAL", "CREATE_PROJECT" |
| details | String | JSON string with context |
| userId | UUID | FK → User |
| projectId | UUID? | FK → Project |
| credentialId | UUID? | FK → ProjectCredential |
| createdAt | DateTime | Auto |

## Enums

All enums are defined in Prisma schema and map to database enum types:

- **Environment**: Dev, Staging, UAT, Production
- **BrowserType**: Chromium, Firefox, WebKit
- **ViewportType**: Desktop, Tablet, Mobile, Custom
- **TestType**: Functional, VisualDesign, E2E, Regression, Smoke, Exploratory
- **Priority**: Low, Medium, High, Critical
- **TestRunStatus**: Queued, Running, Passed, Failed, Blocked, Warning, Cancelled
- **StepStatus**: Pending, Running, Passed, Failed, Blocked, Warning, Skipped
- **TestCaseSource**: Manual, AIGenerated, Imported, Exploratory
- **ActionType**: open_url, click, fill, select, upload_file, wait_for_text, wait_for_url, assert_visible, assert_hidden, assert_text, assert_url, assert_api_status, screenshot, custom_instruction
- **TargetType**: test_id, role, text, label, placeholder, css, xpath, url, none
- **LogLevel**: info, warning, error, debug
- **LogSource**: browser, server, playwright, ai, network
- **JobStatus**: Queued, Running, Completed, Failed, Cancelled

## Key Relationships

- User → Project: One-to-many (user owns multiple projects)
- Project → ProjectCredential: One-to-many (project has multiple role credentials)
- Project → FigmaConfig: One-to-one (optional)
- Project → TestCase: One-to-many
- TestCase → TestStep: One-to-many (ordered by stepNumber)
- Project → TestRun: One-to-many
- TestRun → TestJob: One-to-one (queue job for this run)
- TestRun → TestStepResult: One-to-many (results for each step)
- TestRun → Log: One-to-many
- TestRun → NetworkLog: One-to-many
- TestRun → BugReport: One-to-many
- BugReport → Attachment: One-to-many
- TestRun → Attachment: One-to-many
- TestRun → VisualComparisonResult: One-to-many

## State Transitions

### TestRun Status Flow
```
Queued → Running → Passed
                 → Failed
                 → Blocked
                 → Warning
Queued → Cancelled (user cancels before worker picks up)
Running → Cancelled (user cancels during execution)
```

### Step Status Flow
```
Pending → Running → Passed
                  → Failed
                  → Blocked
                  → Warning
                  → Skipped
```

### Job Status Flow
```
Queued → Running → Completed
                 → Failed
Queued → Cancelled
```
