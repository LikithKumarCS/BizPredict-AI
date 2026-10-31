
import joblib
import pandas as pd

model = joblib.load("ml_models/sales_model.pkl")

sample = pd.DataFrame([{
    "Month": 10,
    "Product": "Product A",
    "Category": "Electronics",
    "Year": 2026,
    "Day": 5,
    "Quantity": 10,
    "Profit": 500
}])

prediction = model.predict(sample)

print("Predicted Sales:", prediction[0])
