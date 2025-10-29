"use client";

import React from "react";
import Link from "next/link";

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
  return (
    <header
      style={{
        position: "relative",
        padding: "1.5rem 1rem 2rem",
        maxWidth: "1200px",
        margin: "0 auto",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#111827",
      }}
    >
      {/* top-right user card */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          background:
            "linear-gradient(to right, rgb(31,41,55), rgb(55,65,81))",
          color: "#fff",
          borderRadius: "0.75rem",
          boxShadow:
            "0 24px 40px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.4)",
          padding: "0.75rem 1rem",
          minWidth: "190px",
          fontSize: "0.8rem",
          lineHeight: 1.3,
        }}
      >
        <div
          style={{
            fontWeight: 600,
            fontSize: "0.8rem",
            color: "#fff",
          }}
        >
          {profile?.full_name || "User"}
        </div>

        <div
          style={{
            fontSize: "0.7rem",
            color: "#d1d5db",
            marginTop: "0.15rem",
            textTransform: "capitalize",
          }}
        >
          {profile?.role || "—"}
        </div>

        <button
          onClick={onSignOut}
          style={{
            marginTop: "0.5rem",
            backgroundColor: "#2563eb",
            borderRadius: "0.5rem",
            padding: "0.4rem 0.6rem",
            width: "100%",
            textAlign: "center",
            fontSize: "0.7rem",
            fontWeight: 600,
            color: "#fff",
            border: "none",
            cursor: "pointer",
            boxShadow:
              "0 12px 24px rgba(37,99,235,0.5), 0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          Sign out
        </button>
      </div>

      {/* center stack: LOGO + "La Mia Mamma Portal / Staff Access" + selectors */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.75rem",
          textAlign: "center",
        }}
      >
        {/* ⬇⬇⬇ this is the ONLY functional change:
             wrapped logo/title block in <Link href="/">...</Link>
             so clicking it returns to main portal home */}
        <Link
          href="/"
          style={{
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div
            style={{
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.25rem",
            }}
          >
            <img
              src="/logo.png"
              alt="La Mia Mamma"
              style={{
                height: "3.5rem",
                width: "auto",
                objectFit: "contain",
                display: "block",
              }}
            />

            <div
              style={{
                fontSize: "0.9rem",
                fontWeight: 600,
                color: "#111827",
                lineHeight: 1.3,
              }}
            >
              La Mia Mamma Portal
            </div>

            <div
              style={{
                fontSize: "0.7rem",
                color: "#6b7280",
                lineHeight: 1.2,
              }}
            >
              Staff Access
            </div>
          </div>
        </Link>

        {/* selectors row under the logo */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "1rem",
            marginTop: "0.5rem",
          }}
        >
          {/* Location / Brand dropdown */}
          <div style={{ textAlign: "left" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "#374151",
                marginBottom: "0.25rem",
              }}
            >
              Select Location / Brand
            </label>

            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              style={{
                backgroundColor: "#fff",
                border: "1px solid #d1d5db",
                borderRadius: "0.5rem",
                padding: "0.5rem 0.75rem",
                minWidth: "220px",
                fontSize: "0.8rem",
                color: "#111827",
                boxShadow:
                  "0 8px 16px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.03)",
              }}
            >
              {allowedLocations?.map((loc) => (
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
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "#374151",
                marginBottom: "0.25rem",
              }}
            >
              Select Period
            </label>

            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              style={{
                backgroundColor: "#fff",
                border: "1px solid #d1d5db",
                borderRadius: "0.5rem",
                padding: "0.5rem 0.75rem",
                minWidth: "140px",
                fontSize: "0.8rem",
                color: "#111827",
                boxShadow:
                  "0 8px 16px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.03)",
              }}
            >
              {PERIODS?.map((p) => (
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