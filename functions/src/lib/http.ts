import {onRequest} from "firebase-functions/https";

export type FunctionRequest = Parameters<Parameters<typeof onRequest>[0]>[0];
export type FunctionResponse = Parameters<Parameters<typeof onRequest>[0]>[1];

type SessionRequestBody = {
  session?: unknown;
};

export const sendStatus = (
  response: FunctionResponse,
  statusCode: number
): void => {
  response.status(statusCode).send("");
};

export const setCorsHeaders = (
  response: FunctionResponse
): void => {
  response.set("Access-Control-Allow-Origin", "*");
  response.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  response.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
};

export const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === "string" && value.trim().length > 0;
};

export const getSession = (request: FunctionRequest): unknown => {
  const body = (request.body ?? {}) as SessionRequestBody;
  return body.session ?? request.query.session;
};

export const isLocation = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const location = value as Record<string, unknown>;
  const latitude = location.latitude ?? location.lat;
  const longitude = location.longitude ?? location.lng;

  return (
    typeof latitude === "number" &&
    typeof longitude === "number"
  );
};
