# EPIC 1: SauceDemo Shopping Flow

- **Website:** https://www.saucedemo.com
- **Goal:** A shopper can log in, pick products, and complete a purchase.
- **Test users:** `standard_user`, `locked_out_user`, `problem_user`, `performance_glitch_user`, `error_user`, `visual_user`
- **Password (all users):** `secret_sauce`

| ID | User Story | Acceptance Criteria | Depends On | Status |
|---|---|---|---|---|
| SD-01 | As a **shopper**, I want to log in so that I can see the products. | `standard_user` / `secret_sauce` opens the **Products** page | — | ☐ |
| SD-02 | As a **shopper**, I want clear login errors so that I know what went wrong. | Empty username → "Epic sadface: Username is required". Empty password → "Password is required". Wrong details → "Username and password do not match any user in this service" | SD-01 | ☐ |
| SD-03 | As the **business**, I want blocked users kept out so that the system stays secure. | `locked_out_user` → "Sorry, this user has been locked out." | SD-01 | ☐ |
| SD-04 | As a **shopper**, I want to see the product list so that I can choose items. | 6 products shown, each with image, name, description, price, and **Add to cart** | SD-01 | ☐ |
| SD-05 | As a **shopper**, I want to sort products so that I can find items faster. | Sort options: Name (A to Z), Name (Z to A), Price (low to high), Price (high to low). The list reorders correctly | SD-04 | ☐ |
| SD-06 | As a **shopper**, I want to open a product's details so that I can read more. | Clicking a product name opens its detail page; **Back to products** returns to the list | SD-04 | ☐ |
| SD-07 | As a **shopper**, I want to add and remove items so that I control my cart. | Button switches **Add to cart** ⇄ **Remove**; the cart badge count goes up and down | SD-04, SD-06 | ☐ |
| SD-08 | As a **shopper**, I want to view my cart so that I can check my items. | Cart shows quantity, name, and price; **Continue Shopping** and **Checkout** work | SD-07 | ☐ |
| SD-09 | As a **shopper**, I want to enter my details at checkout so that my order can be processed. | First Name, Last Name, and Zip are required; empty field → "Error: First Name is required" (same for the others) | SD-08 | ☐ |
| SD-10 | As a **shopper**, I want to review the order total so that there are no surprises. | Item total + Tax = Total, and the maths is correct (tax ≈ 8%) | SD-09 | ☐ |
| SD-11 | As a **shopper**, I want an order confirmation so that I know the order is done. | **Finish** → "Thank you for your order!"; cart badge cleared; **Back Home** works | SD-10 | ☐ |
| SD-12 | As a **shopper**, I want a menu to log out and reset the app so that I can manage my session. | **Logout** returns to the login page; **Reset App State** empties the cart; the browser Back button after logout does not show products | SD-01, SD-07 | ☐ |

**Extra negative tests:**
- `problem_user` → wrong images and broken sorting (log as bugs).
- `performance_glitch_user` → slow login (log as a performance issue).

> Use fake data only. Never enter a real card number. If the live message wording differs slightly, record what you actually see.

---

## Dependency Chain (test in this order)

```
SD-01 → SD-04 → SD-06 → SD-07 → SD-08 → SD-09 → SD-10 → SD-11
```

---

## Test Execution Template

Copy this table for each story you test.

| Test ID | Story ID | Steps | Expected Result | Actual Result | Pass / Fail | Screenshot / Bug ID |
|---|---|---|---|---|---|---|
| TC-SD-01 | SD-01 | 1. Open saucedemo.com 2. Enter `standard_user` / `secret_sauce` 3. Click Login | Products page opens | | | |
| TC-SD-02 | SD-02 | 1. Leave username empty 2. Click Login | "Epic sadface: Username is required" | | | |
| | | | | | | |

## Bug Report Template

| Field | Value |
|---|---|
| Bug ID | BUG-001 |
| Linked Story | e.g. SD-10 |
| Title | … |
| Steps to Reproduce | 1. … 2. … 3. … |
| Expected | … |
| Actual | … |
| Severity | Medium |
| Screenshot | |
