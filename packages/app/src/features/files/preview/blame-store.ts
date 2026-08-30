import { create } from 'zustand';
import { BlameResult } from '@midnite/studio-shared';

export interface BlameState {
  blameByFile: Record<string, boolean>;
  blameCache: Record<string, BlameResult>;
  toggleBlame: (fileKey: string) => void;
  setBlame: (fileKey: string, result: BlameResult) => void;
}

export const useBlameStore = create<BlameState>((set) => ({
  blameByFile: {},
  blameCache: {},
  toggleBlame: (fileKey) =>
    set((state) => ({
      blameByFile: {
        ...state.blameByFile,
        [fileKey]: !state.blameByFile[fileKey],
      },
    })),
  setBlame: (fileKey, result) =>
    set((state) => ({
      blameCache: {
        ...state.blameCache,
        [fileKey]: result,
      },
    })),
}));
