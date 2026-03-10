import React, { useState } from 'react';

interface Guardian {
  address: string;
  label?: string;
  weight: number;
  hasApproved?: boolean;
}

interface RecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  guardians: Guardian[];
  threshold: number;
  timelockHours: number;
  onInitiateRecovery: (newOwner: string) => Promise<void>;
}

export const RecoveryModal: React.FC<RecoveryModalProps> = ({
  isOpen,
  onClose,
  guardians,
  threshold,
  timelockHours,
  onInitiateRecovery,
}) => {
  const [newOwner, setNewOwner] = useState('');
  const [step, setStep] = useState<'input' | 'confirm' | 'pending'>('input');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const currentWeight = guardians.filter(g => g.hasApproved).reduce((sum, g) => sum + g.weight, 0);
  const progress = (currentWeight / threshold) * 100;

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onInitiateRecovery(newOwner);
      setStep('pending');
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-2xl p-8 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">🔐 Wallet Recovery</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        {step === 'input' && (
          <>
            <p className="text-slate-400 mb-6">
              Enter the new owner address. Guardians will need to approve this recovery request.
            </p>
            <input
              type="text"
              placeholder="New owner address..."
              value={newOwner}
              onChange={(e) => setNewOwner(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-4 mb-4"
            />
            <button
              onClick={() => setStep('confirm')}
              disabled={!newOwner}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 py-3 rounded-lg font-semibold"
            >
              Continue
            </button>
          </>
        )}

        {step === 'confirm' && (
          <>
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6">
              <p className="text-yellow-400 text-sm">
                ⚠️ This will transfer ownership to a new address. Make sure you control the new address.
              </p>
            </div>
            <div className="mb-6">
              <p className="text-sm text-slate-400 mb-2">New Owner:</p>
              <p className="font-mono text-sm bg-slate-800 p-3 rounded-lg break-all">{newOwner}</p>
            </div>
            <div className="mb-6">
              <p className="text-sm text-slate-400 mb-2">Requirements:</p>
              <ul className="text-sm space-y-1">
                <li>• {threshold} guardian weight needed</li>
                <li>• {timelockHours}h timelock after approval</li>
              </ul>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep('input')}
                className="flex-1 border border-slate-700 py-3 rounded-lg"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 bg-red-600 hover:bg-red-700 py-3 rounded-lg font-semibold"
              >
                {loading ? 'Processing...' : 'Initiate Recovery'}
              </button>
            </div>
          </>
        )}

        {step === 'pending' && (
          <>
            <div className="text-center mb-6">
              <div className="text-4xl mb-4">⏳</div>
              <p className="text-lg font-semibold">Recovery Initiated</p>
              <p className="text-slate-400">Waiting for guardian approvals</p>
            </div>
            
            <div className="mb-6">
              <div className="flex justify-between text-sm mb-2">
                <span>Approval Progress</span>
                <span>{currentWeight}/{threshold} weight</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-purple-500 transition-all"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            </div>

            <div className="space-y-3">
              {guardians.map((g, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-800 p-3 rounded-lg">
                  <div>
                    <p className="font-medium">{g.label || `Guardian ${i + 1}`}</p>
                    <p className="text-xs text-slate-500 font-mono">
                      {g.address.slice(0, 4)}...{g.address.slice(-4)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-400">Weight: {g.weight}</span>
                    {g.hasApproved ? (
                      <span className="text-green-400">✓</span>
                    ) : (
                      <span className="text-slate-600">○</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={onClose}
              className="w-full mt-6 border border-slate-700 py-3 rounded-lg"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default RecoveryModal;
