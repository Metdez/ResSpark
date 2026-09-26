export type ExampleScreen = "documents" | "results";

export function getExampleScreen(search: string): ExampleScreen | null {
  const example = new URLSearchParams(search).get("example");
  return example === "documents" || example === "results" ? example : null;
}
