import type { ComponentType } from "react";
import type { Choice } from "../components/controls";
import type { WidgetSize } from "../lib/layout";

export type Options = Record<string, any>;

export type WidgetInstance = {
  id: string;
  type: string;
  size: WidgetSize;
  style: string;
  options: Options;
  enabled: boolean;
};

export type WidgetProps = {
  w: WidgetInstance;
  setOptions: (patch: Options) => void;
  preview?: boolean;
  editing?: boolean;
};

export type Field = (
  | { key: string; label: string; type: "text" | "date" | "folder" | "toggle" | "apps" | "zones" }
  | { key: string; label: string; type: "number"; min: number; max: number; step?: number }
  | { key: string; label: string; type: "select" | "color"; choices: Choice[] }
) & { styles?: string[] };

export type WidgetDef = {
  type: string;
  name: string;
  description: string;
  sizes: WidgetSize[];
  styles: Choice[];
  defaults: Options;
  fields: Field[];
  component: ComponentType<WidgetProps>;
};

export const BASE: Record<WidgetSize, { w: number; h: number }> = {
  s: { w: 164, h: 164 },
  m: { w: 344, h: 164 },
  l: { w: 344, h: 344 },
};

export const SIZE_LABEL: Record<WidgetSize, string> = { s: "Small", m: "Medium", l: "Large" };

export const TINTS: Choice[] = [
  { value: "glass", label: "Glass" },
  { value: "#ffd60a", label: "Yellow" },
  { value: "#ff9f0a", label: "Orange" },
  { value: "#ff375f", label: "Pink" },
  { value: "#bf5af2", label: "Purple" },
  { value: "#0a84ff", label: "Blue" },
  { value: "#30d158", label: "Green" },
];

export const ZONES: Choice[] = [
  { value: "Europe/Istanbul", label: "Istanbul" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Europe/Moscow", label: "Moscow" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Kolkata", label: "Mumbai" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Shanghai", label: "Beijing" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Australia/Sydney", label: "Sydney" },
  { value: "America/New_York", label: "New York" },
  { value: "America/Chicago", label: "Chicago" },
  { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "America/Toronto", label: "Toronto" },
  { value: "America/Sao_Paulo", label: "São Paulo" },
];
