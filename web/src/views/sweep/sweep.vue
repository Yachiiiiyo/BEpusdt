<template>
  <div class="snow-page">
    <div class="snow-inner">
      <a-alert v-if="!info.enabled" type="warning" class="info-alert">
        归集未启用：需要配置 HD_MNEMONIC，并让 HD_TRADE_TYPES 包含 usdt.bep20（也可用 HD_SWEEP_ENABLED 显式开关）。
      </a-alert>
      <a-descriptions v-else class="info-alert" :column="1" size="small" bordered>
        <a-descriptions-item label="归集目标">
          <a-typography-text copyable>{{ info.dest_address }}</a-typography-text>
        </a-descriptions-item>
        <a-descriptions-item label="手续费地址">
          <a-typography-text copyable>{{ info.gas_address }}</a-typography-text>
          （请在此地址保持一些 BNB，用于给收款地址补充手续费）
        </a-descriptions-item>
      </a-descriptions>

      <a-form ref="formRef" auto-label-width :model="formData.form">
        <a-row :gutter="16">
          <a-col :xs="24" :sm="24" :md="12" :lg="12" :xl="6" :xxl="6">
            <a-form-item field="order_id" label="订单号">
              <a-input v-model="formData.form.order_id" placeholder="请输入订单号" allow-clear />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="24" :md="12" :lg="12" :xl="6" :xxl="6">
            <a-form-item field="address" label="来源地址">
              <a-input v-model="formData.form.address" placeholder="请输入来源地址" allow-clear />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="24" :md="12" :lg="12" :xl="6" :xxl="6">
            <a-form-item field="state" label="状态">
              <a-select v-model="formData.form.state" placeholder="请选择状态" allow-clear>
                <a-option v-for="item in stateOptions" :key="item.value" :value="item.value">{{ item.label }}</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="24" :md="12" :lg="12" :xl="6" :xxl="6">
            <a-space class="search-btn" wrap>
              <a-button type="primary" @click="getCommonTableList">
                <template #icon><icon-search /></template>
                查询
              </a-button>
              <a-button @click="onReset">
                <template #icon><icon-refresh /></template>
                重置
              </a-button>
            </a-space>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :xs="24" :sm="24" :md="12" :lg="12" :xl="8" :xxl="8">
            <a-form-item label="手动归集">
              <a-input-number v-model="deriveId" :min="1" placeholder="派生地址记录 ID" style="width: 200px" />
              <a-button type="primary" status="success" style="margin-left: 8px" :disabled="!info.enabled" @click="onCollect">
                入队归集
              </a-button>
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>

      <a-table
        row-key="key"
        size="small"
        :bordered="{ cell: true }"
        :scroll="{ x: '100%', y: '100%', minWidth: 1500 }"
        :loading="loading"
        :columns="columns"
        :data="data"
        :pagination="pagination"
        @page-change="pageChange"
        @page-size-change="pageSizeChange"
      >
        <template #address="{ record }">
          <a-typography-text copyable>{{ record.address }}</a-typography-text>
        </template>
        <template #state="{ record }">
          <a-tag size="small" :color="stateColor(record.state)">{{ stateLabel(record.state) }}</a-tag>
        </template>
        <template #amount="{ record }">{{ formatAmount(record.amount) }}</template>
        <template #fund_tx="{ record }">
          <a-typography-text v-if="record.fund_tx" copyable>{{ shortHash(record.fund_tx) }}</a-typography-text>
        </template>
        <template #sweep_tx="{ record }">
          <a-typography-text v-if="record.sweep_tx" copyable>{{ shortHash(record.sweep_tx) }}</a-typography-text>
        </template>
        <template #return_tx="{ record }">
          <a-typography-text v-if="record.return_tx" copyable>{{ shortHash(record.return_tx) }}</a-typography-text>
        </template>
        <template #optional="{ record }">
          <a-popconfirm v-if="record.state === 'failed'" content="确定重试这条归集吗?" type="warning" @ok="onRetry(record)">
            <a-button size="mini" type="primary" status="warning">重试</a-button>
          </a-popconfirm>
        </template>
      </a-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getSweepListAPI, getSweepInfoAPI, retrySweepAPI, collectSweepAPI } from "@/api/modules/sweep/index";
import { List, FormData, Info, Pagination } from "./sweep";
import { Message } from "@arco-design/web-vue";

const stateMap: Record<string, { label: string; color: string }> = {
  pending: { label: "待处理", color: "gray" },
  funding: { label: "补充手续费中", color: "arcoblue" },
  funded: { label: "手续费已到账", color: "arcoblue" },
  sweeping: { label: "归集中", color: "orange" },
  swept: { label: "已归集", color: "green" },
  done: { label: "完成", color: "green" },
  skipped: { label: "无余额跳过", color: "gray" },
  failed: { label: "失败", color: "red" }
};
const stateOptions = Object.keys(stateMap).map(k => ({ value: k, label: stateMap[k].label }));
const stateLabel = (s: string) => stateMap[s]?.label ?? s;
const stateColor = (s: string) => stateMap[s]?.color ?? "gray";
const shortHash = (h: string) => (h.length > 14 ? `${h.slice(0, 8)}...${h.slice(-6)}` : h);
// amount 以最小单位保存，BSC 上 USDT 为 18 位小数
const formatAmount = (v: string) => {
  if (!v) return "";
  const s = v.padStart(19, "0");
  const intPart = s.slice(0, s.length - 18).replace(/^0+(?=\d)/, "");
  const frac = s.slice(s.length - 18).replace(/0+$/, "");
  return frac ? `${intPart}.${frac}` : intPart;
};

const formData = reactive<FormData>({
  form: { state: "", address: "", order_id: "" },
  search: false
});
const info = reactive<Info>({ enabled: false, dest_address: "", gas_address: "", trade_types: [] });
const deriveId = ref<number | undefined>(undefined);

const pagination = ref<Pagination>({ showPageSize: true, showTotal: true, current: 1, pageSize: 10, total: 10 });
const loading = ref(false);
const data = reactive<List[]>([]);

const columns = [
  { title: "ID", align: "center", dataIndex: "id", width: 70 },
  { title: "订单号", align: "center", dataIndex: "order_id", width: 160, ellipsis: true, tooltip: true },
  { title: "派生索引", align: "center", dataIndex: "derive_index", width: 90 },
  { title: "来源地址", align: "center", dataIndex: "address", slotName: "address", width: 380 },
  { title: "状态", align: "center", dataIndex: "state", slotName: "state", width: 130 },
  { title: "归集数量(USDT)", align: "center", dataIndex: "amount", slotName: "amount", width: 130 },
  { title: "补给交易", align: "center", dataIndex: "fund_tx", slotName: "fund_tx", width: 170 },
  { title: "归集交易", align: "center", dataIndex: "sweep_tx", slotName: "sweep_tx", width: 170 },
  { title: "回收交易", align: "center", dataIndex: "return_tx", slotName: "return_tx", width: 170 },
  { title: "重试次数", align: "center", dataIndex: "attempts", width: 90 },
  { title: "最后错误", align: "center", dataIndex: "last_error", width: 240, ellipsis: true, tooltip: true },
  { title: "更新时间", align: "center", dataIndex: "updated_at", width: 190 },
  { title: "操作", align: "center", slotName: "optional", width: 90, fixed: "right" }
];

const getInfo = async () => {
  const res = await getSweepInfoAPI({});
  Object.assign(info, res.data);
};

const getCommonTableList = async () => {
  try {
    loading.value = true;
    const res = await getSweepListAPI({
      page: pagination.value.current,
      size: pagination.value.pageSize,
      sort: "desc",
      keyword: "",
      status: 99,
      ...formData.form
    });
    data.length = 0;
    data.push(...res.data);
    pagination.value.total = res.total;
  } finally {
    loading.value = false;
  }
};

const onRetry = async (record: List) => {
  try {
    await retrySweepAPI({ id: record.id });
    Message.success("已重新入队");
    getCommonTableList();
  } catch (error) {
    console.error("重试失败:", error);
  }
};

const onCollect = async () => {
  if (!deriveId.value) {
    Message.warning("请填写派生地址记录 ID");
    return;
  }
  try {
    await collectSweepAPI({ derive_id: deriveId.value });
    Message.success("已入队，稍后在列表里查看进度");
    getCommonTableList();
  } catch (error) {
    console.error("手动归集失败:", error);
  }
};

const onReset = () => {
  formData.form = { state: "", address: "", order_id: "" };
  getCommonTableList();
};

const pageChange = (page: number) => {
  pagination.value.current = page;
  getCommonTableList();
};

const pageSizeChange = (pageSize: number) => {
  pagination.value.pageSize = pageSize;
  getCommonTableList();
};

getInfo();
getCommonTableList();
</script>

<style lang="scss" scoped>
.search-btn {
  margin-bottom: 20px;
}

.info-alert {
  margin-bottom: 16px;
}
</style>
