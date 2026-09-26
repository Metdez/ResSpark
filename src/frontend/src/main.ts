import "./styles.css";
import { createApp } from "./app";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("The ResSpark app root is missing.");
}

createApp(root);
