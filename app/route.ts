import { NextResponse } from "next/server";
import { connectorClient } from "@/lib/connectorClient";

// Proxies through to the connectors service so the browser never needs its
// URL or token. Point this at whatever your real "list connectors" path is.
export async function GET() {
  const result = await connectorClient.request("/connectors");

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        upstreamStatus: result.status,
        error: result.error ?? "Connectors service returned a non-2xx response",
        baseUrl: connectorClient.baseUrl,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, data: result.data });
}
