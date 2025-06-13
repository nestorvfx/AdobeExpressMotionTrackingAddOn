import React from 'react';
import { ToastMessage } from '../hooks/useToast';

interface ToastProps {
  toast: ToastMessage;
}

export const Toast: React.FC<ToastProps> = ({ toast }) => {
  return (
    <div className={`toast toast-${toast.type}`}>
      {toast.message}
    </div>
  );
};
