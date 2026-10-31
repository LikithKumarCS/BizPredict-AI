import { useState } from "react";

type UploadResult = {
  message: string;
  filename: string;
  rows: number;
  columns: string[];
  preview: Record<string, unknown>[];
  metrics?: {
    total_sales: number;
    total_profit: number;
    total_quantity: number;
    unique_products: number;
    profit_margin: number;
  };
};

const API_URL = "http://127.0.0.1:8000";

const REQUIRED_COLUMNS = [
  "Date",
  "Product",
  "Category",
  "Quantity",
  "Sales",
  "Profit",
];

export default function Upload() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<UploadResult | null>(null);

  const handleFileChange = (selectedFiles: FileList | null) => {
    setError("");
    setResult(null);

    if (!selectedFiles || selectedFiles.length === 0) {
      return;
    }

    const allowedExtensions = [".csv", ".xlsx", ".xls"];
    const newFiles: File[] = [];

    for (const selectedFile of Array.from(selectedFiles)) {
      const extension = selectedFile.name
        .substring(selectedFile.name.lastIndexOf("."))
        .toLowerCase();

      if (!allowedExtensions.includes(extension)) {
        setError(
          `${selectedFile.name}: only CSV, XLSX and XLS files are allowed.`
        );
        return;
      }

      if (selectedFile.size === 0) {
        setError(`${selectedFile.name}: the file is empty.`);
        return;
      }

      if (selectedFile.size > 10 * 1024 * 1024) {
        setError(`${selectedFile.name}: file must be smaller than 10 MB.`);
        return;
      }

      newFiles.push(selectedFile);
    }

    setFiles((previous) => [...previous, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setFiles((previous) => previous.filter((_, i) => i !== index));
  };

  const handleMerge = async () => {
    if (files.length === 0) {
      setError("Please select at least one file.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    const formData = new FormData();

    files.forEach((file) => {
      formData.append("files", file);
    });

    try {
      const response = await fetch(`${API_URL}/upload/merge`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const detail = data?.detail;

        let message = "Merge failed. Please try again.";

        if (typeof detail === "string") {
          message = detail;
        } else if (detail) {
          message =
            detail.message ||
            JSON.stringify(detail);
        }

        throw new Error(message);
      }

      if (!data || !data.filename || !Array.isArray(data.columns)) {
        throw new Error(
          "The backend returned an unexpected response."
        );
      }

      setResult(data as UploadResult);
    } catch (err) {
      console.error("Merge error:", err);

      if (err instanceof TypeError) {
        setError(
          "Cannot connect to FastAPI. Make sure the backend is running at http://127.0.0.1:8000."
        );
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "An unexpected error occurred."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    setFiles([]);
    setError("");
    setResult(null);
  };

  return (
    <div
      style={{
        padding: "32px",
        background: "#f4f6fc",
        minHeight: "100%",
        color: "#17213c",
        boxSizing: "border-box",
      }}
    >
      <h1 style={{ marginBottom: 8 }}>Upload Data</h1>

      <p
        style={{
          color: "#64748b",
          marginBottom: 28,
        }}
      >
        Upload one or multiple business datasets to analyze and
        forecast your sales.
      </p>

      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 28,
          maxWidth: 1000,
          boxShadow: "0 4px 20px rgba(20, 35, 70, 0.06)",
          boxSizing: "border-box",
        }}
      >
        <h2
          style={{
            fontSize: 20,
            marginTop: 0,
          }}
        >
          Import your datasets
        </h2>

        <p
          style={{
            color: "#64748b",
            fontSize: 14,
          }}
        >
          You can select multiple CSV or Excel files and merge
          them into one dataset.
        </p>

        {/* FILE SELECTOR */}

        <label
          style={{
            display: "block",
            border: "2px dashed #a5b4fc",
            background: "#f8faff",
            borderRadius: 12,
            padding: "36px 20px",
            textAlign: "center",
            cursor: "pointer",
            marginTop: 20,
          }}
        >
          <div
            style={{
              fontSize: 36,
              marginBottom: 12,
            }}
          >
            📁
          </div>

          <strong
            style={{
              display: "block",
              marginBottom: 8,
            }}
          >
            {files.length === 0
              ? "Choose datasets"
              : `${files.length} dataset${
                  files.length > 1 ? "s" : ""
                } selected`}
          </strong>

          <span
            style={{
              color: "#64748b",
              fontSize: 13,
            }}
          >
            Click here to select one or multiple CSV/Excel files
          </span>

          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            multiple
            disabled={loading}
            style={{
              display: "none",
            }}
            onChange={(e) => {
              handleFileChange(e.target.files);
              e.currentTarget.value = "";
            }}
          />
        </label>

        {/* SELECTED FILES */}

        {files.length > 0 && (
          <div
            style={{
              marginTop: 20,
              background: "#f8faff",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <strong
              style={{
                display: "block",
                marginBottom: 12,
              }}
            >
              Selected datasets
            </strong>

            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  marginBottom:
                    index === files.length - 1 ? 0 : 8,
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    minWidth: 0,
                    overflow: "hidden",
                  }}
                >
                  <strong
                    style={{
                      display: "block",
                      overflowWrap: "anywhere",
                    }}
                  >
                    ✓ {file.name}
                  </strong>

                  <span
                    style={{
                      color: "#64748b",
                      fontSize: 12,
                    }}
                  >
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </div>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => removeFile(index)}
                  style={{
                    border: "none",
                    background: "#fee2e2",
                    color: "#b91c1c",
                    borderRadius: 7,
                    padding: "7px 10px",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* REQUIRED COLUMNS */}

        <div
          style={{
            marginTop: 20,
            color: "#64748b",
            fontSize: 13,
            lineHeight: 1.8,
          }}
        >
          <strong>Required dataset columns:</strong>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 10,
            }}
          >
            {REQUIRED_COLUMNS.map((column) => (
              <span
                key={column}
                style={{
                  background: "#eef2ff",
                  color: "#5b35d5",
                  padding: "6px 12px",
                  borderRadius: 7,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {column}
              </span>
            ))}
          </div>
        </div>

        {/* ERROR */}

        {error && (
          <div
            role="alert"
            style={{
              background: "#fff1f2",
              color: "#be123c",
              padding: 14,
              borderRadius: 8,
              marginTop: 20,
              overflowWrap: "anywhere",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {/* BUTTONS */}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            marginTop: 24,
          }}
        >
          <button
            type="button"
            onClick={handleMerge}
            disabled={files.length === 0 || loading}
            style={{
              background:
                files.length === 0 || loading
                  ? "#a5b4fc"
                  : "#5b35d5",
              color: "#fff",
              border: "none",
              borderRadius: 9,
              padding: "13px 22px",
              fontWeight: 600,
              cursor:
                files.length === 0 || loading
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {loading ? "Merging..." : "Merge & Analyze"}
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={clearAll}
            style={{
              background: "transparent",
              color: "#64748b",
              border: "none",
              padding: "12px",
              cursor: "pointer",
            }}
          >
            ✕ Clear
          </button>
        </div>
      </div>

      {/* RESULT */}

      {result && (
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: 24,
            maxWidth: 1100,
            marginTop: 24,
            boxShadow:
              "0 4px 20px rgba(20, 35, 70, 0.06)",
            boxSizing: "border-box",
          }}
        >
          <h2
            style={{
              color: "#15803d",
              marginTop: 0,
            }}
          >
            ✓ Datasets merged successfully
          </h2>

          <p>{result.message}</p>

          <p>
            <strong>Files:</strong>{" "}
            {result.filename}
          </p>

          <p>
            <strong>Total merged rows:</strong>{" "}
            {result.rows}
          </p>

          <p>
            <strong>Columns:</strong>{" "}
            {result.columns.join(", ")}
          </p>

          {/* METRICS */}

          {result.metrics && (
            <>
              <h3>Combined dataset metrics</h3>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: 14,
                }}
              >
                {[
                  {
                    label: "Total Sales",
                    value: `₹${result.metrics.total_sales.toLocaleString(
                      "en-IN",
                      {
                        maximumFractionDigits: 2,
                      }
                    )}`,
                  },
                  {
                    label: "Total Profit",
                    value: `₹${result.metrics.total_profit.toLocaleString(
                      "en-IN",
                      {
                        maximumFractionDigits: 2,
                      }
                    )}`,
                  },
                  {
                    label: "Total Quantity",
                    value:
                      result.metrics.total_quantity.toLocaleString(
                        "en-IN"
                      ),
                  },
                  {
                    label: "Unique Products",
                    value:
                      result.metrics.unique_products.toLocaleString(
                        "en-IN"
                      ),
                  },
                  {
                    label: "Profit Margin",
                    value: `${result.metrics.profit_margin.toFixed(
                      2
                    )}%`,
                  },
                ].map((metric) => (
                  <div
                    key={metric.label}
                    style={{
                      background: "#f8faff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 10,
                      padding: 16,
                    }}
                  >
                    <div
                      style={{
                        color: "#64748b",
                        fontSize: 12,
                        marginBottom: 8,
                      }}
                    >
                      {metric.label}
                    </div>

                    <strong
                      style={{
                        fontSize: 18,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {metric.value}
                    </strong>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* PREVIEW */}

          <h3
            style={{
              marginTop: 28,
            }}
          >
            Combined data preview
          </h3>

          <div
            style={{
              overflowX: "auto",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr>
                  {result.columns.map((column) => (
                    <th
                      key={column}
                      style={{
                        textAlign: "left",
                        padding: 10,
                        background: "#f1f5f9",
                        borderBottom:
                          "1px solid #e2e8f0",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {result.preview.map((row, index) => (
                  <tr key={index}>
                    {result.columns.map((column) => (
                      <td
                        key={column}
                        style={{
                          padding: 10,
                          borderBottom:
                            "1px solid #e2e8f0",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {String(row[column] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}