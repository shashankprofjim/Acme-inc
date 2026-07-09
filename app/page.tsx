"use client";

import { useState } from "react";

type ProbeState = {
  loading: boolean;
  status: "idle" | "ok" | "error";
  detail: string;
};

const initial: ProbeState = { loading: false, status: "idle", detail: "" };

export default function Home() {
  const [connectors, setConnectors] = useState<ProbeState>(initial);

  async function probeConnectors() {
    setConnectors({ loading: true, status: "idle", detail: "" });
    try {
      const res = await fetch("/api/connectors", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setConnectors({
          loading: false,
          status: "ok",
          detail: JSON.stringify(json.data ?? json, null, 2),
        });
      } else {
        setConnectors({
          loading: false,
          status: "error",
          detail: JSON.stringify(json, null, 2),
        });
      }
    } catch (err) {
      setConnectors({
        loading: false,
        status: "error",
        detail: err instanceof Error ? err.message : "Request failed",
      });
    }
  }

  const dot =
    connectors.status === "ok"
      ? "var(--ok)"
      : connectors.status === "error"
        ? "var(--bad)"
        : "var(--muted)";

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "64px 24px",
      }}
    >
      <header style={{ marginBottom: 40 }}>
        <div
          style={{
            fontSize: 12,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--accent)",
            marginBottom: 12,
          }}
        >
          sandbox
        </div>
        <h1 style={{ fontSize: 28, margin: 0, fontWeight: 600 }}>
          Acme Connector Sandbox
        </h1>
        <p style={{ color: "var(--muted)", marginTop: 12, fontSize: 14 }}>
          A bare Next.js app for poking at the connectors service. Set
          {" "}
          <code style={{ color: "var(--text)" }}>CONNECTOR_SERVICE_URL</code>{" "}
          in <code style={{ color: "var(--text)" }}>.env.local</code>, then run a
          probe.
        </p>
      </header>

      <section
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              className={connectors.loading ? "pulse" : undefined}
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: dot,
                display: "inline-block",
              }}
            />
            <span style={{ fontSize: 14 }}>GET /connectors</span>
          </div>
          <button
            onClick={probeConnectors}
            disabled={connectors.loading}
            style={{
              background: "var(--accent)",
              color: "#04211d",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 600,
              cursor: connectors.loading ? "default" : "pointer",
              opacity: connectors.loading ? 0.6 : 1,
            }}
          >
            {connectors.loading ? "Probing…" : "Run probe"}
          </button>
        </div>

        {connectors.detail && (
          <pre
            style={{
              marginTop: 20,
              marginBottom: 0,
              padding: 16,
              background: "#0b0d11",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12.5,
              color: connectors.status === "error" ? "var(--bad)" : "var(--text)",
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {connectors.detail}
          </pre>
        )}
      </section>

      <footer
        style={{
          marginTop: 32,
          fontSize: 12.5,
          color: "var(--muted)",
        }}
      >
        Sandbox health: <code>GET /api/health</code> · Proxy:{" "}
        <code>app/api/connectors/route.ts</code> · Client:{" "}
        <code>lib/connectorClient.ts</code>
      </footer>
    </main>
  );
}
