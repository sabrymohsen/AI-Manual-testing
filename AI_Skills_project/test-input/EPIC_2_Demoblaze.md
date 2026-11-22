# EPIC 2: Demoblaze Online Store

- **Website:** https://www.demoblaze.com
- **Goal:** A visitor can register, browse by category, and buy products.
- **Test user:** Create your own in DB-01.

| ID | User Story | Acceptance Criteria | Depends On | Status |
|---|---|---|---|---|
| DB-01 | As a **visitor**, I want to sign up so that I can have an account. | **Sign up** with a new username → alert "Sign up successful." | — | ☐ |
| DB-02 | As the **system**, I want to block duplicate usernames so that accounts are unique. | Existing username → "This user already exist." | DB-01 | ☐ |
| DB-03 | As a **user**, I want to log in so that I can shop with my account. | After login, the navbar shows "Welcome {username}" | DB-01 | ☐ |
| DB-04 | As a **user**, I want login errors so that I can fix my input. | Wrong password → "Wrong password."; unknown user → "User does not exist." | DB-03 | ☐ |
| DB-05 | As a **shopper**, I want to browse by category so that I can find products. | **Phones**, **Laptops**, **Monitors** each show only items of that type | — | ☐ |
| DB-06 | As a **shopper**, I want to page through products so that I can see more items. | **Next** / **Previous** buttons load more products | DB-05 | ☐ |
| DB-07 | As a **shopper**, I want to view a product page so that I can read its details. | Shows name, price "*includes tax", description, and **Add to cart** | DB-05 | ☐ |
| DB-08 | As a **shopper**, I want to add items to my cart so that I can buy them. | **Add to cart** → alert "Product added." | DB-07 | ☐ |
| DB-09 | As a **shopper**, I want to view my cart and delete items so that I manage my order. | Cart lists items; **Delete** removes one; **Total** updates | DB-08 | ☐ |
| DB-10 | As a **shopper**, I want to place an order so that I can buy my items. | **Place Order** opens a form; empty Name or Card → "Please fill out Name and Creditcard." | DB-09 | ☐ |
| DB-11 | As a **shopper**, I want a purchase receipt so that I have proof of my order. | "Thank you for your purchase!" with Id, Amount, Card, Name, Date; amount = cart total; cart empty afterwards | DB-10 | ☐ |
| DB-12 | As a **visitor**, I want to send a message through **Contact** so that I can reach the store. | Submit → "Thanks for the message!!" | — | ☐ |
| DB-13 | As a **user**, I want to log out so that my account is secure. | After **Log out**, "Log in" and "Sign up" show again | DB-03 | ☐ |

**Bug hunting tips:**
- Place an order with an **empty cart** → it is accepted (bug).
- Enter **letters** in the credit card field → it is accepted (bug).

> Use fake data only. Never enter a real card number. If the live message wording differs slightly, record what you actually see.

---

## Dependency Chain (test in this order)

```
DB-01 → DB-03 → DB-05 → DB-07 → DB-08 → DB-09 → DB-10 → DB-11
```

---

## Test Execution Template

Copy this table for each story you test.

| Test ID | Story ID | Steps | Expected Result | Actual Result | Pass / Fail | Screenshot / Bug ID |
|---|---|---|---|---|---|---|
| TC-DB-01 | DB-01 | 1. … 2. … 3. … | See acceptance criteria | | | |
| | | | | | | |

## Bug Report Template

| Field | Value |
|---|---|
| Bug ID | BUG-001 |
| Linked Story | e.g. DB-10 |
| Title | Order can be placed with an empty cart |
| Steps to Reproduce | 1. … 2. … 3. … |
| Expected | Order should be blocked when the cart is empty |
| Actual | Order is accepted with Amount: 0 |
| Severity | Medium |
| Screenshot | |
