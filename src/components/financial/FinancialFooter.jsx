"use client";

import React from "react";

export default function FinancialFooter() {
  return (
    <footer
      style={{
        width: "100%",
        maxWidth: "1400px",
        margin: "3rem auto 2rem",
        padding: "2rem 1rem 0",
        borderTop: "1px solid rgba(0,0,0,0.07)",
        textAlign: "center",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#6b7280",
        fontSize: "0.8rem",
        lineHeight: 1.4,
      }}
    >
      <div style={{ marginBottom: "0.25rem", color: "#374151" }}>
        Financial Dashboard 2025
      </div>
      <div>
        App developed by{" "}
        <a
          href="https://honeysucklesdesign.co.uk"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "#111827",
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          Honeysuckles Design / Daniele Raicaldo
        </a>
      </div>
    </footer>
  );
}
