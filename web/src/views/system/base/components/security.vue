<template>
  <a-row align="center" :gutter="[0, 16]">
    <a-col :span="24">
      <a-card title="安全设置">
        <a-form :model="form" :rules="rules" :layout="layoutMode" class="base-setting-form" @submit="onSubmit">
          <a-form-item field="admin_secure" extra="长度限制：8-18位，必须以 / 开头" label="安全入口">
            <a-input v-model="form.admin_secure" placeholder="请输入安全入口" allow-clear />
          </a-form-item>

          <a-form-item field="admin_username" label="管理账号">
            <a-input v-model="form.admin_username" placeholder="请输入管理账号" allow-clear />
          </a-form-item>

          <a-form-item field="password" extra="保存任何安全设置都需要验证当前密码" label="当前密码">
            <a-input-password v-model="form.password" placeholder="请输入当前密码" allow-clear />
          </a-form-item>

          <a-form-item field="new_password" extra="不修改密码请留空；至少6位，不超过72字节" label="新密码">
            <a-input-password v-model="form.new_password" placeholder="请输入新密码" allow-clear />
          </a-form-item>

          <a-form-item field="confirm_password" label="重复新密码">
            <a-input-password v-model="form.confirm_password" placeholder="请再次输入新密码" allow-clear />
          </a-form-item>

          <a-form-item>
            <a-space>
              <a-button type="primary" html-type="submit">保存设置</a-button>
            </a-space>
          </a-form-item>
        </a-form>
      </a-card>
    </a-col>
  </a-row>
</template>

<script setup lang="ts">
import { useDevicesSize } from "@/hooks/useDevicesSize";

import { Message } from "@arco-design/web-vue";
import { securityAPI } from "@/api/modules/user";
import { useUserInfoStore } from "@/store/modules/user-info";
import pinia from "@/store/index";

const emit = defineEmits(["refresh"]);
const data = defineModel() as any;
const { isMobile } = useDevicesSize();
const layoutMode = computed(() => (isMobile.value ? "vertical" : "horizontal"));

// 基础设置表单
const form = ref({
  admin_secure: "",
  admin_username: "",
  password: "",
  new_password: "",
  confirm_password: ""
});

// 基础设置验证规则
const rules = {
  admin_secure: [
    {
      required: true,
      message: "安全入口不能为空"
    },
    {
      validator: (value: string, cb: any) => {
        if (!value.startsWith("/")) {
          cb("安全入口必须以 / 开头");
        } else if (value.length < 8) {
          cb("安全入口长度不能少于8位");
        } else if (value.length > 18) {
          cb("安全入口长度不能超过18位");
        } else if (!/^\/[a-zA-Z0-9]+$/.test(value)) {
          cb("安全入口只能包含字母和数字");
        } else {
          cb();
        }
      }
    }
  ],
  admin_username: [
    {
      required: true,
      message: "管理账号不能为空"
    }
  ],
  password: [
    {
      required: true,
      message: "当前密码不能为空"
    }
  ],
  new_password: [
    {
      validator: (value: string, cb: any) => {
        if (!value) {
          cb();

          return;
        }
        const bytes = new TextEncoder().encode(value).length;
        if (value.length < 6) {
          cb("新密码长度不能少于6位");
        } else if (bytes > 72) {
          cb("新密码过长（不超过72字节），请缩短后重试");
        } else {
          cb();
        }
      }
    }
  ],
  confirm_password: [
    {
      validator: (value: string, cb: any) => {
        if (form.value.new_password && !value) {
          cb("请重复输入新密码");
        } else if (value && value !== form.value.new_password) {
          cb("两次输入的密码不一致");
        } else {
          cb();
        }
      }
    }
  ]
};

// 保存基础设置
const onSubmit = async ({ errors }: ArcoDesign.ArcoSubmit) => {
  if (errors) return;

  try {
    const response = await securityAPI({
      admin_secure: form.value.admin_secure,
      admin_username: form.value.admin_username,
      password: form.value.password,
      new_password: form.value.new_password,
      confirm_password: form.value.confirm_password
    });

    if (response && response.code === 200) {
      if (response.data?.relogin) {
        Message.success("密码修改成功，请重新登录！");

        // 清除本地登录态并跳转登录页（与 axios 拦截器 403 处理一致）
        localStorage.removeItem("user-info");
        const userStore = useUserInfoStore(pinia);
        userStore.logOut();

        const basePath = window.location.pathname.split("#")[0];
        window.location.href = `${basePath}#/login`;
      } else {
        Message.success("设置保存成功！");
        emit("refresh");
      }

      form.value.password = "";
      form.value.new_password = "";
      form.value.confirm_password = "";
    } else {
      Message.error(response?.msg || "设置保存失败");
    }
  } catch (error: any) {
    // 响应拦截器已提示错误信息
  }
};

// 监听数据变化，更新表单
watch(
  () => data.value,
  () => {
    if (data.value) {
      form.value.admin_username = data.value.admin_username || "";
      form.value.admin_secure = data.value.admin_secure || "";
    }
  },
  { immediate: true }
);
</script>

<style lang="scss" scoped>
.row-title {
  font-size: $font-size-title-1;
}
</style>
