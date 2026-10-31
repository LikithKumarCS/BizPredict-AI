
from pathlib import Path
import pandas as pd
import joblib

from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sklearn.model_selection import train_test_split

# Dataset location
BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
MODEL_DIR = BASE_DIR / "ml_models"
MODEL_DIR.mkdir(exist_ok=True)

# Find an uploaded dataset
files = [
    f for f in UPLOAD_DIR.iterdir()
    if f.suffix.lower() in [".csv", ".xlsx", ".xls"]
]

if not files:
    raise FileNotFoundError(
        "No dataset found. Upload a CSV or Excel file first."
    )

dataset_path = max(files, key=lambda f: f.stat().st_mtime)

# Read dataset
if dataset_path.suffix.lower() == ".csv":
    df = pd.read_csv(dataset_path)
else:
    df = pd.read_excel(dataset_path)

df.columns = df.columns.astype(str).str.strip()

required = [
    "Date", "Product", "Category",
    "Quantity", "Sales", "Profit"
]

missing = [col for col in required if col not in df.columns]
if missing:
    raise ValueError(f"Missing columns: {missing}")

# Prepare features
df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
df["Year"] = df["Date"].dt.year
df["Month"] = df["Date"].dt.month
df["Day"] = df["Date"].dt.day

df["Sales"] = pd.to_numeric(df["Sales"], errors="coerce")
df["Quantity"] = pd.to_numeric(df["Quantity"], errors="coerce")
df["Profit"] = pd.to_numeric(df["Profit"], errors="coerce")

df = df.dropna(subset=["Sales"])

features = [
    "Product", "Category", "Quantity",
    "Profit", "Year", "Month", "Day"
]
X = df[features]
y = df["Sales"]

if len(df) < 2:
    raise ValueError("At least 2 valid data rows are required.")

categorical = ["Product", "Category"]
numerical = ["Quantity", "Profit", "Year", "Month", "Day"]

preprocessor = ColumnTransformer([
    ("categorical", Pipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("encoder", OneHotEncoder(handle_unknown="ignore"))
    ]), categorical),
    ("numerical", Pipeline([
        ("imputer", SimpleImputer(strategy="median"))
    ]), numerical)
])

model = Pipeline([
    ("preprocessor", preprocessor),
    ("regressor", RandomForestRegressor(
        n_estimators=100,
        random_state=42
    ))
])

# Train using the available dataset
model.fit(X, y)

# Save trained model
model_path = MODEL_DIR / "sales_model.pkl"
joblib.dump(model, model_path)

print("Model trained successfully!")
print(f"Dataset: {dataset_path.name}")
print(f"Rows used: {len(df)}")
print(f"Saved model: {model_path}")
