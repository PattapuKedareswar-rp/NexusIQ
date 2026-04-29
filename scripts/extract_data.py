"""
extract_data.py — Pull data from BigQuery and save as local JSON files.
Run once, then the backend serves from local cache (instant speed).
"""

import json
import os
from pathlib import Path

from google.cloud import bigquery
from google.oauth2 import service_account

# Config
KEY_PATH = Path("GCPKey.json").resolve()
DATA_DIR = Path("data")
PROJECT = "hck-dev-2876"
DATASET = "hck_data"

# Table name -> row limit (None = no limit for small tables)
TABLES = {
    "SFDC_Accounts": 50000,
    "SFDC_Case": 50000,
    "SFDC_Contact": 50000,
    "SFDC_Order__c": 30000,
    "SFDC_Product2": None,          # 52K rows — small enough
    "SFDC_ClientHealthEvents__c": None,  # 25K rows
    "SFDC_ProblemManagementEscalation": None,  # 188K — take sample
    "SFDC_Task": 30000,
    "SFDC_EmailMessage": 20000,
    "SFDC_Opportunity": None,       # 165K
    "SFDC_OpportunityLineItem": 50000,
    "SFDC_Cancellation": None,      # 157K
    "SFDC_Support_Product_Joiner__c": None,  # 70K
    "SFDC_Support_Product__c": None,  # 826 rows
}

# Demo account IDs to prioritize
DEMO_ACCOUNTS = [
    "00100000005Qlm9AAC",  # GREYSTAR MANAGEMENT SERVICES, LLC
    "00100000001iWX8AAM",  # RPM LIVING, LLC
    "0013700000Los4EAAR",  # Portland Housing Corporation
    "00100000005354uAAA",  # Consumer-Realpage
]

def main():
    if not KEY_PATH.exists():
        print(f"ERROR: {KEY_PATH} not found.")
        return

    credentials = service_account.Credentials.from_service_account_file(str(KEY_PATH))
    client = bigquery.Client(credentials=credentials, project=credentials.project_id)

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("Extracting data from BigQuery -> local JSON")
    print("=" * 60)

    for table, limit in TABLES.items():
        print(f"\n  Extracting {table}...", end=" ", flush=True)
        try:
            query = f"SELECT * FROM `{PROJECT}.{DATASET}.{table}`"
            if limit:
                query += f" LIMIT {limit}"
            df = client.query(query).to_dataframe()
            
            output_path = DATA_DIR / f"{table}.json"
            
            # Convert to JSON-safe format
            records = json.loads(df.to_json(orient="records", date_format="iso"))
            
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(records, f, default=str)

            print(f"{len(df):,} rows, {len(df.columns)} columns")
            print(f"    Columns: {', '.join(list(df.columns)[:10])}", end="")
            if len(df.columns) > 10:
                print(f" ... +{len(df.columns)-10} more")
            else:
                print()

        except Exception as e:
            print(f"FAILED: {e}")
            # Write empty array so backend doesn't break
            with open(DATA_DIR / f"{table}.json", "w") as f:
                json.dump([], f)

    print("\n" + "=" * 60)
    print(f"Done. Files saved to {DATA_DIR.resolve()}/")
    print("You can now start the backend with: python -m backend.main")
    print("=" * 60)


if __name__ == "__main__":
    main()
