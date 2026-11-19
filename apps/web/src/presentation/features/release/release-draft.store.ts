import { create } from 'zustand';
import type { Bump } from '@release-panel/shared';

/**
 * Estado de UI del wizard (no es dato remoto, por eso vive en Zustand y no en TanStack Query).
 * Sobrevive a la navegación entre pantallas mientras la pestaña siga abierta.
 */
export type WizardStep = 1 | 2 | 3 | 4;

interface ReleaseDraftState {
  step: WizardStep;
  selected: Record<string, boolean>;
  bumps: Record<string, Bump>;
  goTo: (step: WizardStep) => void;
  next: () => void;
  back: () => void;
  toggle: (name: string) => void;
  select: (name: string) => void;
  setBump: (name: string, bump: Bump) => void;
  reset: () => void;
}

const initial = { step: 1 as WizardStep, selected: {}, bumps: {} };

export const useReleaseDraftStore = create<ReleaseDraftState>((set) => ({
  ...initial,
  goTo: (step) => set({ step }),
  next: () => set((s) => ({ step: Math.min(4, s.step + 1) as WizardStep })),
  back: () => set((s) => ({ step: Math.max(1, s.step - 1) as WizardStep })),
  toggle: (name) => set((s) => ({ selected: { ...s.selected, [name]: !s.selected[name] } })),
  select: (name) => set((s) => ({ selected: { ...s.selected, [name]: true } })),
  setBump: (name, bump) => set((s) => ({ bumps: { ...s.bumps, [name]: bump } })),
  reset: () => set(initial),
}));
