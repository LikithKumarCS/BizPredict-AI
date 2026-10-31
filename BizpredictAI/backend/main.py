from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from pathlib import Path
from io import BytesIO
from typing import Optional
from datetime import datetime, timedelta, timezone
import pandas as pd
import joblib
import json
import sqlite3
import hashlib
import hmac
import base64
import secrets
import os
import re

# ==================================================
# 1. FASTAPI APPLICATION AND CONFIGURATION
# ==================================================

app = FastAPI(
    title="BizPredict AI API",
    description="AI-powered Business Sales Analytics and Prediction API",
    version="1.3.0",
)

allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

frontend_origin = os.getenv("FRONTEND_ORIGIN")

if frontend_origin:
    allowed_origins.append(frontend_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MODEL_PATH = BASE_DIR / "ml_models" / "sales_model.pkl"
DATABASE_PATH = BASE_DIR / "bizpredict_users.db"
MAX_FILE_SIZE = 10 * 1024 * 1024
REQUIRED_COLUMNS = ["Date", "Product", "Category", "Quantity", "Sales", "Profit"]
TOKEN_TTL_HOURS = 12
# Set BIZPREDICT_SECRET_KEY to a long random value before deployment.
SECRET_KEY = os.getenv("BIZPREDICT_SECRET_KEY", "local-development-only-change-this-secret")
security = HTTPBearer(auto_error=False)

current_dataset_path: Optional[Path] = next(
    (p for p in [UPLOAD_DIR / "dataset.csv", UPLOAD_DIR / "dataset.xlsx", UPLOAD_DIR / "dataset.xls"] if p.exists()),
    None,
)

# ==================================================
# 2. DATABASE
# ==================================================

def get_db():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
    finally:
        connection.close()


def init_db():
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'User',
                company TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            )
        """)
        # Migrate existing local databases without deleting registered accounts.
        user_columns = {row[1] for row in connection.execute("PRAGMA table_info(users)").fetchall()}
        if "company" not in user_columns:
            connection.execute("ALTER TABLE users ADD COLUMN company TEXT NOT NULL DEFAULT ''")
        connection.execute("""
            CREATE TABLE IF NOT EXISTS revoked_tokens (
                jti TEXT PRIMARY KEY,
                expires_at INTEGER NOT NULL
            )
        """)
        connection.commit()


@app.on_event("startup")
def startup_event():
    init_db()

# ==================================================
# 3. LOAD TRAINED ML MODEL
# ==================================================

if not MODEL_PATH.exists():
    raise FileNotFoundError(
        f"Trained model not found at: {MODEL_PATH}. Please run train_model.py first."
    )

try:
    model = joblib.load(MODEL_PATH)
    print("BizPredict AI model loaded successfully!")
except Exception as exc:
    raise RuntimeError(
        f"Failed to load trained model: {exc}. Check your model file and scikit-learn version."
    ) from exc

# ==================================================
# 4. AUTHENTICATION HELPERS (PBKDF2 + SIGNED JWT)
# ==================================================

def b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310_000)
    return f"pbkdf2_sha256$310000${b64url_encode(salt)}${b64url_encode(digest)}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations, salt_text, digest_text = stored_hash.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        salt = b64url_decode(salt_text)
        expected = b64url_decode(digest_text)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: int) -> tuple[str, str, int]:
    now = int(datetime.now(timezone.utc).timestamp())
    expires = now + TOKEN_TTL_HOURS * 3600
    jti = secrets.token_urlsafe(18)
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {"sub": str(user_id), "iat": now, "exp": expires, "jti": jti}
    header_part = b64url_encode(json.dumps(header, separators=(",", ":")).encode())
    payload_part = b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{header_part}.{payload_part}".encode("ascii")
    signature = hmac.new(SECRET_KEY.encode(), signing_input, hashlib.sha256).digest()
    return f"{header_part}.{payload_part}.{b64url_encode(signature)}", jti, expires


def decode_access_token(token: str) -> dict:
    try:
        header_part, payload_part, signature_part = token.split(".")
        signing_input = f"{header_part}.{payload_part}".encode("ascii")
        expected = hmac.new(SECRET_KEY.encode(), signing_input, hashlib.sha256).digest()
        if not hmac.compare_digest(expected, b64url_decode(signature_part)):
            raise ValueError("Invalid token signature")
        header = json.loads(b64url_decode(header_part))
        payload = json.loads(b64url_decode(payload_part))
        if header.get("alg") != "HS256" or int(payload.get("exp", 0)) <= int(datetime.now(timezone.utc).timestamp()):
            raise ValueError("Expired or invalid token")
        if not payload.get("sub") or not payload.get("jti"):
            raise ValueError("Invalid token claims")
        return payload
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired authentication token") from exc


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: sqlite3.Connection = Depends(get_db),
):
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Please log in to continue")
    claims = decode_access_token(credentials.credentials)
    revoked = db.execute("SELECT 1 FROM revoked_tokens WHERE jti = ?", (claims["jti"],)).fetchone()
    if revoked:
        raise HTTPException(status_code=401, detail="Session has ended. Please log in again.")
    user = db.execute(
        "SELECT id, name, email, role, company, created_at FROM users WHERE id = ?",
        (int(claims["sub"]),),
    ).fetchone()
    if user is None:
        raise HTTPException(status_code=401, detail="User account not found")
    return user, claims

# ==================================================
# 5. REQUEST SCHEMAS
# ==================================================

class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=8, max_length=128)

    @classmethod
    def validate_email_format(cls, value: str) -> str:
        return value


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class ProfileUpdateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=254)
    role: str = Field(default="User", min_length=1, max_length=100)
    company: str = Field(default="", max_length=200)


class PredictionRequest(BaseModel):
    Month: int = Field(ge=1, le=12)
    Product: str = Field(min_length=1)
    Category: str = Field(min_length=1)
    Year: int = Field(ge=2000, le=2100)
    Day: int = Field(ge=1, le=31)
    Quantity: float = Field(ge=0)
    Profit: float


def normalize_email(email: str) -> str:
    value = email.strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
        raise HTTPException(status_code=422, detail="Enter a valid email address")
    return value


def user_to_dict(user: sqlite3.Row) -> dict:
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "company": user["company"] if "company" in user.keys() else "",
        "created_at": user["created_at"],
    }

# ==================================================
# 6. HOME AND AUTH ROUTES
# ==================================================

@app.get("/")
def home():
    return {"message": "BizPredict AI backend is running", "model_loaded": True, "version": "1.1.0"}


@app.post("/auth/register", status_code=201)
def register(data: RegisterRequest, db: sqlite3.Connection = Depends(get_db)):
    name = data.name.strip()
    email = normalize_email(data.email)
    if len(name) < 2:
        raise HTTPException(status_code=422, detail="Name must contain at least 2 characters")
    try:
        cursor = db.execute(
            "INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
            (name, email, hash_password(data.password), "User", datetime.now(timezone.utc).isoformat()),
        )
        db.commit()
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="An account with this email already exists") from exc
    user = db.execute("SELECT id, name, email, role, company, created_at FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
    token, _, expires = create_access_token(user["id"])
    return {"success": True, "message": "Account created successfully", "access_token": token,
            "token_type": "bearer", "expires_at": expires, "user": user_to_dict(user)}


@app.post("/auth/login")
def login(data: LoginRequest, db: sqlite3.Connection = Depends(get_db)):
    email = normalize_email(data.email)
    user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if user is None or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token, _, expires = create_access_token(user["id"])
    return {"success": True, "message": "Login successful", "access_token": token,
            "token_type": "bearer", "expires_at": expires, "user": user_to_dict(user)}


@app.get("/auth/me")
def get_profile(current=Depends(get_current_user)):
    user, _ = current
    return {"success": True, "user": user_to_dict(user)}


@app.put("/auth/me")
def update_profile(data: ProfileUpdateRequest, current=Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    user, _ = current
    name = data.name.strip()
    email = normalize_email(data.email)
    if len(name) < 2:
        raise HTTPException(status_code=422, detail="Name must contain at least 2 characters")
    try:
        db.execute("UPDATE users SET name = ?, email = ?, role = ?, company = ? WHERE id = ?",
            (name, email, data.role.strip() or "User", data.company.strip(), user["id"]))
        db.commit()
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="That email is already used by another account") from exc
    updated = db.execute("SELECT id, name, email, role, company, created_at FROM users WHERE id = ?", (user["id"],)).fetchone()
    return {"success": True, "message": "Profile updated successfully", "user": user_to_dict(updated)}


@app.post("/auth/logout")
def logout(current=Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    _, claims = current
    db.execute("INSERT OR REPLACE INTO revoked_tokens (jti, expires_at) VALUES (?, ?)", (claims["jti"], int(claims["exp"])))
    db.execute("DELETE FROM revoked_tokens WHERE expires_at <= ?", (int(datetime.now(timezone.utc).timestamp()),))
    db.commit()
    return {"success": True, "message": "Logged out successfully"}

# ==================================================
# 7. DATASET HELPERS AND UPLOAD
# ==================================================

def read_dataset(path: Path) -> pd.DataFrame:
    frame = pd.read_csv(path) if path.suffix.lower() == ".csv" else pd.read_excel(path)
    frame.columns = frame.columns.astype(str).str.strip()
    return frame


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    global current_dataset_path
    filename = file.filename or ""
    extension = Path(filename).suffix.lower()
    if extension not in [".csv", ".xlsx", ".xls"]:
        raise HTTPException(status_code=400, detail="Only CSV, XLSX and XLS files are allowed.")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The file is empty.")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File must be smaller than 10 MB.")
    try:
        df = pd.read_csv(BytesIO(content)) if extension == ".csv" else pd.read_excel(BytesIO(content))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read file: {exc}") from exc
    df.columns = df.columns.astype(str).str.strip()
    missing = [column for column in REQUIRED_COLUMNS if column not in df.columns]
    if missing:
        raise HTTPException(status_code=400, detail={"message": "Required columns are missing.", "missing_columns": missing, "expected_columns": REQUIRED_COLUMNS})
    if df.empty:
        raise HTTPException(status_code=400, detail="The dataset contains no data rows.")
    for column in ["Quantity", "Sales", "Profit"]:
        df[column] = pd.to_numeric(df[column], errors="coerce")
    if df[["Quantity", "Sales", "Profit"]].isna().any().any():
        raise HTTPException(status_code=400, detail="Quantity, Sales and Profit must contain valid numeric values in every row.")
    if df[["Product", "Category"]].isna().any().any() or df["Product"].astype(str).str.strip().eq("").any() or df["Category"].astype(str).str.strip().eq("").any():
        raise HTTPException(status_code=400, detail="Product and Category cannot be empty.")

    total_sales = float(df["Sales"].sum())
    total_profit = float(df["Profit"].sum())
    total_quantity = float(df["Quantity"].sum())
    unique_products = int(df["Product"].nunique())
    profit_margin = total_profit / total_sales * 100 if total_sales != 0 else 0.0
    dates = pd.to_datetime(df["Date"], errors="coerce")
    monthly_df = df.copy()
    monthly_df["Month"] = dates.dt.strftime("%Y-%m")
    monthly_df = monthly_df.dropna(subset=["Month"])
    monthly_sales = monthly_df.groupby("Month")["Sales"].sum().sort_index().reset_index()
    monthly_sales["Sales"] = monthly_sales["Sales"].astype(float)
    preview_df = df.head(5).copy()
    preview_df["Date"] = preview_df["Date"].astype(str)
    preview = json.loads(preview_df.to_json(orient="records"))

    save_path = UPLOAD_DIR / f"dataset{extension}"
    try:
        save_path.write_bytes(content)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Could not save uploaded file: {exc}") from exc
    current_dataset_path = save_path
    return {"message": "File uploaded and validated successfully.", "filename": filename, "saved_as": str(save_path),
            "rows": int(len(df)), "columns": list(df.columns), "preview": preview,
            "metrics": {"total_sales": total_sales, "total_profit": total_profit, "total_quantity": total_quantity,
                        "unique_products": unique_products, "profit_margin": float(profit_margin)},
            "monthly_sales": monthly_sales.to_dict(orient="records")}

@app.post("/upload/merge")
async def merge_upload_files(files: list[UploadFile] = File(...)):
    """Validate and combine multiple business datasets into one active CSV."""
    global current_dataset_path

    if not files:
        raise HTTPException(status_code=400, detail="Select at least one file.")

    frames = []
    filenames = []
    total_size = 0

    for uploaded in files:
        filename = uploaded.filename or "dataset"
        extension = Path(filename).suffix.lower()
        if extension not in [".csv", ".xlsx", ".xls"]:
            raise HTTPException(status_code=400, detail=f"{filename}: only CSV, XLSX and XLS files are allowed.")

        content = await uploaded.read()
        total_size += len(content)
        if not content:
            raise HTTPException(status_code=400, detail=f"{filename}: the file is empty.")
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail=f"{filename}: file must be smaller than 10 MB.")
        if total_size > 30 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Combined upload size must be smaller than 30 MB.")

        try:
            frame = pd.read_csv(BytesIO(content)) if extension == ".csv" else pd.read_excel(BytesIO(content))
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Could not read {filename}: {exc}") from exc

        frame.columns = frame.columns.astype(str).str.strip()
        missing = [column for column in REQUIRED_COLUMNS if column not in frame.columns]
        if missing:
            raise HTTPException(status_code=400, detail={
                "message": f"{filename} is missing required columns.",
                "missing_columns": missing,
                "expected_columns": REQUIRED_COLUMNS,
            })
        if frame.empty:
            raise HTTPException(status_code=400, detail=f"{filename}: the dataset contains no data rows.")

        for column in ["Quantity", "Sales", "Profit"]:
            frame[column] = pd.to_numeric(frame[column], errors="coerce")
        if frame[["Quantity", "Sales", "Profit"]].isna().any().any():
            raise HTTPException(status_code=400, detail=f"{filename}: Quantity, Sales and Profit must be numeric in every row.")
        if (frame[["Product", "Category"]].isna().any().any()
                or frame["Product"].astype(str).str.strip().eq("").any()
                or frame["Category"].astype(str).str.strip().eq("").any()):
            raise HTTPException(status_code=400, detail=f"{filename}: Product and Category cannot be empty.")

        frames.append(frame)
        filenames.append(filename)

    combined = pd.concat(frames, ignore_index=True, sort=False)
    parsed_dates = pd.to_datetime(combined["Date"], errors="coerce")
    if parsed_dates.notna().any():
        combined = combined.assign(_parsed_date=parsed_dates)
        combined = combined.sort_values("_parsed_date", na_position="last").drop(columns=["_parsed_date"]).reset_index(drop=True)

    total_sales = float(combined["Sales"].sum())
    total_profit = float(combined["Profit"].sum())
    total_quantity = float(combined["Quantity"].sum())
    unique_products = int(combined["Product"].nunique())
    profit_margin = total_profit / total_sales * 100 if total_sales else 0.0

    monthly_df = combined.copy()
    monthly_df["Month"] = pd.to_datetime(monthly_df["Date"], errors="coerce").dt.strftime("%Y-%m")
    monthly_df = monthly_df.dropna(subset=["Month"])
    monthly_sales = monthly_df.groupby("Month")["Sales"].sum().sort_index().reset_index()
    monthly_sales["Sales"] = monthly_sales["Sales"].astype(float)
    preview_df = combined.head(5).copy()
    preview_df["Date"] = preview_df["Date"].astype(str)
    preview = json.loads(preview_df.to_json(orient="records"))

    save_path = UPLOAD_DIR / "dataset.csv"
    try:
        combined.to_csv(save_path, index=False)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Could not save merged dataset: {exc}") from exc
    current_dataset_path = save_path

    return {
        "message": "Datasets merged and validated successfully.",
        "filename": ", ".join(filenames),
        "saved_as": str(save_path),
        "rows": int(len(combined)),
        "columns": list(combined.columns),
        "preview": preview,
        "metrics": {
            "total_sales": total_sales,
            "total_profit": total_profit,
            "total_quantity": total_quantity,
            "unique_products": unique_products,
            "profit_margin": float(profit_margin),
        },
        "monthly_sales": monthly_sales.to_dict(orient="records"),
    }

# ==================================================
# 8. PRODUCT ANALYSIS
# ==================================================

@app.get("/products/analysis")
def product_analysis():
    if current_dataset_path is None or not current_dataset_path.exists():
        raise HTTPException(status_code=400, detail="Please upload a dataset first.")
    try:
        df = read_dataset(current_dataset_path)
        missing = [column for column in REQUIRED_COLUMNS if column not in df.columns]
        if missing:
            raise HTTPException(status_code=400, detail=f"Dataset is missing columns: {', '.join(missing)}")
        for column in ["Quantity", "Sales", "Profit"]:
            df[column] = pd.to_numeric(df[column], errors="coerce")
        df = df.dropna(subset=["Product", "Category", "Quantity", "Sales", "Profit"])
        if df.empty:
            return {"success": True, "total_products": 0, "top_product": None, "products": []}
        products = df.groupby(["Product", "Category"], as_index=False).agg(
            total_sales=("Sales", "sum"), total_profit=("Profit", "sum"),
            total_quantity=("Quantity", "sum"), transactions=("Product", "size"))
        products["profit_margin"] = (products["total_profit"] / products["total_sales"].replace(0, float("nan")) * 100).fillna(0)
        products = products.sort_values("total_sales", ascending=False).reset_index(drop=True)
        products.insert(0, "sales_rank", range(1, len(products) + 1))
        records = json.loads(products.round(2).to_json(orient="records"))
        return {"success": True, "total_products": int(len(products)), "top_product": records[0] if records else None, "products": records}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Product analysis failed: {str(exc)}") from exc

# ==================================================
# 9. ML SALES PREDICTION
# ==================================================

@app.post("/forecast/predict")
def predict_sales(data: PredictionRequest):
    try:
        input_data = pd.DataFrame([{"Month": data.Month, "Product": data.Product, "Category": data.Category,
                                    "Year": data.Year, "Day": data.Day, "Quantity": data.Quantity, "Profit": data.Profit}])
        predicted_sales = float(model.predict(input_data)[0])
        return {"success": True, "message": "Sales prediction generated successfully.",
                "predicted_sales": round(predicted_sales, 2), "currency": "INR"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(exc)}") from exc

# ==================================================
# 10. HEALTH CHECK
# ==================================================

@app.get("/health")
def health_check():
    return {"status": "healthy", "model_loaded": model is not None, "api": "BizPredict AI"}
