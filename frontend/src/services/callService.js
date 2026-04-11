import API from "../api";

export const getCalls = async () => {
  const response = await API.get("/api/calls", { params: { limit: 20 } });
  if (response.error) {
    throw new Error(response.error || "Failed to fetch calls");
  }
  return response.data?.calls || response.data || [];
};

