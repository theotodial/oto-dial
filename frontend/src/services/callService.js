import API from "../api";

export const getCalls = async () => {
  const response = await API.get("/api/calls");
  if (response.error) {
    throw new Error(response.error || "Failed to fetch calls");
  }
  return response.data?.calls || response.data || [];
};

