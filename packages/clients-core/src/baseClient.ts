import axios, { type AxiosRequestConfig } from "axios";

export interface ClientConfig {
  /** Base URL for the API server (e.g., "http://localhost:3000") */
  baseUrl: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Optional auth token for authenticated requests */
  token?: string;
}

export interface RequestParams {
  path?: string;
  body?: unknown;
  query?: Record<string, unknown>;
}

export class BaseClient {
  protected baseUrl: string;
  protected resource: string;
  protected timeout: number;
  protected token?: string;

  constructor(resource: string, config: ClientConfig) {
    this.resource = "/" + resource;
    this.baseUrl = config.baseUrl;
    this.timeout = config.timeout ?? 30000;
    this.token = config.token;
  }

  /** Update the auth token (e.g., after login/refresh) */
  public setToken(token: string | undefined): void {
    this.token = token;
  }

  protected buildPath(params: RequestParams): string {
    return params.path ? this.resource + "/" + params.path : this.resource;
  }

  protected buildConfig(params: RequestParams): AxiosRequestConfig {
    const config: AxiosRequestConfig = {
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };

    if (this.token) {
      config.headers = {
        ...config.headers,
        Authorization: "Bearer " + this.token,
      };
    }

    if (params.query) {
      config.params = params.query;
    }

    return config;
  }

  public async get<T>(params: RequestParams = {}): Promise<T> {
    const path = this.buildPath(params);
    const config = this.buildConfig(params);
    const response = await axios.get<T>(path, config);
    return response.data;
  }

  public async post<T>(params: RequestParams = {}): Promise<T> {
    const path = this.buildPath(params);
    const config = this.buildConfig(params);
    const response = await axios.post<T>(path, params.body, config);
    return response.data;
  }

  public async put<T>(params: RequestParams = {}): Promise<T> {
    const path = this.buildPath(params);
    const config = this.buildConfig(params);
    const response = await axios.put<T>(path, params.body, config);
    return response.data;
  }

  public async patch<T>(params: RequestParams = {}): Promise<T> {
    const path = this.buildPath(params);
    const config = this.buildConfig(params);
    const response = await axios.patch<T>(path, params.body, config);
    return response.data;
  }

  public async delete<T>(params: RequestParams = {}): Promise<T> {
    const path = this.buildPath(params);
    const config = this.buildConfig(params);
    const response = await axios.delete<T>(path, config);
    return response.data;
  }
}
