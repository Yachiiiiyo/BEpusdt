interface List {
  id: number;
  order_id: string;
  trade_id: string;
  derive_index: number;
  address: string;
  dest_address: string;
  state: string;
  amount: string;
  fund_tx: string;
  sweep_tx: string;
  return_tx: string;
  attempts: number;
  last_error: string;
  updated_at: string;
  key?: string;
}

interface FormData {
  form: {
    state: string;
    address: string;
    order_id: string;
  };
  search: boolean;
}

interface Info {
  enabled: boolean;
  dest_address: string;
  gas_address: string;
  trade_types: string[];
}

interface Pagination {
  showPageSize: boolean;
  showTotal: boolean;
  current: number;
  pageSize: number;
  total: number;
}

export type { List, FormData, Info, Pagination };
