

import { useEffect, useRef, useState, type FormEvent } from 'react'

import './App.css'
import './auth_styles.css'



const pages = [

  'Dashboard',

  'Upload Data',

  'Forecast',

  'Insights',

  'Scenario Analysis',

  'Reports',

  'Products',

  'Profile',

]



const icons = ['▦', '⇧', '⌁', '✧', '◈', '▤', '▣', '◉']



const months = [

  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',

  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',

]



const demoChartData = [35, 48, 43, 64, 55, 76, 60, 82, 72, 90, 78, 100]



type UploadResult = {

  message: string

  filename: string

  rows: number

  columns: string[]

  preview: Record<string, unknown>[]

  metrics: {

    total_sales: number

    total_profit: number

    total_quantity: number

    unique_products: number

    profit_margin: number

  }

  monthly_sales: {

    Month: string

    Sales: number

  }[]

}



function formatINR(value: number) {

  return new Intl.NumberFormat('en-IN', {

    style: 'currency',

    currency: 'INR',

    maximumFractionDigits: 0,

  }).format(value)

}

function UploadPage({
  onDataLoaded,
}: {
  onDataLoaded: (data: UploadResult) => void
}) {
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const MAX_FILE_SIZE = 10 * 1024 * 1024
  const MAX_TOTAL_SIZE = 30 * 1024 * 1024
  const validExtensions = ['.csv', '.xlsx', '.xls']

  const handleFiles = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return

    setError('')
    setMessage('')
    setResult(null)

    const selected = Array.from(selectedFiles)

    const invalidFile = selected.find((file) => {
      const name = file.name.toLowerCase()
      return !validExtensions.some((ext) => name.endsWith(ext))
    })

    if (invalidFile) {
      setError(`${invalidFile.name}: please select a CSV or Excel file.`)
      return
    }

    const tooLarge = selected.find((file) => file.size > MAX_FILE_SIZE)
    if (tooLarge) {
      setError(`${tooLarge.name}: each file must be smaller than 10 MB.`)
      return
    }

    const totalSize = selected.reduce((sum, file) => sum + file.size, 0)
    if (totalSize > MAX_TOTAL_SIZE) {
      setError('The combined file size must be smaller than 30 MB.')
      return
    }

    setFiles((current) => {
      const existing = new Set(current.map((file) => `${file.name}-${file.size}`))
      const newFiles = selected.filter(
        (file) => !existing.has(`${file.name}-${file.size}`)
      )
      return [...current, ...newFiles]
    })

    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  const removeFile = (index: number) => {
    setFiles((current) => current.filter((_, i) => i !== index))
    setError('')
    setMessage('')
    setResult(null)
  }

  const clearFiles = () => {
    setFiles([])
    setError('')
    setMessage('')
    setResult(null)

    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  const handleUpload = async () => {
    if (files.length === 0) {
      setError('Please select at least one file.')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')
    setResult(null)

    const formData = new FormData()
    files.forEach((file) => {
      formData.append('files', file)
    })

    try {
      const response = await fetch('http://127.0.0.1:8000/upload/merge', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        const detail = data.detail

        if (typeof detail === 'string') {
          throw new Error(detail)
        }

        if (detail?.missing_columns) {
          throw new Error(
            `${detail.message} Missing: ${detail.missing_columns.join(', ')}`
          )
        }

        throw new Error(
          detail?.message ||
          JSON.stringify(detail || 'File upload failed.')
        )
      }

      if (
        !data ||
        typeof data.filename !== 'string' ||
        !Array.isArray(data.columns) ||
        !Array.isArray(data.preview) ||
        !data.metrics
      ) {
        throw new Error('The backend returned an unexpected response.')
      }

      const mergedData = data as UploadResult
      setResult(mergedData)
      setMessage(mergedData.message)
      onDataLoaded(mergedData)
    } catch (err) {
      if (err instanceof TypeError) {
        setError(
          'Could not connect to the backend. Make sure FastAPI is running at http://127.0.0.1:8000.'
        )
      } else {
        setError(
          err instanceof Error ? err.message : 'An unexpected error occurred.'
        )
      }
    } finally {
      setLoading(false)
    }
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0)

  return (
    <div className="upload-page">
      <div className="welcome">
        <div>
          <p className="eyebrow">DATA MANAGEMENT</p>
          <h1>Upload Data</h1>
          <p className="subtext">
            Upload multiple business datasets and combine them for forecasting
            and analysis.
          </p>
        </div>
      </div>

      <div className="upload-card">
        <h2>Upload your business datasets</h2>
        <p>
          Select one or more CSV or Excel files. All selected datasets will be
          validated and merged into one active dataset.
        </p>

        <label className="upload-zone" htmlFor="business-file">
          <span className="upload-symbol">⇧</span>
          <strong>Click to browse and select files</strong>
          <span>Supported formats: CSV, XLSX, XLS</span>
          <small>Maximum 10 MB per file · 30 MB combined</small>

          <input
            ref={inputRef}
            id="business-file"
            type="file"
            accept=".csv,.xlsx,.xls"
            multiple
            onChange={(event) => handleFiles(event.target.files)}
          />
        </label>

        {files.length > 0 && (
          <div className="selected-files">
            <div className="file-list-heading">
              <strong>Selected files ({files.length})</strong>
              <small>{(totalSize / (1024 * 1024)).toFixed(2)} MB total</small>
            </div>

            {files.map((file, index) => (
              <div className="selected-file" key={`${file.name}-${index}`}>
                <span className="file-symbol">▤</span>
                <div className="file-info">
                  <strong>{file.name}</strong>
                  <small>
                    {(file.size / 1024).toFixed(1)} KB · Ready to merge
                  </small>
                </div>
                <span className="success-symbol">✓</span>
                <button
                  type="button"
                  className="remove-file"
                  onClick={() => removeFile(index)}
                  title={`Remove ${file.name}`}
                  disabled={loading}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <p className="upload-error" role="alert">{error}</p>}
        {message && <p className="upload-success">{message}</p>}

        <div className="required">
          <strong>Required dataset columns</strong>
          <div className="column-tags">
            {['Date', 'Product', 'Category', 'Quantity', 'Sales', 'Profit'].map(
              (column) => (
                <span key={column}>{column}</span>
              )
            )}
          </div>
          <small>
            Every file must contain these columns. Rows are combined; duplicate
            rows are not automatically removed.
          </small>
        </div>

        <div className="upload-actions">
          <button
            type="button"
            className="primary-button"
            disabled={files.length === 0 || loading}
            onClick={handleUpload}
          >
            {loading ? 'Merging datasets...' : '⇧ Merge and Validate'}
          </button>

          <button
            type="button"
            className="clear-button"
            disabled={files.length === 0 || loading}
            onClick={clearFiles}
          >
            ✕ Clear All
          </button>
        </div>
      </div>

      {result && (
        <div className="upload-card" style={{ marginTop: 24 }}>
          <h2>✓ Datasets merged successfully</h2>
          <p><strong>Files:</strong> {result.filename}</p>
          <p><strong>Total rows:</strong> {result.rows.toLocaleString('en-IN')}</p>
          <p><strong>Total columns:</strong> {result.columns.length}</p>
          <p><strong>Total sales:</strong> {formatINR(result.metrics.total_sales)}</p>
          <p><strong>Total profit:</strong> {formatINR(result.metrics.total_profit)}</p>
          <p><strong>Unique products:</strong> {result.metrics.unique_products}</p>

          <h3>Combined data preview</h3>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
              }}
            >
              <thead>
                <tr>
                  {result.columns.map((column) => (
                    <th
                      key={column}
                      style={{
                        padding: 10,
                        background: '#f1f5f9',
                        borderBottom: '1px solid #ddd',
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
                          borderBottom: '1px solid #eee',
                        }}
                      >
                        {String(row[column] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="subtext">
            Your dashboard, insights, forecast, and product analysis can now
            use the merged dataset.
          </p>
        </div>
      )}
    </div>
  )
}





function ForecastPage({ dataset }: { dataset: UploadResult | null }) {
  const [month, setMonth] = useState('10')
  const [product, setProduct] = useState('')
  const [category, setCategory] = useState('')
  const [year, setYear] = useState('2026')
  const [day, setDay] = useState('5')
  const [quantity, setQuantity] = useState('10')
  const [profit, setProfit] = useState('500')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [prediction, setPrediction] = useState<number | null>(null)

  // Use the uploaded dataset's first preview row to prefill the form.
  useEffect(() => {
    const row = dataset?.preview?.[0]
    if (!row) return

    if (row.Product !== undefined && row.Product !== null) setProduct(String(row.Product))
    if (row.Category !== undefined && row.Category !== null) setCategory(String(row.Category))
    if (row.Quantity !== undefined && row.Quantity !== null) setQuantity(String(row.Quantity))
    if (row.Profit !== undefined && row.Profit !== null) setProfit(String(row.Profit))

    if (row.Date !== undefined && row.Date !== null) {
      const rawDate = String(row.Date)
      const parsed = new Date(rawDate)
      if (!Number.isNaN(parsed.getTime())) {
        setMonth(String(parsed.getMonth() + 1))
        setYear(String(parsed.getFullYear()))
        setDay(String(parsed.getDate()))
      }
    }
    setPrediction(null)
    setError('')
  }, [dataset])

  const handlePredict = async () => {
    setError('')
    setPrediction(null)

    if (!product.trim() || !category.trim()) {
      setError('Upload a dataset or enter a product and category.')
      return
    }

    const monthValue = Number(month)
    const yearValue = Number(year)
    const dayValue = Number(day)
    const quantityValue = Number(quantity)
    const profitValue = Number(profit)

    if (
      ![monthValue, yearValue, dayValue, quantityValue, profitValue].every(Number.isFinite) ||
      !Number.isInteger(monthValue) || monthValue < 1 || monthValue > 12 ||
      !Number.isInteger(dayValue) || dayValue < 1 || dayValue > 31 ||
      !Number.isInteger(yearValue) || yearValue < 2000 || yearValue > 2100 ||
      quantityValue < 0
    ) {
      setError('Please enter valid values for month, date, year, quantity and profit.')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('http://127.0.0.1:8000/forecast/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          Month: monthValue,
          Product: product.trim(),
          Category: category.trim(),
          Year: yearValue,
          Day: dayValue,
          Quantity: quantityValue,
          Profit: profitValue,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const detail = typeof data.detail === 'string'
          ? data.detail
          : data.detail?.message || JSON.stringify(data.detail || `Request failed (${response.status})`)
        throw new Error(detail)
      }

      const result = Number(data.predicted_sales)
      if (!Number.isFinite(result)) throw new Error('The API did not return a valid predicted_sales value.')
      setPrediction(result)
    } catch (err) {
      setError(
        err instanceof TypeError
          ? 'Cannot connect to FastAPI. Confirm the backend is running at http://127.0.0.1:8000 and check CORS.'
          : err instanceof Error ? err.message : 'An unexpected prediction error occurred.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="forecast-page">
      <div className="welcome">
        <div>
          <p className="eyebrow">AI-POWERED ANALYTICS</p>
          <h1>Sales Forecast</h1>
          <p className="subtext">Generate a sales estimate using your trained machine learning model.</p>
        </div>
      </div>

      <div className="upload-card">
        <h2>Enter prediction details</h2>
        {dataset ? (
          <p className="subtext">
            Using uploaded dataset: <strong>{dataset.filename}</strong> ({dataset.rows.toLocaleString('en-IN')} rows).
            The form is prefilled from the first preview record; edit values if needed.
          </p>
        ) : (
          <p className="subtext">Upload and validate a CSV or Excel dataset to prefill these fields, or enter values manually.</p>
        )}

        <div className="forecast-form-grid">
          <label>Month (1–12)<input type="number" min="1" max="12" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
          <label>Product<input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="e.g. Laptop" /></label>
          <label>Category<input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Electronics" /></label>
          <label>Year<input type="number" min="2000" max="2100" value={year} onChange={(e) => setYear(e.target.value)} /></label>
          <label>Day (1–31)<input type="number" min="1" max="31" value={day} onChange={(e) => setDay(e.target.value)} /></label>
          <label>Quantity<input type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
          <label>Profit (₹)<input type="number" step="any" value={profit} onChange={(e) => setProfit(e.target.value)} /></label>
        </div>

        {error && <p className="upload-error" role="alert">{error}</p>}
        <div className="upload-actions" style={{ marginTop: 24 }}>
          <button type="button" className="primary-button" onClick={handlePredict} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Prediction'}
          </button>
        </div>
      </div>

      {prediction !== null && (
        <div className="upload-card forecast-result" style={{ marginTop: 24 }} aria-live="polite">
          <p className="eyebrow">MODEL PREDICTION</p>
          <h2>Predicted Sales</h2>
          <h1>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(prediction)}</h1>
          <p className="subtext">Prototype estimate based on the submitted input values. Validate model accuracy before using it for business decisions.</p>
        </div>
      )}
    </div>
  )
}

function InsightsPage({ dataset }: { dataset: UploadResult | null }) {
  if (!dataset) return <div className="placeholder"><div className="placeholder-icon">✧</div><h2>Insights</h2><p>Upload a dataset first to view business insights based on your data.</p></div>
  const monthly = dataset.monthly_sales || []
  const highestMonth = monthly.reduce<{ Month: string; Sales: number } | null>((best, item) => !best || item.Sales > best.Sales ? item : best, null)
  const averageSales = monthly.length ? dataset.metrics.total_sales / monthly.length : 0
  return <div className="page-module">
    <div className="welcome"><div><p className="eyebrow">DATA-DRIVEN FINDINGS</p><h1>Business Insights</h1><p className="subtext">Highlights calculated from {dataset.filename} ({dataset.rows.toLocaleString('en-IN')} rows).</p></div></div>
    <div className="stats-grid">
      <div className="stat-card"><div className="stat-top"><span>Total Sales</span><span className="stat-icon">₹</span></div><h2>{formatINR(dataset.metrics.total_sales)}</h2><small>Uploaded dataset</small></div>
      <div className="stat-card"><div className="stat-top"><span>Total Profit</span><span className="stat-icon">↗</span></div><h2>{formatINR(dataset.metrics.total_profit)}</h2><small>Uploaded dataset</small></div>
      <div className="stat-card"><div className="stat-top"><span>Profit Margin</span><span className="stat-icon">%</span></div><h2>{dataset.metrics.profit_margin.toFixed(2)}%</h2><small>Profit divided by sales</small></div>
      <div className="stat-card"><div className="stat-top"><span>Units Sold</span><span className="stat-icon">▤</span></div><h2>{dataset.metrics.total_quantity.toLocaleString('en-IN')}</h2><small>Uploaded dataset</small></div>
    </div>
    <div className="bottom-grid">
      <div className="info-card"><h3>Key findings</h3>
        <div className="insight"><span className="insight-icon">✧</span><div><strong>Highest sales month</strong><p>{highestMonth ? `${highestMonth.Month}: ${formatINR(highestMonth.Sales)}` : 'No monthly sales data could be derived from the dates.'}</p></div></div>
        <div className="insight"><span className="insight-icon purple">↗</span><div><strong>Average sales per recorded month</strong><p>{monthly.length ? formatINR(averageSales) : 'Unavailable without valid monthly data.'}</p></div></div>
        <div className="insight"><span className="insight-icon">▦</span><div><strong>Product variety</strong><p>{dataset.metrics.unique_products.toLocaleString('en-IN')} unique products found in the uploaded dataset.</p></div></div>
      </div>
      <div className="chart-card"><div className="chart-heading"><div><h3>Monthly sales</h3><p className="subtext">Actual sales grouped by month in the uploaded data</p></div></div>
        {monthly.length ? <div className="bar-chart">{monthly.map((item) => { const max = Math.max(...monthly.map(x => x.Sales), 1); return <div className="bar-column" key={item.Month}><div className="bar" style={{height:`${Math.max(4,item.Sales/max*100)}%`}} title={`${item.Month}: ${formatINR(item.Sales)}`} /><small>{item.Month}</small></div> })}</div> : <p className="subtext">No valid monthly sales data is available.</p>}
      </div>
    </div>
  </div>
}

function ScenarioPage({ dataset }: { dataset: UploadResult | null }) {
  const [salesChange, setSalesChange] = useState('10')
  const [costChange, setCostChange] = useState('0')
  if (!dataset) return <div className="placeholder"><div className="placeholder-icon">◈</div><h2>Scenario Analysis</h2><p>Upload a dataset first to explore business scenarios.</p></div>
  const salesRate = Number(salesChange) || 0
  const costRate = Number(costChange) || 0
  const projectedSales = dataset.metrics.total_sales * (1 + salesRate / 100)
  const baseCost = dataset.metrics.total_sales - dataset.metrics.total_profit
  const projectedCost = baseCost * (1 + costRate / 100)
  const projectedProfit = projectedSales - projectedCost
  return <div className="page-module"><div className="welcome"><div><p className="eyebrow">WHAT-IF MODELLING</p><h1>Scenario Analysis</h1><p className="subtext">Adjust assumptions to explore illustrative outcomes from your uploaded totals.</p></div></div>
    <div className="bottom-grid"><div className="info-card"><h3>Scenario assumptions</h3>
      <label>Sales change (%)<input type="number" value={salesChange} onChange={e=>setSalesChange(e.target.value)} /></label>
      <label>Cost change (%)<input type="number" value={costChange} onChange={e=>setCostChange(e.target.value)} /></label>
      <p className="subtext">These are user-defined assumptions, not predictions generated by the ML model.</p>
    </div><div className="info-card"><h3>Estimated scenario result</h3>
      <p>Total sales baseline: <strong>{formatINR(dataset.metrics.total_sales)}</strong></p><p>Scenario sales: <strong>{formatINR(projectedSales)}</strong></p><p>Estimated costs: <strong>{formatINR(projectedCost)}</strong></p><p>Estimated profit: <strong>{formatINR(projectedProfit)}</strong></p>
      <p>Profit change: <strong>{formatINR(projectedProfit-dataset.metrics.total_profit)}</strong></p>
    </div></div></div>
}

function ReportsPage({ dataset }: { dataset: UploadResult | null }) {
  if (!dataset) return <div className="placeholder"><div className="placeholder-icon">▤</div><h2>Reports</h2><p>Upload a dataset first to prepare a report.</p></div>

  const generatedOn = new Date().toLocaleString('en-IN')
  const monthlyRows = dataset.monthly_sales || []
  const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char] as string)

  const buildReportHtml = () => {
    const monthlyTable = monthlyRows.length
      ? monthlyRows.map(row => `<tr><td>${escapeHtml(row.Month)}</td><td class="number">${escapeHtml(formatINR(row.Sales))}</td></tr>`).join('')
      : '<tr><td colspan="2">No monthly sales data available.</td></tr>'
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BizPredict AI - Business Report</title><style>
      *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172033;margin:0;background:#f3f5f9;padding:32px}.report{max-width:900px;margin:auto;background:#fff;padding:40px;border-radius:14px;box-shadow:0 8px 30px #17203312}.brand{color:#5551c9;font-weight:700;letter-spacing:2px;font-size:12px}.title{font-size:30px;margin:8px 0}.muted{color:#667085;font-size:13px}.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin:26px 0}.stat{border:1px solid #e4e7ec;border-radius:10px;padding:16px}.label{font-size:12px;color:#667085}.value{font-size:22px;font-weight:700;margin-top:8px}.section{margin-top:30px}h2{font-size:18px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{text-align:left;padding:11px;border-bottom:1px solid #eaecf0;font-size:13px}th{background:#f8f9fc}.number{text-align:right}.footer{border-top:1px solid #eaecf0;margin-top:32px;padding-top:14px;color:#667085;font-size:11px}@media print{body{background:white;padding:0}.report{box-shadow:none;border-radius:0;padding:20px}.no-print{display:none}}@media(min-width:700px){.stats{grid-template-columns:repeat(3,1fr)}}
      </style></head><body><main class="report"><div class="brand">BIZPREDICT AI</div><h1 class="title">Business Performance Report</h1><p class="muted">Generated: ${escapeHtml(generatedOn)}<br>Source file: ${escapeHtml(dataset.filename)}<br>Records analyzed: ${escapeHtml(dataset.rows.toLocaleString('en-IN'))}</p><div class="stats">
      <div class="stat"><div class="label">Total Sales</div><div class="value">${escapeHtml(formatINR(dataset.metrics.total_sales))}</div></div>
      <div class="stat"><div class="label">Total Profit</div><div class="value">${escapeHtml(formatINR(dataset.metrics.total_profit))}</div></div>
      <div class="stat"><div class="label">Total Quantity</div><div class="value">${escapeHtml(dataset.metrics.total_quantity.toLocaleString('en-IN'))}</div></div>
      <div class="stat"><div class="label">Unique Products</div><div class="value">${escapeHtml(dataset.metrics.unique_products)}</div></div>
      <div class="stat"><div class="label">Profit Margin</div><div class="value">${escapeHtml(dataset.metrics.profit_margin.toFixed(2))}%</div></div>
      <div class="stat"><div class="label">Monthly Periods</div><div class="value">${escapeHtml(monthlyRows.length)}</div></div>
      </div><section class="section"><h2>Monthly Sales</h2><table><thead><tr><th>Month</th><th class="number">Sales</th></tr></thead><tbody>${monthlyTable}</tbody></table></section><p class="footer">Generated by BizPredict AI. Forecast values are prototype estimates and should be validated before business decisions.</p><button class="no-print" onclick="window.print()">Print / Save as PDF</button></main></body></html>`
  }

  const downloadHtmlReport = () => {
    const blob = new Blob([buildReportHtml()], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `BizPredict_Report_${new Date().toISOString().slice(0, 10)}.html`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const printReport = () => {
    const reportWindow = window.open('', '_blank')
    if (!reportWindow) {
      window.print()
      return
    }
    reportWindow.document.open()
    reportWindow.document.write(buildReportHtml())
    reportWindow.document.close()
    reportWindow.focus()
    reportWindow.print()
  }

  return <div className="page-module">
    <div className="welcome"><div><p className="eyebrow">BUSINESS SUMMARY</p><h1>Reports</h1><p className="subtext">Preview your report below, download an HTML copy, or print it and choose Save as PDF.</p></div><div className="upload-actions"><button className="secondary-button" onClick={downloadHtmlReport}>Download Report</button><button className="primary-button" onClick={printReport}>Print / Save PDF</button></div></div>
    <div className="info-card" id="bizpredict-report-preview"><p className="eyebrow">BIZPREDICT AI</p><h2>Business Performance Report</h2><p className="subtext">Generated: {generatedOn}</p><p>Source file: <strong>{dataset.filename}</strong></p><p>Records analyzed: <strong>{dataset.rows.toLocaleString('en-IN')}</strong></p>
      <div className="stats-grid"><div className="stat-card"><div className="stat-top"><span>Total Sales</span><span className="stat-icon">₹</span></div><h2>{formatINR(dataset.metrics.total_sales)}</h2></div><div className="stat-card"><div className="stat-top"><span>Total Profit</span><span className="stat-icon">↗</span></div><h2>{formatINR(dataset.metrics.total_profit)}</h2></div><div className="stat-card"><div className="stat-top"><span>Total Quantity</span><span className="stat-icon">▤</span></div><h2>{dataset.metrics.total_quantity.toLocaleString('en-IN')}</h2></div><div className="stat-card"><div className="stat-top"><span>Unique Products</span><span className="stat-icon">▣</span></div><h2>{dataset.metrics.unique_products}</h2></div><div className="stat-card"><div className="stat-top"><span>Profit Margin</span><span className="stat-icon">%</span></div><h2>{dataset.metrics.profit_margin.toFixed(2)}%</h2></div></div>
      <h3>Monthly sales</h3>{monthlyRows.length ? <table><thead><tr><th>Month</th><th>Sales</th></tr></thead><tbody>{monthlyRows.map(row=><tr key={row.Month}><td>{row.Month}</td><td>{formatINR(row.Sales)}</td></tr>)}</tbody></table> : <p>No monthly sales available.</p>}
      <p className="subtext">This report summarizes the uploaded dataset. Forecasts are prototype estimates and should be validated before business decisions.</p>
    </div>
  </div>
}

type ProductAnalysisRow = {
  sales_rank: number
  Product: string
  Category: string
  total_sales: number
  total_profit: number
  total_quantity: number
  transactions: number
  profit_margin: number
}

type ProductAnalysisResponse = {
  success: boolean
  total_products: number
  top_product: ProductAnalysisRow | null
  products: ProductAnalysisRow[]
}

function ProductsPage({ dataset }: { dataset: UploadResult | null }) {
  const [analysis, setAnalysis] = useState<ProductAnalysisResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!dataset) {
      setAnalysis(null)
      setError('')
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    fetch('http://127.0.0.1:8000/products/analysis')
      .then(async response => {
        const body = await response.json()
        if (!response.ok) {
          const detail = typeof body.detail === 'string' ? body.detail : 'Could not load product analysis.'
          throw new Error(detail)
        }
        return body as ProductAnalysisResponse
      })
      .then(data => { if (!cancelled) setAnalysis(data) })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load product analysis.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [dataset])

  if (!dataset) return <div className="placeholder"><div className="placeholder-icon">▣</div><h2>Product Analysis</h2><p>Upload a dataset first to inspect product performance.</p></div>
  const products = analysis?.products ?? []
  return <div className="page-module">
    <div className="welcome"><div><p className="eyebrow">PRODUCT PERFORMANCE</p><h1>Product Analysis</h1><p className="subtext">Full product-wise analysis from {dataset.filename} ({dataset.rows.toLocaleString('en-IN')} uploaded rows).</p></div><button className="secondary-button" onClick={() => { setAnalysis(null); setError(''); setLoading(true); fetch('http://127.0.0.1:8000/products/analysis').then(async response => { const body = await response.json(); if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Could not refresh product analysis.'); return body as ProductAnalysisResponse }).then(setAnalysis).catch(err => setError(err instanceof Error ? err.message : 'Could not refresh product analysis.')).finally(() => setLoading(false)) }}>Refresh</button></div>
    <div className="stats-grid">
      <div className="stat-card"><div className="stat-top"><span>Unique products</span><span className="stat-icon">▦</span></div><h2>{analysis?.total_products ?? dataset.metrics.unique_products}</h2></div>
      <div className="stat-card"><div className="stat-top"><span>Total quantity</span><span className="stat-icon">▤</span></div><h2>{dataset.metrics.total_quantity.toLocaleString('en-IN')}</h2></div>
      <div className="stat-card"><div className="stat-top"><span>Total sales</span><span className="stat-icon">₹</span></div><h2>{formatINR(dataset.metrics.total_sales)}</h2></div>
      <div className="stat-card"><div className="stat-top"><span>Total profit</span><span className="stat-icon">↗</span></div><h2>{formatINR(dataset.metrics.total_profit)}</h2></div>
    </div>
    {loading && <div className="info-card"><p>Loading product analysis from the full dataset…</p></div>}
    {error && <div className="info-card" role="alert"><h3>Could not load product analysis</h3><p>{error}</p><p className="subtext">Upload the dataset again if the backend was restarted, then return to this page.</p></div>}
    {!loading && !error && analysis && <>
      {analysis.top_product && <div className="info-card"><p className="eyebrow">TOP PRODUCT BY SALES</p><h2>{analysis.top_product.Product}</h2><p>{analysis.top_product.Category} · {formatINR(analysis.top_product.total_sales)} sales · {formatINR(analysis.top_product.total_profit)} profit</p></div>}
      <div className="info-card"><h3>Product performance ranking</h3><p className="subtext">Products ranked by total sales across all valid uploaded records.</p><div style={{overflowX:'auto'}}><table><thead><tr><th>Rank</th><th>Product</th><th>Category</th><th>Quantity</th><th>Transactions</th><th>Sales</th><th>Profit</th><th>Margin</th></tr></thead><tbody>{products.map(row=><tr key={`${row.Product}-${row.Category}`}><td>#{row.sales_rank}</td><td>{row.Product}</td><td>{row.Category}</td><td>{row.total_quantity.toLocaleString('en-IN')}</td><td>{row.transactions.toLocaleString('en-IN')}</td><td>{formatINR(row.total_sales)}</td><td>{formatINR(row.total_profit)}</td><td>{row.profit_margin.toFixed(2)}%</td></tr>)}</tbody></table></div>{products.length===0 && <p>No valid product records were found.</p>}</div>
    </>}
    {!loading && !error && !analysis && <div className="info-card"><p>Product analysis is not available yet. Confirm the backend is running and upload the dataset again.</p></div>}
  </div>
}


type UserProfile = { name: string; email: string; role: string; company: string }

function ProfilePage({ profile, onSave }: { profile: UserProfile; onSave: (next: UserProfile) => Promise<void> }) {
  const [form, setForm] = useState<UserProfile>(profile)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setForm(profile)
  }, [profile])

  const update = (key: keyof UserProfile, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
    setSaved(false)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      await onSave(form)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-section">
      <div className="welcome">
        <div>
          <p className="eyebrow">ACCOUNT SETTINGS</p>
          <h1>My Profile</h1>
          <p className="subtext">Manage your personal and business details.</p>
        </div>
      </div>
      <div className="info-card" style={{ maxWidth: 760 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div className="avatar" style={{ width: 64, height: 64, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 24 }}>
            {(form.name.trim()[0] || 'U').toUpperCase()}
          </div>
          <div>
            <h2 style={{ margin: 0 }}>{form.name || 'Your name'}</h2>
            <p className="subtext" style={{ margin: '4px 0 0' }}>{form.role || 'Your role'}</p>
          </div>
        </div>
        <form onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
          <label style={{ display: 'grid', gap: 6 }}>Full name
            <input required value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Enter your name" />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>Email address
            <input required type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="name@example.com" />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>Role
            <input value={form.role} onChange={(e) => update('role', e.target.value)} placeholder="e.g. Business Analyst" />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>Company / Organization
            <input value={form.company} onChange={(e) => update('company', e.target.value)} placeholder="Optional" />
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
            {saved && <span role="status" style={{ color: '#15803d', fontWeight: 600 }}>Profile saved successfully to your account.</span>}
            {error && <span role="alert" style={{ color: '#b91c1c', fontWeight: 600 }}>{error}</span>}
          </div>
        </form>
        <p className="subtext" style={{ marginTop: 18 }}>Your profile is saved to your BizPredict account.</p>
      </div>
    </div>
  )
}


type AuthUser = { id: number; name: string; email: string; role: string; company: string; created_at?: string }
type AuthResponse = { access_token: string; token_type: string; user: AuthUser }
const API_ROOT = 'http://127.0.0.1:8000'

function AuthPage({
  onAuthenticated,
}: {
  onAuthenticated: (response: AuthResponse) => void
}) {
  const [mode, setMode] = useState<"login" | "register">("login")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError("")
    setBusy(true)

    try {
      const response = await fetch(`${API_ROOT}/auth/${mode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          mode === "register"
            ? { name, email, password }
            : { email, password }
        ),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(
          typeof payload.detail === "string"
            ? payload.detail
            : "Unable to authenticate."
        )
      }

      onAuthenticated(payload as AuthResponse)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not connect to the backend."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">

      {/* LEFT SIDE */}
      <section className="auth-visual">

        <div className="auth-logo">
          <span className="auth-logo-mark">▥</span>
          <span>
            BizPredict <b>AI</b>
          </span>
        </div>

        <div className="auth-tagline">
          <div className="eyebrow">
            BUSINESS • ANALYTICS • FORECASTING
          </div>

          <h2>
            Turn your business data into
            <span>smarter decisions.</span>
          </h2>

          <p>
            AI-powered analytics and forecasting to help businesses
            understand performance, predict sales and make better decisions.
          </p>
        </div>

        <div className="auth-features">

          <div className="auth-feature">
            <div className="auth-feature-icon">📈</div>
            <div>
              <strong>AI Sales Forecasting</strong>
              <span>Predict future sales from your business data</span>
            </div>
          </div>

          <div className="auth-feature">
            <div className="auth-feature-icon">◔</div>
            <div>
              <strong>Business Analytics</strong>
              <span>Understand performance through meaningful insights</span>
            </div>
          </div>

          <div className="auth-feature">
            <div className="auth-feature-icon">💡</div>
            <div>
              <strong>Scenario Planning</strong>
              <span>Explore possibilities before making decisions</span>
            </div>
          </div>

        </div>

        <div className="auth-chart">
          <div className="auth-chart-title">
            SALES FORECAST
          </div>

          <div className="auth-chart-value">
            +32.5% growth prediction
          </div>

          <div className="auth-chart-line"></div>
        </div>

      </section>

      {/* RIGHT SIDE */}
      <section className="auth-form-panel">

        <form className="auth-card" onSubmit={submit}>

          <div className="auth-mobile-logo">
            <span>▥</span>
            BizPredict <span>AI</span>
          </div>

          <h1>
            {mode === "login"
              ? "Welcome back"
              : "Create your account"}
          </h1>

          <p>
            {mode === "login"
              ? "Sign in to access your business analytics workspace."
              : "Create your BizPredict AI workspace and start analyzing your business data."}
          </p>

          {mode === "register" && (
            <div className="auth-field">
              <label>Full name</label>

              <input
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>
          )}

          <div className="auth-field">
            <label>Email address</label>

            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>

          <div className="auth-field">
            <label>Password</label>

            <div className="auth-password">
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={mode === "register" ? 8 : 1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  mode === "register"
                    ? "At least 8 characters"
                    : "Your password"
                }
              />

              <button
                type="button"
                className="auth-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={
                  showPassword
                    ? "Hide password"
                    : "Show password"
                }
              >
                {showPassword ? "◉" : "◌"}
              </button>
            </div>
          </div>

          {mode === "login" && (
            <div className="auth-options">
              <label className="auth-remember">
                <input type="checkbox" />
                Remember me
              </label>

              <span className="auth-security">
                Secure login
              </span>
            </div>
          )}

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button
            className="primary-button"
            type="submit"
            disabled={busy}
          >
            {busy
              ? "Please wait..."
              : mode === "login"
              ? "Login →"
              : "Create account →"}
          </button>

          <p className="auth-switch">
            {mode === "login"
              ? "Don't have an account?"
              : "Already have an account?"}{" "}

            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login")
                setError("")
                setShowPassword(false)
              }}
            >
              {mode === "login" ? "Register" : "Login"}
            </button>
          </p>

        </form>

      </section>

    </div>
  )
}
function App() {

  const [authToken, setAuthToken] = useState<string>(() => localStorage.getItem('bizpredict-token') || '')
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => { try { const raw = localStorage.getItem('bizpredict-user'); return raw ? JSON.parse(raw) as AuthUser : null } catch { return null } })
  const onAuthenticated = (response: AuthResponse) => { setAuthToken(response.access_token); setAuthUser(response.user); localStorage.setItem('bizpredict-token', response.access_token); localStorage.setItem('bizpredict-user', JSON.stringify(response.user)) }
  const [activePage, setActivePage] = useState('Dashboard')

  const [dataset, setDataset] = useState<UploadResult | null>(null)

  const [profile, setProfile] = useState<UserProfile>(() => {
    const fallback: UserProfile = { name: '', email: '', role: 'User', company: '' }
    try {
      const stored = localStorage.getItem('bizpredict-user')
      return stored ? { ...fallback, ...JSON.parse(stored) } : fallback
    } catch { return fallback }
  })

  const saveProfile = async (next: UserProfile): Promise<void> => {
    if (!authToken) throw new Error('Please log in again to update your profile.')
    const response = await fetch(`${API_ROOT}/auth/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ name: next.name.trim(), email: next.email.trim(), role: next.role.trim() || 'User', company: next.company.trim() })
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : 'Profile update failed.')
    const user = (payload.user || payload) as AuthUser
    setAuthUser(user)
    setProfile({ name: user.name, email: user.email, role: user.role || 'User', company: user.company || '' })
    localStorage.setItem('bizpredict-user', JSON.stringify(user))
  }

  useEffect(() => {
    if (!authToken) return
    let cancelled = false
    fetch(`${API_ROOT}/auth/me`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then(async response => { if (!response.ok) throw new Error('Session expired'); return response.json() })
      .then((payload: { user?: AuthUser } & Partial<AuthUser>) => { const user = (payload.user || payload) as AuthUser; if (!cancelled) { setAuthUser(user); setProfile({ name: user.name, email: user.email, role: user.role || 'User', company: user.company || '' }); localStorage.setItem('bizpredict-user', JSON.stringify(user)) } })
      .catch(() => { if (!cancelled) { setAuthToken(''); setAuthUser(null); localStorage.removeItem('bizpredict-token'); localStorage.removeItem('bizpredict-user') } })
    return () => { cancelled = true }
  }, [authToken])

  const logout = async () => {
    try { if (authToken) await fetch(`${API_ROOT}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } }) } catch { /* local logout must still complete */ }
    localStorage.removeItem('bizpredict-token'); localStorage.removeItem('bizpredict-user'); setAuthToken(''); setAuthUser(null); setDataset(null); setActivePage('Dashboard')
  }

  if (!authToken || !authUser) return <AuthPage onAuthenticated={onAuthenticated} />



  const metrics = dataset?.metrics



  const stats = metrics

    ? [

        {

          label: 'Total Sales',

          value: formatINR(metrics.total_sales),

          change: 'Uploaded dataset',

          icon: '₹',

        },

        {

          label: 'Total Profit',

          value: formatINR(metrics.total_profit),

          change: 'Uploaded dataset',

          icon: '↗',

        },

        {

          label: 'Total Quantity',

          value: metrics.total_quantity.toLocaleString('en-IN'),

          change: 'Units sold',

          icon: '▤',

        },

        {

          label: 'Unique Products',

          value: metrics.unique_products.toLocaleString('en-IN'),

          change: 'Products',

          icon: '▦',

        },

      ]

    : [

        { label: 'Total Sales', value: '₹12.4L', change: '+15.2%', icon: '₹' },

        { label: 'Total Orders', value: '3,250', change: '+8.4%', icon: '▤' },

        { label: 'Products', value: '25', change: '+2 new', icon: '▦' },

        { label: 'Profit Margin', value: '18.5%', change: '+3.2%', icon: '%' },

      ]



  const monthlyData = dataset?.monthly_sales.map((item) => {

    const [year, month] = item.Month.split('-')

    const monthLabel = months[Number(month) - 1] || item.Month



    return {

      label: `${monthLabel} ${year}`,

      sales: item.Sales,

    }

  }) ?? []



  const maxMonthlySales = Math.max(

    ...monthlyData.map((item) => item.sales),

    1

  )



  return (

    <div className="app">

      <aside className="sidebar">

        <div className="brand">

          <span>▥</span> BizPredict <b>AI</b>

        </div>



        <p className="nav-label">WORKSPACE</p>



        {pages.map((page, index) => (

          <button

            key={page}

            className={`nav-item ${activePage === page ? 'active' : ''}`}

            onClick={() => setActivePage(page)}

          >

            <span>{icons[index]}</span>

            {page}

          </button>

        ))}



        <div className="sidebar-bottom">

          <div className="avatar">{(profile.name.trim()[0] || 'U').toUpperCase()}</div>

          <div>

            <strong>{profile.name}</strong>

            <small>{profile.role || 'Business Analyst'}</small>

          </div>

        </div>

      </aside>



      <main className="main">

        <header className="topbar">

          <div>

            <span className="breadcrumb">Workspace / </span>

            <strong>{activePage}</strong>

          </div>



          <div className="top-actions">

            <span className="status">

              ● {dataset ? 'Live dataset' : 'Demo data'}

            </span>

            <span className="auth-user-name">{authUser.name}</span>
            <button className="logout-button" onClick={logout} title="Logout">Logout ↗</button>

            <button

              className="profile-button"

              onClick={() => setActivePage('Profile')}

              title="Profile"

            >

              L

            </button>

          </div>

        </header>



        <section className="content">

          {activePage === 'Upload Data' ? (
            <UploadPage onDataLoaded={setDataset} />
          ) : activePage === 'Forecast' ? (
            <ForecastPage dataset={dataset} />
          ) : activePage === 'Insights' ? (
            <InsightsPage dataset={dataset} />
          ) : activePage === 'Scenario Analysis' ? (
            <ScenarioPage dataset={dataset} />
          ) : activePage === 'Reports' ? (
            <ReportsPage dataset={dataset} />
          ) : activePage === 'Products' ? (
            <ProductsPage dataset={dataset} />
          ) : activePage === 'Dashboard' ? (

            <>

              <div className="welcome">

                <div>

                  <p className="eyebrow">BUSINESS OVERVIEW</p>

                  <h1>Dashboard</h1>

                  <p className="subtext">

                    Welcome back, Likith. Here's your business performance.

                  </p>

                  {dataset && (

                    <p className="subtext">

                      Current dataset: {dataset.filename} · {dataset.rows} rows

                    </p>

                  )}

                </div>



                <button

                  className="period"

                  onClick={() => setActivePage('Upload Data')}

                >

                  {dataset ? 'Upload New Data ↑' : 'Upload Data ↑'}

                </button>

              </div>



              <div className="stats-grid">

                {stats.map((stat) => (

                  <div className="stat-card" key={stat.label}>

                    <div className="stat-top">

                      <span>{stat.label}</span>

                      <span className="stat-icon">{stat.icon}</span>

                    </div>

                    <h2>{stat.value}</h2>

                    <small>

                      <b>{stat.change}</b>

                    </small>

                  </div>

                ))}

              </div>



              {dataset && (

                <div className="info-card" style={{ marginBottom: 24 }}>

                  <h3>Dataset Summary</h3>

                  <p>

                    Profit margin:{' '}

                    <strong>

                      {metrics?.profit_margin.toFixed(2)}%

                    </strong>

                  </p>

                  <p>

                    Validated records:{' '}

                    <strong>{dataset.rows.toLocaleString('en-IN')}</strong>

                  </p>

                  <p>

                    Source file: <strong>{dataset.filename}</strong>

                  </p>

                </div>

              )}



              <div className="chart-card">

                <div className="chart-heading">

                  <div>

                    <h3>Sales Performance</h3>

                    <p className="subtext">

                      {dataset

                        ? 'Monthly sales from your uploaded dataset'

                        : 'Monthly business sales overview (demo)'}

                    </p>

                  </div>

                  <span className="legend"><i /> Actual sales</span>

                </div>



                {dataset ? (

                  monthlyData.length > 0 ? (

                    <div className="bar-chart">

                      {monthlyData.map((item) => (

                        <div className="bar-column" key={item.label}>

                          <div

                            className="bar"

                            style={{

                              height: `${Math.max(

                                4,

                                (item.sales / maxMonthlySales) * 100

                              )}%`,

                            }}

                            title={`${item.label}: ${formatINR(item.sales)}`}

                          />

                          <small>{item.label}</small>

                        </div>

                      ))}

                    </div>

                  ) : (

                    <p className="subtext">

                      No valid dates were found to display monthly sales.

                      Check that the Date column contains valid dates.

                    </p>

                  )

                ) : (

                  <div className="bar-chart">

                    {demoChartData.map((height, index) => (

                      <div className="bar-column" key={months[index]}>

                        <div

                          className="bar"

                          style={{ height: `${height}%` }}

                          title={`${months[index]}: demo sales`}

                        />

                        <small>{months[index]}</small>

                      </div>

                    ))}

                  </div>

                )}

              </div>



              <div className="bottom-grid">

                <div className="info-card">

                  <h3>Business Insights</h3>

                  <div className="insight">

                    <span className="insight-icon">↗</span>

                    <div>

                      <strong>

                        {dataset ? 'Dataset analyzed' : 'Sales are growing'}

                      </strong>

                      <p>

                        {dataset

                          ? `Your uploaded data contains ${dataset.rows} records for analysis.`

                          : 'Sales performance is trending upward in this demo.'}

                      </p>

                    </div>

                  </div>

                  <div className="insight">

                    <span className="insight-icon purple">✧</span>

                    <div>

                      <strong>Forecast opportunity</strong>

                      <p>

                        Use the Forecast page to estimate future sales.

                      </p>

                    </div>

                  </div>

                </div>



                <div className="info-card">

                  <h3>Quick Actions</h3>

                  {[

                    'Upload Data',

                    'Forecast',

                    'Scenario Analysis',

                    'Reports',

                  ].map((page) => (

                    <button

                      className="quick-action"

                      key={page}

                      onClick={() => setActivePage(page)}

                    >

                      {page}

                      <span>→</span>

                    </button>

                  ))}

                </div>

              </div>

            </>

          ) : activePage === 'Profile' ? (

            <ProfilePage profile={profile} onSave={saveProfile} />

          ) : (

            <div className="placeholder">

              <div className="placeholder-icon">✧</div>

              <h2>{activePage}</h2>

              <p>

                This module will be implemented in the next development step.

              </p>

              <button

                className="primary-button"

                onClick={() => setActivePage('Dashboard')}

              >

                Back to Dashboard

              </button>

            </div>

          )}

        </section>

      </main>

    </div>

  )

}



export default App