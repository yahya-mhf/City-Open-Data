import React from "react";

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface ChatContext {
  map_bounds: MapBounds | null;
  visible_sensors: string[];
}

let _chatContext: ChatContext = {
  map_bounds: null,
  visible_sensors: [],
};

const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) {
    fn();
  }
}

export function setChatContext(bounds: MapBounds | null, sensors: string[]) {
  _chatContext = { map_bounds: bounds, visible_sensors: sensors };
  notify();
}

export function getChatContext(): ChatContext {
  return _chatContext;
}

export function subscribeToChatContext(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
