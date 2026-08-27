import React, { useState, useEffect } from 'react';
import { AlertTriangle, Moon, RotateCcw, Power, Lock, X, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function ConfirmPowerModal({ isOpen, onClose, action, onConfirm }) {
  if (!isOpen || !action) return null;

  const actionDetails = {
    sleep: {
      title: 'Put PC to Sleep',
      icon: Moon,
      iconColor: '#818cf8',
      bgColor: 'bg-indigo-500/10',
      borderColor: 'border-indigo-500/30',
      description: 'Your PC will enter low-power sleep state immediately. Network services will pause until woken up via MacroDroid.',
      buttonText: 'Confirm Sleep Now',
      buttonClass: 'bg-indigo-600 hover:bg-indigo-500 text-white'
    },
    restart: {
      title: 'Restart PC',
      icon: RotateCcw,
      iconColor: '#f59e0b',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/30',
      description: 'All running applications will close and your PC will restart immediately.',
      buttonText: 'Confirm Restart Now',
      buttonClass: 'bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold'
    },
    shutdown: {
      title: 'Shut Down PC',
      icon: Power,
      iconColor: '#f43f5e',
      bgColor: 'bg-rose-500/10',
      borderColor: 'border-rose-500/30',
      description: 'This will immediately force-close all open apps and completely shut down your PC.',
      buttonText: 'Confirm Shutdown Now',
      buttonClass: 'bg-rose-600 hover:bg-rose-500 text-white font-bold'
    },
    lock: {
      title: 'Lock PC Workstation',
      icon: Lock,
      iconColor: '#00f2fe',
      bgColor: 'bg-cyan-500/10',
      borderColor: 'border-cyan-500/30',
      description: 'Locks the current Windows user session immediately.',
      buttonText: 'Lock Workstation',
      buttonClass: 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold'
    }
  }[action] || {
    title: 'Confirm Action',
    icon: AlertTriangle,
    iconColor: '#f59e0b',
    bgColor: 'bg-slate-800',
    borderColor: 'border-slate-700',
    description: 'Are you sure you want to proceed with this system power action?',
    buttonText: 'Confirm',
    buttonClass: 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold'
  };

  const IconComponent = actionDetails.icon;

  const handleConfirmAction = () => {
    onConfirm(action);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md rounded-3xl bg-[#111728] border border-slate-700 shadow-2xl p-6 overflow-hidden animate-slide-up text-center">
        
        {/* Header Icon */}
        <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-4 border" style={{ backgroundColor: `${actionDetails.iconColor}15`, borderColor: `${actionDetails.iconColor}40` }}>
          <IconComponent className="w-8 h-8" style={{ color: actionDetails.iconColor }} />
        </div>

        {/* Title */}
        <h3 className="text-lg font-bold text-white mb-2">
          {actionDetails.title}
        </h3>

        {/* Description */}
        <p className="text-xs text-slate-300 mb-6 leading-relaxed">
          {actionDetails.description}
        </p>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirmAction}
            className={`flex-1 py-3 px-4 rounded-xl text-xs transition-all shadow-lg cursor-pointer ${actionDetails.buttonClass}`}
          >
            {actionDetails.buttonText}
          </button>
        </div>

      </div>
    </div>
  );
}
