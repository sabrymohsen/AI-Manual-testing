import { loginUser } from "../src/lib/auth"

async function main() {
  try {
    console.log("Testing loginUser for admin@example.com...")
    const session = await loginUser("admin@example.com", "admin123")
    console.log("Login successful! Session user:")
    console.log(JSON.stringify(session.user, null, 2))
    console.log("Token generated:", session.token)
  } catch (err: any) {
    console.error("Login failed:", err.message)
  }
}

main()
