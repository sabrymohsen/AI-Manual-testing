import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guards";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "chat");

// POST /api/upload -> Upload an attachment for chat
export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Limit chat attachments to 50MB
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 400 });
    }

    // Create target directory
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });

    // Generate unique name
    const ext = path.extname(file.name).toLowerCase();
    const storedName = `${randomUUID()}${ext}`;
    const targetPath = path.join(UPLOAD_DIR, storedName);

    // Save file
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(targetPath, buffer);

    const publicPath = `/uploads/chat/${storedName}`;

    return NextResponse.json({
      name: file.name,
      url: publicPath,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
    }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/upload error:", error);
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}
