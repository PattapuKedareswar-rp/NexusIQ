export interface Account {
  Id: string;
  Name: string;
  OwnerId?: string;
  ParentId?: string;
  Industry?: string;
  [key: string]: unknown;
}

export interface CaseRecord {
  Id: string;
  Subject?: string;
  Status?: string;
  Priority?: string;
  CaseNumber?: string;
  CreatedDate?: string;
  [key: string]: unknown;
}

export interface OrderRecord {
  Id: string;
  Name?: string;
  Status?: string;
  CreatedDate?: string;
  EffectiveDate?: string;
  Implementation_Complete_Date__c?: string | null;
  [key: string]: unknown;
}

export interface ContactRecord {
  Id: string;
  FirstName?: string;
  LastName?: string;
  Email?: string;
  Phone?: string;
  [key: string]: unknown;
}

export interface RiskFactor {
  label: string;
  points: number;
  detail: string;
}

export interface RiskResult {
  score: number;
  level: string;
  color: string;
  factors: RiskFactor[];
}

export interface ActionCard {
  type: string;
  title: string;
  description: string;
  urgency: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  priority?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface Customer360 {
  account: Account;
  cases: CaseRecord[];
  contacts: ContactRecord[];
  orders: OrderRecord[];
  opportunities: Record<string, unknown>[];
  health_events: Record<string, unknown>[];
  pmes: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  cancellations: Record<string, unknown>[];
  risk: RiskResult;
  actions: ActionCard[];
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
}

export interface SystemicIssue {
  product: string;
  affected_accounts: number;
  total_cases: number;
  account_names: string[];
}

export interface SearchResult {
  Id: string;
  Name: string;
  [key: string]: unknown;
}

export interface AdminSummary {
  cases: {
    total_cases: number;
    open_cases: number;
    high_priority_open: number;
    aging_cases: number;
  };
  orders: {
    total_orders: number;
    not_implemented: number;
    stalled_orders: number;
  };
  health: {
    total_events: number;
    recent_events: number;
  };
  pmes: {
    total_pmes: number;
    active_pmes: number;
  };
  top_risk_accounts: {
    Id: string;
    Name: string;
    open_case_count: number;
    high_pri_count: number;
  }[];
}
