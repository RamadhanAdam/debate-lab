import { api } from "./api.js";

export async function checkAuthReq() {
  return api("/auth/me");
}

export async function emailSignInReq(email, password) {
  return api("/auth/signin", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function emailRegisterReq(email, password) {
  return api("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}
