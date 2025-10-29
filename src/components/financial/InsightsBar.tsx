import React from "react";

type InsightsBarProps = {
  insights: {
    wkLabel: string;
    salesActual: number;
    salesBudget: number;
    salesVar: number;
    salesVarPct: number;
    payrollPct: number;
    avgPayrollVar4w: number;
    currentWeekLabel: string; // e.g. "W44"
  } | null;
  payrollTarget: number;
  currentWeekNow: string; // from parent (same as insights.currentWeekLabel basically)
};

function formatMoney(n: number | undefined | null) {
  if (n === undefined || n === null || isNaN(Number(n))) return "£0";
  return "£" + Number(n).toLocaleString();
}

function formatPct(n: number | undefined | null) {
  if (n === undefined || n === null || isNaN(Number(n))) return "0.0%";
  return Number(n).toFixed(1) + "%";
}

export default function InsightsBar({
  insights,
  payrollTarget,
  currentWeekNow,
}: InsightsBarProps) {
  if (!insights) {
    // if we have no data yet, show skeleton-ish placeholders
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: "16px",
          marginTop: "8px",
        }}
      >
        <div
          style={{
            background:
              "linear-gradient(to bottom right, #ffffff, #f9fafb)",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            padding: "16px 20px",
            minHeight: "140px",
            boxShadow:
              "0 24px 40px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)",
            color: "#6b7280",
            fontSize: "13px",
            lineHeight: 1.4,
            fontStyle: "italic",
          }}
        >
          Loading last week…
        </div>
      </div>
    );
  }

  // pull useful numbers
  const {
    wkLabel,
    salesActual,
    salesBudget,
    salesVar,
    salesVarPct,
    payrollPct,
  } = insights;

  const payrollColour = payrollPct > payrollTarget ? "#dc2626" : "#111827";

  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: "16px",
      }}
    >
      {/* On desktop we want 2 columns */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @media(min-width:768px){
            .insightsGridTwoCols{
              grid-template-columns: 1fr 1fr;
            }
          }
        `,
        }}
      />
      <div className="insightsGridTwoCols" style={{ display: "grid", gap: "16px" }}>
        {/* LEFT CARD - Current Week */}
        <div
          style={{
            background:
              "linear-gradient(to bottom right, #ffffff, #f9fafb)",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            padding: "20px",
            minHeight: "160px",
            boxShadow:
              "0 24px 40px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              fontWeight: 500,
              color: "#6b7280",
              lineHeight: 1.2,
              marginBottom: "8px",
            }}
          >
            Current Week
          </div>

          <div
            style={{
              fontSize: "28px",
              fontWeight: 600,
              color: "#111827",
              lineHeight: 1.2,
            }}
          >
            {currentWeekNow}
          </div>

          <div
            style={{
              fontSize: "12px",
              color: "#6b7280",
              lineHeight: 1.4,
              marginTop: "12px",
            }}
          >
            Today&apos;s trading period
          </div>

          {/* 4-week payroll trend indicator (colour dot logic not in parent yet,
              but we COULD surface avgPayrollVar4w here later if you want) */}
        </div>

        {/* RIGHT CARD - Last Week Results */}
        <div
          style={{
            backgroundColor: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            padding: "20px",
            minHeight: "160px",
            boxShadow:
              "0 24px 40px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          {/* header row */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              flexWrap: "wrap",
              rowGap: "4px",
              marginBottom: "8px",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                fontWeight: 500,
                color: "#6b7280",
                lineHeight: 1.2,
              }}
            >
              Last Week Results
            </div>

            <div
              style={{
                fontSize: "12px",
                color: "#6b7280",
                lineHeight: 1.2,
                fontWeight: 500,
              }}
            >
              {wkLabel}
            </div>
          </div>

          {/* Sales vs Budget */}
          <div style={{ marginBottom: "12px" }}>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 500,
                color: "#374151",
                lineHeight: 1.3,
              }}
            >
              Sales vs Budget
            </div>

            <div
              style={{
                fontSize: "16px",
                fontWeight: 600,
                lineHeight: 1.3,
                color: salesVar < 0 ? "#dc2626" : "#16a34a",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "baseline",
                columnGap: "6px",
                rowGap: "2px",
              }}
            >
              <span>{formatMoney(salesVar)}</span>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  lineHeight: 1.3,
                }}
              >
                ({salesVarPct.toFixed(1)}%)
              </span>
            </div>

            <div
              style={{
                fontSize: "12px",
                color: "#6b7280",
                lineHeight: 1.4,
                marginTop: "4px",
              }}
            >
              Actual {formatMoney(salesActual)} vs Budget{" "}
              {formatMoney(salesBudget)}
            </div>
          </div>

          {/* Payroll % */}
          <div>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 500,
                color: "#374151",
                lineHeight: 1.3,
              }}
            >
              Payroll %
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "baseline",
                columnGap: "6px",
                rowGap: "2px",
              }}
            >
              <span
                style={{
                  fontSize: "20px",
                  fontWeight: 600,
                  lineHeight: 1.2,
                  color: payrollColour,
                }}
              >
                {formatPct(payrollPct)}
              </span>
              <span
                style={{
                  fontSize: "12px",
                  color: "#6b7280",
                  lineHeight: 1.3,
                }}
              >
                Target ≤ {payrollTarget}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}