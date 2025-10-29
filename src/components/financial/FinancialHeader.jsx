"use client";

import React from "react";

export default function FinancialHeader({
  profile,
  onSignOut,
  allowedLocations,
  location,
  setLocation,
  period,
  setPeriod,
  PERIODS,
}) {
  const name = profile?.full_name || "User";
  const roleRaw = profile?.role || "";
  const rolePretty =
    roleRaw.charAt(0).toUpperCase() +
    roleRaw.slice(1).toLowerCase();

  return (
    <header
      style={{
        width: "100%",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#111827",
        backgroundColor: "#fff",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          borderBottom: "1px solid #e5e7eb",
          padding: "0.75rem 1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          rowGap: "0.75rem",
          maxWidth: "1400px",
          margin: "0 auto",
        }}
      >
        {/* Logo + portal label */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            minWidth: 0,
            gap: "0.75rem",
          }}
        >
          <img
            src="/logo.png"
            alt="Company Logo"
            style={{
              height: "32px",
              width: "auto",
              objectFit: "contain",
            }}
          />
          <div style={{ lineHeight: 1.3 }}>
            <div
              style={{
                fontSize: "0.9rem",
                fontWeight: 600,
                color: "#111827",
                whiteSpace: "nowrap",
              }}
            >
              Company Portal
            </div>
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 400,
                color: "#6b7280",
                whiteSpace: "nowrap",
              }}
            >
              Financial Performance
            </div>
          </div>
        </div>

        {/* User + Sign out */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem 1rem",
          }}
        >
          <div
            style={{
              lineHeight: 1.3,
              textAlign: "right",
              minWidth: "120px",
            }}
          >
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "#111827",
              }}
            >
              {name}
            </div>
            <div
              style={{
                fontSize: "0.7rem",
                fontWeight: 400,
                color: "#6b7280",
                textTransform: "capitalize",
              }}
            >
              {rolePretty}
            </div>
          </div>

          <button
            onClick={onSignOut}
            style={{
              appearance: "none",
              border: 0,
              outline: 0,
              cursor: "pointer",
              backgroundColor: "#1d4ed8",
              backgroundImage:
                "linear-gradient(to bottom right,#2563eb,#1d4ed8)",
              color: "#fff",
              fontSize: "0.8rem",
              fontWeight: 600,
              lineHeight: 1.2,
              borderRadius: "0.5rem",
              padding: "0.55rem 0.9rem",
              boxShadow: "0 12px 24px rgba(29,78,216,0.35)",
              whiteSpace: "nowrap",
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Title + filters */}
      <div
        style={{
          maxWidth: "1400px",
          margin: "1rem auto 1.5rem",
          padding: "0 1rem",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            margin: 0,
            color: "#1f2937",
            fontSize: "1.75rem",
            fontWeight: 500,
            lineHeight: 1.2,
          }}
        >
          Performance 2025
        </h1>

        <div
          style={{
            marginTop: "1.25rem",
            display: "flex",
            flexWrap: "wrap",
            rowGap: "1rem",
            columnGap: "2rem",
            alignItems: "flex-start",
            justifyContent: "center",
            fontSize: "0.9rem",
            lineHeight: 1.4,
            color: "#111827",
          }}
        >
          {/* Location / Brand dropdown */}
          <div style={{ textAlign: "left" }}>
            <label
              style={{
                display: "block",
                fontWeight: 600,
                fontSize: "0.9rem",
                color: "#111827",
                marginBottom: "0.4rem",
              }}
            >
              Location / Brand:
            </label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              style={{
                minWidth: "220px",
                padding: "0.6rem 0.75rem",
                fontSize: "0.9rem",
                borderRadius: "0.5rem",
                border: "1px solid #d1d5db",
                backgroundColor: "#fff",
              }}
            >
              {allowedLocations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc === "GroupOverview" ? "Group Overview" : loc}
                </option>
              ))}
            </select>
          </div>

          {/* Period dropdown */}
          <div style={{ textAlign: "left" }}>
            <label
              style={{
                display: "block",
                fontWeight: 600,
                fontSize: "0.9rem",
                color: "#111827",
                marginBottom: "0.4rem",
              }}
            >
              Period:
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              style={{
                minWidth: "120px",
                padding: "0.6rem 0.75rem",
                fontSize: "0.9rem",
                borderRadius: "0.5rem",
                border: "1px solid #d1d5db",
                backgroundColor: "#fff",
              }}
            >
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </header>
  );
}
