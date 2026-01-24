import { NextResponse } from "next/server";
import { migrate } from "@/lib/db/migrate";

export async function POST(request: Request) {
  // Simple protection - require a secret key
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.MIGRATE_SECRET || process.env.ADMIN_PASSWORD;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await migrate();
    return NextResponse.json({ success: true, message: "Migration completed" });
  } catch (error) {
    console.error("Migration failed:", error);
    return NextResponse.json(
      { error: "Migration failed", details: String(error) },
      { status: 500 }
    );
  }
}
