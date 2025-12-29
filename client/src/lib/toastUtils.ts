import { toast } from 'sonner';

const TOAST_COOLDOWN = 2000; // 2 seconds
const lastToastTime: Record<string, number> = {};

export const gameToast = {
  success: (message: string, id?: string) => {
    const key = id || message;
    const now = Date.now();
    if (!lastToastTime[key] || now - lastToastTime[key] > TOAST_COOLDOWN) {
      toast.success(message);
      lastToastTime[key] = now;
    }
  },
  error: (message: string, id?: string) => {
    const key = id || message;
    const now = Date.now();
    if (!lastToastTime[key] || now - lastToastTime[key] > TOAST_COOLDOWN) {
      toast.error(message);
      lastToastTime[key] = now;
    }
  },
  info: (message: string, id?: string) => {
    const key = id || message;
    const now = Date.now();
    if (!lastToastTime[key] || now - lastToastTime[key] > TOAST_COOLDOWN) {
      toast.info(message);
      lastToastTime[key] = now;
    }
  },
  warning: (message: string, id?: string) => {
    const key = id || message;
    const now = Date.now();
    if (!lastToastTime[key] || now - lastToastTime[key] > TOAST_COOLDOWN) {
      toast.warning(message);
      lastToastTime[key] = now;
    }
  }
};
