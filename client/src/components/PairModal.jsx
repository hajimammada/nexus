import React, { useState } from 'react';
import { X, Link2, KeyRound, Server, CheckCircle2, AlertCircle } from 'lucide-react';
import { claimPairCode } from '../utils/api';

export default function PairModal({ isOpen, onClose, onPaired, currentPairCode = '' }) {
  const [code, setCode] = useState('');
  const [relayUrl, setRelayUrl] = useState('https://nexus.hajimammad.com');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handlePair = async (e) => {
    e.preventDefault();
    if (!code || code.trim().length < 6) {
      setError('Please enter a valid 6-digit pairing PIN.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await claimPairCode(code, relayUrl);
      onPaired(data);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to connect using this PIN.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md bg-[#0f1523] border border-cyan-500/30 rounded-3xl p-6 shadow-2xl shadow-cyan-500/10 text-white">
        
        {/* Close button */}
        <button 
          onClick={onClose} 
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Link2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-black tracking-tight text-white">Pair Your PC</h3>
            <p className="text-xs text-slate-400">Zero-configuration cloud handshake</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handlePair} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2">
              Enter 6-Digit Pairing PIN from PC
            </label>
            <div className="relative">
              <input
                type="text"
                maxLength={7}
                placeholder="482-190"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
                className="w-full text-center text-3xl font-mono font-black tracking-widest py-3 rounded-2xl bg-[#090d16] border border-cyan-500/40 text-cyan-300 focus:outline-none focus:border-cyan-400 transition-all placeholder:text-slate-700"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 text-center">
              Look at your PC installer or tray agent for the active code.
            </p>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Cloud Relay Server
            </label>
            <input
              type="text"
              value={relayUrl}
              onChange={(e) => setRelayUrl(e.target.value)}
              className="w-full text-xs font-mono py-2 px-3 rounded-xl bg-[#090d16] border border-slate-800 text-slate-300 focus:outline-none focus:border-cyan-500/40"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-sm tracking-wide shadow-lg shadow-cyan-500/30 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                  <span>LINKING DEVICE...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>CONNECT TO PC</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
