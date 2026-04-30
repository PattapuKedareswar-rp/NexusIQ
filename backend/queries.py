"""
queries.py — Centralized SQL queries for NexusIQ.

All BigQuery queries live here. Column names are validated against the
actual hck-dev-2876.hck_data schema (April 2026).

SCHEMA REFERENCE (validated columns):
─────────────────────────────────────
SFDC_Accounts (187 cols)
  PK: Id
  Key: Name, OwnerId, ParentId, BillingCity, BillingState,
       Client_Success_Manager__c, Account_Tier__c
  NOTE: No "Industry" column exists.

SFDC_Case (84 cols)
  PK: Id
  FK: AccountId → Account, ContactId → Contact
  Key: CaseNumber, Subject, Status, Priority, Origin, CreatedDate,
       ClosedDate, IsClosed

SFDC_Contact (342 cols)
  PK: Id
  FK: AccountId → Account
  Key: FirstName, LastName, Email, Phone

SFDC_Order__c (314 cols)
  PK: Id
  FK: Account_Name__c → Account (NOT AccountId)
  Key: Status__c, Implementation_Completion_Date__c,
       CreatedDate, Implementation_Start_Date__c,
       Is_Pending_Implementation__c

SFDC_ClientHealthEvents__c (81 cols)
  PK: Id
  FK: Accounts__c → Account (NOT Account__c)
  Key: Name, Status__c, CreatedDate

SFDC_ProblemManagementEscalation (171 cols)
  PK: Id
  FK: Case_ID__c → Case.Id (links to Account through Case)
      NO direct AccountId or Account__c column
  Key: Closed__c (BOOL), Priority__c, Escalation_Status__c,
       Case_Number__c, Case_Status__c

SFDC_Task (80 cols)
  PK: Id
  FK: AccountId → Account, WhatId → polymorphic
  Key: Subject, Status, Priority, ActivityDate, IsClosed

SFDC_EmailMessage (29 cols)
  PK: Id
  FK: ParentId → Case (commonly)
  Key: Subject, MessageDate, Status

SFDC_Opportunity (standard)
  PK: Id
  FK: AccountId → Account
  Key: Name, StageName, CloseDate, Amount

SFDC_Cancellation (47 cols)
  PK: Id
  FK: PMC_Parent_Account__c → Account (NOT AccountId)
  Key: Status__c, Credit_Closed_Date__c

SFDC_Support_Product_Joiner__c (29 cols)
  PK: Id
  FK: Support_Product__c → Support_Product__c
      Problem_Management_Escalation__c → PME
      ClientHealthEvent__c → ClientHealthEvents__c
  NOTE: NO Case FK. Links to PME and Health Events, not Cases.

SFDC_Support_Product__c (small, ~826 rows)
  PK: Id
  Key: Name

SFDC_Product2 (standard)
  PK: Id
  Key: Name, ProductCode, Family, IsActive
"""

from backend.bq_client import fqn

# ═══════════════════════════════════════════════════════
# ACCOUNT QUERIES
# ═══════════════════════════════════════════════════════

SEARCH_ACCOUNTS = f"""
SELECT Id, Name, OwnerId, BillingCity, BillingState,
       Client_Success_Manager__c, ParentId, Account_Tier__c
FROM {fqn('SFDC_Accounts')}
WHERE CONTAINS_SUBSTR(Name, @query)
ORDER BY Name
LIMIT @limit
"""

GET_ACCOUNT = f"""
SELECT * FROM {fqn('SFDC_Accounts')}
WHERE Id = @account_id
"""

# ═══════════════════════════════════════════════════════
# RELATED RECORDS (parameterized by account_id)
# These use the validated FK columns from schema discovery.
# ═══════════════════════════════════════════════════════

# Cases: FK = AccountId (standard Salesforce)
GET_CASES = f"""
SELECT Id, CaseNumber, Subject, Status, Priority, Origin,
       CreatedDate, ClosedDate, IsClosed, ContactId, OwnerId
FROM {fqn('SFDC_Case')}
WHERE AccountId = @account_id
ORDER BY CreatedDate DESC
LIMIT @limit
"""

# Contacts: FK = AccountId
GET_CONTACTS = f"""
SELECT Id, FirstName, LastName, Email, Phone, OwnerId, CreatedDate
FROM {fqn('SFDC_Contact')}
WHERE AccountId = @account_id
LIMIT @limit
"""

# Orders: FK = Account_Name__c (custom FK, NOT AccountId)
GET_ORDERS = f"""
SELECT Id, Name, Status__c, CreatedDate,
       Implementation_Completion_Date__c,
       Implementation_Start_Date__c,
       Is_Pending_Implementation__c
FROM {fqn('SFDC_Order__c')}
WHERE Account_Name__c = @account_id
ORDER BY CreatedDate DESC
LIMIT @limit
"""

# Health Events: FK = Accounts__c (custom, note plural)
GET_HEALTH_EVENTS = f"""
SELECT Id, Name, Status__c, CreatedDate
FROM {fqn('SFDC_ClientHealthEvents__c')}
WHERE Accounts__c = @account_id
ORDER BY CreatedDate DESC
LIMIT @limit
"""

# PMEs: NO direct account FK. Must join through Case.
GET_PMES = f"""
SELECT pme.Id, pme.Name, pme.Closed__c, pme.Priority__c,
       pme.Escalation_Status__c, pme.Case_Number__c,
       pme.Case_ID__c, pme.CreatedDate
FROM {fqn('SFDC_ProblemManagementEscalation')} pme
JOIN {fqn('SFDC_Case')} c ON c.Id = pme.Case_ID__c
WHERE c.AccountId = @account_id
ORDER BY pme.CreatedDate DESC
LIMIT @limit
"""

# Tasks: FK = AccountId
GET_TASKS = f"""
SELECT Id, Subject, Status, Priority, ActivityDate,
       CreatedDate, OwnerId, WhatId
FROM {fqn('SFDC_Task')}
WHERE AccountId = @account_id
ORDER BY CreatedDate DESC
LIMIT @limit
"""

# Emails: No direct account FK. Must join through Case.
GET_EMAILS = f"""
SELECT e.Id, e.Subject, e.MessageDate, e.Status,
       e.ParentId, e.FromAddress, e.ToAddress
FROM {fqn('SFDC_EmailMessage')} e
JOIN {fqn('SFDC_Case')} c ON c.Id = e.ParentId
WHERE c.AccountId = @account_id
ORDER BY e.MessageDate DESC
LIMIT @limit
"""

# Opportunities: FK = AccountId
GET_OPPORTUNITIES = f"""
SELECT Id, Name, StageName, CloseDate, Amount, Probability
FROM {fqn('SFDC_Opportunity')}
WHERE AccountId = @account_id
ORDER BY CloseDate DESC
LIMIT @limit
"""

# Cancellations: FK = PMC_Parent_Account__c
GET_CANCELLATIONS = f"""
SELECT Id, Name, Status__c, CreatedDate, Credit_Closed_Date__c
FROM {fqn('SFDC_Cancellation')}
WHERE PMC_Parent_Account__c = @account_id
ORDER BY CreatedDate DESC
LIMIT @limit
"""

# ═══════════════════════════════════════════════════════
# ADMIN DASHBOARD (aggregated across all accounts)
# ═══════════════════════════════════════════════════════

ADMIN_CASE_DISTRIBUTION = f"""
SELECT
    CASE
        WHEN LOWER(Priority) LIKE '%critical%' OR Priority = 'P1' OR Priority LIKE 'P1 %' OR Priority LIKE 'P1-%' THEN 'Critical'
        WHEN LOWER(Priority) LIKE '%high%' THEN 'High'
        WHEN LOWER(Priority) LIKE '%medium%' OR Priority = 'P2' OR Priority LIKE 'P2 %' OR Priority LIKE 'P2-%' THEN 'Medium'
        WHEN LOWER(Priority) LIKE '%low%' OR Priority = 'P3' OR Priority LIKE 'P3 %' OR Priority LIKE 'P3-%'
             OR Priority = 'P4' OR Priority LIKE 'P4 %' OR Priority LIKE 'P4-%' THEN 'Low'
        ELSE 'Other'
    END as priority_level,
    COUNT(*) as case_count
FROM {fqn('SFDC_Case')}
WHERE Status NOT IN ('Closed','Resolved')
GROUP BY priority_level
ORDER BY case_count DESC
"""

ADMIN_CASE_STATUS = f"""
SELECT
    Status,
    COUNT(*) as case_count
FROM {fqn('SFDC_Case')}
GROUP BY Status
ORDER BY case_count DESC
LIMIT 10
"""

ADMIN_CASE_STATS = f"""
SELECT
    COUNT(*) as total_cases,
    COUNTIF(Status NOT IN ('Closed','Resolved')) as open_cases,
    COUNTIF(Status NOT IN ('Closed','Resolved')
        AND (LOWER(Priority) LIKE '%high%' OR LOWER(Priority) LIKE '%critical%'
             OR Priority = 'P1' OR Priority LIKE 'P1 %' OR Priority LIKE 'P1-%'
             OR Priority = 'P2' OR Priority LIKE 'P2 %' OR Priority LIKE 'P2-%'))
        as high_priority_open,
    COUNTIF(Status NOT IN ('Closed','Resolved')
        AND CreatedDate < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY))
        as aging_cases
FROM {fqn('SFDC_Case')}
"""

ADMIN_ORDER_STATS = f"""
SELECT
    COUNT(*) as total_orders,
    COUNTIF(Implementation_Completion_Date__c IS NULL) as not_implemented,
    COUNTIF(Implementation_Completion_Date__c IS NULL
        AND CreatedDate < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 DAY))
        as stalled_orders
FROM {fqn('SFDC_Order__c')}
"""

ADMIN_HEALTH_STATS = f"""
SELECT
    COUNT(*) as total_events,
    COUNTIF(CreatedDate >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY))
        as recent_events
FROM {fqn('SFDC_ClientHealthEvents__c')}
"""

# PME: Closed__c is BOOL. Use IS NOT TRUE to handle both NULL and false.
ADMIN_PME_STATS = f"""
SELECT
    COUNT(*) as total_pmes,
    COUNTIF(Closed__c IS NULL OR LOWER(CAST(Closed__c AS STRING)) != 'true') as active_pmes
FROM {fqn('SFDC_ProblemManagementEscalation')}
"""

ADMIN_TOP_RISK_ACCOUNTS = f"""
SELECT a.Id, a.Name,
    COUNT(c.Id) as open_case_count,
    COUNTIF(LOWER(c.Priority) LIKE '%high%' OR LOWER(c.Priority) LIKE '%critical%'
            OR c.Priority = 'P1' OR c.Priority LIKE 'P1 %' OR c.Priority LIKE 'P1-%'
            OR c.Priority = 'P2' OR c.Priority LIKE 'P2 %' OR c.Priority LIKE 'P2-%')
        as high_pri_count
FROM {fqn('SFDC_Accounts')} a
JOIN {fqn('SFDC_Case')} c ON c.AccountId = a.Id
WHERE c.Status NOT IN ('Closed','Resolved')
GROUP BY a.Id, a.Name
ORDER BY high_pri_count DESC, open_case_count DESC
LIMIT 10
"""

# ═══════════════════════════════════════════════════════
# SYSTEMIC ISSUE DETECTION
# ═══════════════════════════════════════════════════════

# Strategy 1: PME → Support_Product_Joiner → Support_Product
# (Joiner has Problem_Management_Escalation__c FK)
SYSTEMIC_PRODUCT_VIA_PME = f"""
SELECT
    sp.Name as product,
    COUNT(DISTINCT c.AccountId) as affected_accounts,
    COUNT(DISTINCT pme.Id) as total_cases,
    ARRAY_AGG(DISTINCT a.Name LIMIT 5) as account_names
FROM {fqn('SFDC_ProblemManagementEscalation')} pme
JOIN {fqn('SFDC_Support_Product_Joiner__c')} spj
    ON spj.Problem_Management_Escalation__c = pme.Id
JOIN {fqn('SFDC_Support_Product__c')} sp
    ON sp.Id = spj.Support_Product__c
JOIN {fqn('SFDC_Case')} c ON c.Id = pme.Case_ID__c
LEFT JOIN {fqn('SFDC_Accounts')} a ON a.Id = c.AccountId
WHERE pme.Closed__c IS NOT TRUE
  AND pme.CreatedDate >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
GROUP BY sp.Name
HAVING COUNT(DISTINCT c.AccountId) >= @min_accounts
ORDER BY affected_accounts DESC
LIMIT 20
"""

# Strategy 2: Fallback — group cases by Subject keywords
SYSTEMIC_PRODUCT_FALLBACK = f"""
SELECT
    ARRAY_TO_STRING(
        ARRAY(SELECT word FROM UNNEST(SPLIT(LOWER(c.Subject), ' ')) word
              WHERE LENGTH(word) > 2 LIMIT 3),
        ' '
    ) as product,
    COUNT(DISTINCT c.AccountId) as affected_accounts,
    COUNT(*) as total_cases,
    ARRAY_AGG(DISTINCT a.Name LIMIT 5) as account_names
FROM {fqn('SFDC_Case')} c
LEFT JOIN {fqn('SFDC_Accounts')} a ON a.Id = c.AccountId
WHERE c.Status NOT IN ('Closed', 'Resolved')
  AND c.CreatedDate >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
  AND c.Subject IS NOT NULL
GROUP BY product
HAVING COUNT(DISTINCT c.AccountId) >= @min_accounts
ORDER BY affected_accounts DESC
LIMIT 20
"""

# Escalation clusters by status
ESCALATION_CLUSTERS = f"""
SELECT
    COALESCE(pme.Escalation_Status__c, 'Unknown') as type,
    COUNT(*) as count,
    ARRAY_AGG(DISTINCT a.Name LIMIT 5) as account_names
FROM {fqn('SFDC_ProblemManagementEscalation')} pme
LEFT JOIN {fqn('SFDC_Case')} c ON c.Id = pme.Case_ID__c
LEFT JOIN {fqn('SFDC_Accounts')} a ON a.Id = c.AccountId
GROUP BY type
HAVING COUNT(*) >= 2
ORDER BY count DESC
LIMIT 10
"""

ESCALATION_CLUSTERS_FALLBACK = f"""
SELECT
    'Active Escalation' as type,
    COUNT(*) as count,
    ARRAY_AGG(DISTINCT a.Name LIMIT 5) as account_names
FROM {fqn('SFDC_ProblemManagementEscalation')} pme
LEFT JOIN {fqn('SFDC_Case')} c ON c.Id = pme.Case_ID__c
LEFT JOIN {fqn('SFDC_Accounts')} a ON a.Id = c.AccountId
WHERE pme.Closed__c IS NULL OR LOWER(CAST(pme.Closed__c AS STRING)) != 'true'
"""
