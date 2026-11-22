# EPIC 3: Automation Exercise Full E-commerce

- **Website:** https://automationexercise.com
- **Goal:** A customer can manage an account, find products, and complete a paid order.
- **Tip:** The site has its own **Test Cases** page in the top menu, which you can compare your results against.

| ID | User Story | Acceptance Criteria | Depends On | Status |
|---|---|---|---|---|
| AE-01 | As a **visitor**, I want to register so that I can have an account. | Signup/Login → name + email → account details → "ACCOUNT CREATED!" → "Logged in as {name}" | — | ☐ |
| AE-02 | As the **system**, I want to reject duplicate emails so that accounts are unique. | "Email Address already exist!" | AE-01 | ☐ |
| AE-03 | As a **user**, I want to log in so that I can use my account. | Valid → "Logged in as {name}"; invalid → "Your email or password is incorrect!" | AE-01 | ☐ |
| AE-04 | As a **user**, I want to log out so that my session ends. | **Logout** returns to the login page | AE-03 | ☐ |
| AE-05 | As a **shopper**, I want to see all products so that I can browse. | **Products** page lists items; **View Product** shows category, price, availability, condition, brand | — | ☐ |
| AE-06 | As a **shopper**, I want to search products so that I can find items fast. | Search "top" → "SEARCHED PRODUCTS" heading with only matching items | AE-05 | ☐ |
| AE-07 | As a **shopper**, I want to filter by category and brand so that I can narrow choices. | Women > Dress shows only dresses; a brand (e.g. Polo) shows only that brand | AE-05 | ☐ |
| AE-08 | As a **shopper**, I want to add products with a quantity so that I can buy more than one. | Quantity 4 on the product page → **Add to cart** → cart shows quantity 4 and the correct total | AE-05 | ☐ |
| AE-09 | As a **shopper**, I want to manage my cart so that I can change my order. | Cart shows price, quantity, total per item; **X** removes an item | AE-08 | ☐ |
| AE-10 | As the **business**, I want checkout to require login so that orders are linked to an account. | Checkout while logged out → "Register / Login account to proceed on checkout." | AE-09, AE-03 | ☐ |
| AE-11 | As a **customer**, I want to check my address and order before paying so that delivery is correct. | Address matches the signup details; the comment box works | AE-10 | ☐ |
| AE-12 | As a **customer**, I want to pay by card so that I can finish the order. | Name, card number, CVC, expiry → "Order Placed!" / "Congratulations! Your order has been confirmed!" | AE-11 | ☐ |
| AE-13 | As a **customer**, I want to download my invoice so that I have a record. | **Download Invoice** gives a file with the correct amount | AE-12 | ☐ |
| AE-14 | As a **user**, I want to delete my account so that my data is removed. | **Delete Account** → "ACCOUNT DELETED!"; logging in again with the same details fails | AE-01 | ☐ |
| AE-15 | As a **visitor**, I want to use Contact Us with a file so that I can send feedback. | Submit with an attachment → "Success! Your details have been submitted successfully." | — | ☐ |
| AE-16 | As a **visitor**, I want to subscribe in the footer so that I get updates. | Enter an email → "You have been successfully subscribed!" | — | ☐ |

> Use fake data only. Never enter a real card number. If the live message wording differs slightly, record what you actually see.

---

## Dependency Chain (test in this order)

```
AE-01 → AE-03 → AE-05 → AE-08 → AE-09 → AE-10 → AE-11 → AE-12 → AE-13
```

---

## Test Execution Template

Copy this table for each story you test.

| Test ID | Story ID | Steps | Expected Result | Actual Result | Pass / Fail | Screenshot / Bug ID |
|---|---|---|---|---|---|---|
| TC-AE-01 | AE-01 | 1. … 2. … 3. … | See acceptance criteria | | | |
| | | | | | | |

## Bug Report Template

| Field | Value |
|---|---|
| Bug ID | BUG-001 |
| Linked Story | e.g. AE-10 |
| Title | … |
| Steps to Reproduce | 1. … 2. … 3. … |
| Expected | … |
| Actual | … |
| Severity | Medium |
| Screenshot | |
