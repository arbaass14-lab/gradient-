let csrf = "";
export function setCsrf(value) {
  csrf = value;
}
export async function api(url, options = {}) {
  const { body, ...rest } = options;
  const headers = { ...rest.headers };
  if (rest.method && rest.method !== "GET") headers["X-CSRF-Token"] = csrf;
  if (body && !(body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...rest,
    headers,
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401)
    window.dispatchEvent(new Event("session-expired"));
  if (response.status === 204) return null;
  const data = await response
    .json()
    .catch(() => ({ error: "Unexpected server response. Please retry." }));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
export function uploadFile(data, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/content");
    xhr.setRequestHeader("X-CSRF-Token", csrf);
    xhr.timeout = 10 * 60000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () =>
      reject(new Error("Upload interrupted. Check your connection and retry."));
    xhr.ontimeout = () =>
      reject(new Error("Upload timed out. Please try a smaller file."));
    xhr.onload = () => {
      let result;
      try {
        result = JSON.parse(xhr.responseText);
      } catch {
        return reject(new Error("Unexpected upload response. Please retry."));
      }
      if (xhr.status === 401)
        window.dispatchEvent(new Event("session-expired"));
      xhr.status >= 200 && xhr.status < 300
        ? resolve(result)
        : reject(new Error(result.error || "Upload failed."));
    };
    xhr.send(data);
  });
}
