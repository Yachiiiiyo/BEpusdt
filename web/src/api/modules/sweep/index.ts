import axios from "@/api";

export const getSweepListAPI = (data: any) => {
  return axios({
    url: "/api/sweep/list",
    method: "post",
    data
  });
};

export const getSweepInfoAPI = (data: any = {}) => {
  return axios({
    url: "/api/sweep/info",
    method: "post",
    data
  });
};

export const retrySweepAPI = (data: any) => {
  return axios({
    url: "/api/sweep/retry",
    method: "post",
    data
  });
};

export const collectSweepAPI = (data: any) => {
  return axios({
    url: "/api/sweep/collect",
    method: "post",
    data
  });
};
