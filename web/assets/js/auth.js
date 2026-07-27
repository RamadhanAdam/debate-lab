import { api } from "./api.js?v=20260606";

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

export async function emailResetPasswordReq(email) {
  return api("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}
