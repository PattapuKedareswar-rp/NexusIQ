"""Quick script to check column names in key tables."""
from backend.bq_client import query_rows

# Check PME account FK
r = query_rows("""
    SELECT column_name FROM `hck-dev-2876.hck_data.INFORMATION_SCHEMA.COLUMNS` 
    WHERE table_name = 'SFDC_ProblemManagementEscalation'
    AND (column_name LIKE 'Account%' OR column_name LIKE 'PW_Account%')
""")
print("PME account FKs:", [c["column_name"] for c in r])

# Check Support Product Joiner FKs
r = query_rows("""
    SELECT column_name FROM `hck-dev-2876.hck_data.INFORMATION_SCHEMA.COLUMNS` 
    WHERE table_name = 'SFDC_Support_Product_Joiner__c'
""")
print("Joiner ALL columns:", [c["column_name"] for c in r])

# Check Cancellation account FK
r = query_rows("""
    SELECT column_name FROM `hck-dev-2876.hck_data.INFORMATION_SCHEMA.COLUMNS` 
    WHERE table_name = 'SFDC_Cancellation'
    AND column_name LIKE 'Account%'
""")
print("Cancellation account FKs:", [c["column_name"] for c in r])
