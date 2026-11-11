import axios from 'axios';
import { describeApiError, toApiError } from './errors';

/**
 * Shared Axios instance.
 *
 * Timeout: the ontology / profile / report endpoints run the LLM and can
 * legitimately take ~2 minutes, so the limit is 5 minutes.
 *
 * Response interceptor: it unwraps the Axios envelope and returns the API
 * payload itself. Every caller in the app works with the payload directly
 * (`res.success`, `res.data.project_id`, ...). Without this interceptor the
 * resolved value is the raw AxiosResponse, `res.success` is `undefined` and
 * every request silently falls into the error branch.
 */
export const API_TIMEOUT_MS = 300000;

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001',
  // No default Content-Type: Axios sets application/json for plain objects
  // and the browser sets multipart/form-data (with the boundary) for FormData.
  // A hard-coded application/json here would make Axios serialise FormData
  // as JSON, so the uploaded files would never reach the backend.
  timeout: API_TIMEOUT_MS
});

// Attach the Bearer token to every request and log what is going out.
apiClient.interceptors.request.use((config) => {
  const token = import.meta.env.VITE_API_BEARER_TOKEN;
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  console.log(
    '[API] ->',
    (config.method || 'get').toUpperCase(),
    config.url,
    {
      timeout: config.timeout,
      authenticated: Boolean(token),
      params: config.params || null
    }
  );

  return config;
});

// Unwrap the envelope, log the response and normalise every failure.
apiClient.interceptors.response.use(
  (response) => {
    const body = response.data;
    console.log(
      '[API] <-',
      (response.config?.method || 'get').toUpperCase(),
      response.config?.url,
      'status:', response.status,
      'success:', body?.success,
      'payload keys:', body && typeof body === 'object' ? Object.keys(body) : typeof body
    );

    // Unwrap: the caller receives the API payload, not the AxiosResponse.
    return body;
  },
  (error) => {
    console.error(
      '[API] !!',
      (error?.config?.method || 'get').toUpperCase(),
      error?.config?.url,
      'failed:',
      describeApiError(error)
    );
    console.error('[API] !! error detail:', error);

    return Promise.reject(toApiError(error));
  }
);

export default apiClient;
