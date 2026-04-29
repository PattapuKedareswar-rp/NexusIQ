"""
test_bigquery.py — Verify BigQuery connectivity and explore table schemas.
Run this FIRST before anything else.
"""

from pathlib import Path

from google.cloud import bigquery
from google.oauth2 import service_account

key_path = Path("GCPKey.json").resolve()
if not key_path.exists():
    print(f"ERROR: {key_path} not found. Place your GCPKey.json in the project root.")
    exit(1)

credentials = service_account.Credentials.from_service_account_file(str(key_path))
client = bigquery.Client(credentials=credentials, project=credentials.project_id)

print("=" * 60)
print("BigQuery Connectivity Test")
print("=" * 60)

# Test basic connectivity
print("\n1. Testing connection with omsinvoice...")
try:
    rows = client.query("SELECT * FROM `hck-dev-2876.hck_data.omsinvoice` LIMIT 3").result()
    for row in rows:
        print(f"   Row: {dict(row.items())}")
    print("   SUCCESS: BigQuery connection works.\n")
except Exception as e:
    print(f"   FAILED: {e}\n")
    exit(1)

# Explore key tables
TABLES_TO_CHECK = [
    "SFDC_Accounts",
    "SFDC_Case",
    "SFDC_Contact",
    "SFDC_Order__c",
    "SFDC_Product2",
    "SFDC_ClientHealthEvents__c",
    "SFDC_ProblemManagementEscalation",
    "SFDC_Task",
    "SFDC_EmailMessage",
    "SFDC_Opportunity",
    "SFDC_Cancellation",
    "SFDC_Support_Product_Joiner__c",
    "SFDC_Support_Product__c",
]

print("2. Checking table availability and row counts...\n")
for table in TABLES_TO_CHECK:
    try:
        result = client.query(
            f"SELECT COUNT(*) as cnt FROM `hck-dev-2876.hck_data.{table}`"
        ).result()
        count = list(result)[0]["cnt"]
        print(f"   {table:45s} -> {count:>10,} rows")
    except Exception as e:
        print(f"   {table:45s} -> NOT FOUND ({e})")

# Show sample Account IDs with many cases (good demo candidates)
print("\n3. Finding accounts with most open cases (demo candidates)...\n")
try:
    query = """
    SELECT c.AccountId, a.Name, COUNT(*) as open_cases
    FROM `hck-dev-2876.hck_data.SFDC_Case` c
    JOIN `hck-dev-2876.hck_data.SFDC_Accounts` a ON a.Id = c.AccountId
    WHERE c.Status NOT IN ('Closed', 'Resolved')
    GROUP BY c.AccountId, a.Name
    ORDER BY open_cases DESC
    LIMIT 10
    """
    rows = client.query(query).result()
    for row in rows:
        d = dict(row.items())
        print(f"   {d['Name']:40s} | ID: {d['AccountId']} | Open Cases: {d['open_cases']}")
except Exception as e:
    print(f"   Could not find demo accounts: {e}")

# Show columns for key tables
print("\n4. Column names for key tables...\n")
for table in ["SFDC_Accounts", "SFDC_Case", "SFDC_Order__c", "SFDC_ClientHealthEvents__c"]:
    try:
        result = client.query(
            f"SELECT * FROM `hck-dev-2876.hck_data.{table}` LIMIT 1"
        ).result()
        row = list(result)
        if row:
            cols = list(dict(row[0].items()).keys())
            print(f"   {table}:")
            print(f"     {', '.join(cols[:15])}")
            if len(cols) > 15:
                print(f"     ... and {len(cols)-15} more columns")
            print()
    except Exception as e:
        print(f"   {table}: {e}\n")

print("=" * 60)
print("DONE. Copy the Account IDs above for testing.")
print("=" * 60)
