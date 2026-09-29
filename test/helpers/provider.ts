import { expect } from "bun:test";

/** Decode the product's native provider protocol using fixture credentials. */
export function decodeProviderRequest(request: Request, raw: unknown) {
  expect(request.method).toBe("POST");
  expect(request.headers.get("authorization")).toBe("Bearer fixture");
  expect(new URL(request.url).pathname).toBe("/typesafe/v1/systemone");
  const body = raw as {
    model: string;
    state: unknown;
    questions: Record<string, { type: string; instructions: string }>;
  };
  expect(body.model).toBe("typesafe-ai/jev");
  expect(Object.keys(body).sort()).toEqual(["model", "questions", "state"]);
  for (const question of Object.values(body.questions)) {
    expect(question.type).toBe("noul");
    expect(typeof question.instructions).toBe("string");
  }
  return body;
}

export function wireResponse<T extends { answers: Record<string, { probability: number }> }>(
  body: T,
) {
  return {
    ...body,
    answers: Object.fromEntries(
      Object.entries(body.answers).map(([id, value]) => [
        id,
        { type: "noul", noul: value.probability },
      ]),
    ),
  };
}
