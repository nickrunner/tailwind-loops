import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string };
  const { email } = body;

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const apiKey = process.env["BUTTONDOWN_API_KEY"];
  if (!apiKey) {
    return NextResponse.json(
      { error: "Email service not configured" },
      { status: 503 }
    );
  }

  const res = await fetch("https://api.buttondown.com/v1/subscribers", {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email_address: email }),
  });

  if (!res.ok) {
    const data = (await res.json()) as Record<string, unknown>;
    const detail =
      typeof data["detail"] === "string"
        ? data["detail"]
        : typeof data["email_address"] === "object" &&
            Array.isArray(data["email_address"])
          ? (data["email_address"] as string[])[0]
          : "Failed to subscribe";
    return NextResponse.json({ error: detail }, { status: res.status });
  }

  return NextResponse.json({ ok: true });
}
