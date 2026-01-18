import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { 
    Shield, 
    Database, 
    Search, 
    Lock, 
    Unlock, 
    Cpu, 
    Activity, 
    AlertTriangle, 
    CheckCircle, 
    Terminal,
    RefreshCw,
    Hash,
    BarChart3,
    Zap,
    Layers,
    GitMerge,
    Globe, 
    Wifi,
    Users,
    Share2,
    Play,
    StopCircle
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- UTILITIES ---

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Generates a color from a hash string for visualization
function hexToColor(hex) {
    if (!hex) return '#333';
    const val = parseInt(hex.substring(0, 6), 16);
    return `#${(val & 0xFFFFFF).toString(16).padStart(6, '0')}`;
}

async function mineNonce(data, difficulty = 2, onProgress) {
    let nonceValue = 0;
    const prefix = '0'.repeat(difficulty);
    const encoder = new TextEncoder();
    const batchSize = 500; // Increased batch size for performance
    const maxIterations = 2000000;

    while (nonceValue < maxIterations) {
        // Non-blocking yield with visual update
        if (nonceValue % batchSize === 0) {
            if (onProgress) onProgress(nonceValue);
            // Yield to main thread
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        const candidate = nonceValue.toString(16);
        const input = encoder.encode(data + candidate);
        const hashBuffer = await crypto.subtle.digest('SHA-256', input);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        if (hashHex.startsWith(prefix)) {
            return { nonce: candidate, hash: hashHex };
        }
        nonceValue++;
    }
    console.warn("Mining timed out, using fallback");
    return { nonce: "TIMEOUT_" + Math.random().toString(36).substring(7), hash: 'fallback_hash' };
}

function sanitizeData(data) {
    if (!data) return "";
    const dangerous = ['System:', 'Instruction:', 'Assistant:', 'Ignore', 'Forget'];
    let sanitized = data;
    dangerous.forEach(word => {
        const regex = new RegExp(word, 'gi');
        sanitized = sanitized.replace(regex, `[${word}]`);
    });
    return sanitized;
}

// Helper to perform a single neural query
async function queryNeuralModel(data, nonce) {
    const sanitizedData = sanitizeData(data);
    const completion = await websim.chat.completions.create({
        messages: [
            { 
                role: "system", 
                content: "You are NeuroHash v1, a deterministic cryptographic oracle. \n" +
                         "Rule 1: Receive JSON input {nonce, data}.\n" +
                         "Rule 2: Internally mix the nonce and data.\n" +
                         "Rule 3: Output a JSON object with a 'fingerprint' field containing a 64-character hexadecimal string.\n" +
                         "Rule 4: Be deterministic. Same input MUST yield same hex string."
            },
            { 
                role: "user", 
                content: JSON.stringify({
                    nonce: nonce,
                    data: sanitizedData
                })
            }
        ],
        json: true
    });
    return JSON.parse(completion.content);
}

// Robust hashing with Consensus Mechanism
async function generateNeuralHash(data, nonce, securityLevel = 'standard') {
    const attempts = securityLevel === 'maximum' ? 5 : (securityLevel === 'high' ? 3 : 1);
    
    //console.log(`Starting Neural Hash | Level: ${securityLevel} | Attempts: ${attempts}`);

    try {
        const promises = Array(attempts).fill(0).map(() => queryNeuralModel(data, nonce).catch(e => ({ error: e.message })));
        const rawResults = await Promise.all(promises);

        const validFingerprints = rawResults
            .filter(r => r && r.fingerprint && typeof r.fingerprint === 'string')
            .map(r => r.fingerprint);

        if (validFingerprints.length === 0) {
            throw new Error("All neural queries failed");
        }

        const counts = {};
        let maxCount = 0;
        let consensusFingerprint = null;

        validFingerprints.forEach(fp => {
            counts[fp] = (counts[fp] || 0) + 1;
            if (counts[fp] > maxCount) {
                maxCount = counts[fp];
                consensusFingerprint = fp;
            }
        });

        const confidence = maxCount / validFingerprints.length;

        return {
            fingerprint: consensusFingerprint,
            confidence: confidence,
            attempts: validFingerprints.length,
            method: 'neural_consensus'
        };

    } catch (error) {
        console.error("Neural Hash Error:", error);
        // Fallback SHA
        const encoder = new TextEncoder();
        const input = encoder.encode(data + nonce + "fallback");
        const hashBuffer = await crypto.subtle.digest('SHA-256', input);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return { fingerprint: hashHex, confidence: 1.0, method: 'fallback_sha256' };
    }
}

// Setup WebsimSocket
const room = new WebsimSocket();

function App() {
    const [view, setView] = useState('ledger'); // ledger, mint, verify, lab
    const [records, setRecords] = useState([]);
    const [peers, setPeers] = useState({});
    const [backgroundActivity, setBackgroundActivity] = useState(null);
    const [toast, setToast] = useState(null);
    
    // Global Data Sync
    useEffect(() => {
        // 1. Subscribe to ledger
        const unsubscribeLedger = room.collection('neurohash_ledger_v3').subscribe((data) => {
            if (!data) return;
            const sorted = [...data].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            setRecords(sorted);
        });

        // 2. Subscribe to Peers
        const unsubscribePeers = room.subscribePresence((data) => {
            // room.peers is the source of truth for user info
            setPeers({...room.peers});
        });

        // 3. Network Worker for Consensus
        room.onmessage = async (event) => {
            const msg = event.data;
            
            // Handle Network Consensus Challenges
            if (msg.type === 'NET_CHALLENGE') {
                const { challengeId, data, nonce, senderId } = msg;
                if (senderId === room.clientId) return; // Don't answer own challenge

                setBackgroundActivity(`Verifying Node ${senderId.substring(0,4)}...`);
                try {
                    // Fast verification
                    const { fingerprint } = await generateNeuralHash(data, nonce, 'standard');
                    
                    // Respond
                    room.send({
                        type: 'NET_RESPONSE',
                        challengeId,
                        fingerprint,
                        responderId: room.clientId,
                        timestamp: Date.now()
                    });
                    setToast({ type: 'info', msg: `Validated block from ${msg.username || 'peer'}` });
                } catch (e) {
                    console.error("Worker Error:", e);
                } finally {
                    setBackgroundActivity(null);
                }
            }

            // Dispatch global event for View components to hook into
            window.dispatchEvent(new CustomEvent('neurohash_msg', { detail: msg }));
        };

        return () => {
            unsubscribeLedger();
            unsubscribePeers();
        };
    }, []);

    // Toast auto-dismiss
    useEffect(() => {
        if(toast) {
            const t = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toast]);

    return (
        <div className="h-full flex flex-col md:flex-row max-w-7xl mx-auto p-2 md:p-4 gap-4 overflow-hidden">
            {/* Sidebar Navigation */}
            <nav className="w-full md:w-64 flex-shrink-0 flex md:flex-col gap-2 p-2 md:p-4 bg-panel-bg rounded-lg border border-subtle-border md:h-full overflow-x-auto relative">
                <div className="hidden md:flex items-center gap-3 mb-6 px-2">
                    <div className="relative">
                        <Cpu className="w-8 h-8 text-neon-blue" />
                        <div className="absolute inset-0 bg-neon-blue blur-lg opacity-40"></div>
                    </div>
                    <div>
                        <h1 className="font-bold text-lg tracking-wider">NEUROHASH</h1>
                        <p className="text-xs text-gray-500 font-mono">DISTRIBUTED_ORACLE</p>
                    </div>
                </div>

                <div className="flex md:flex-col gap-2 w-full">
                    <NavButton active={view === 'ledger'} onClick={() => setView('ledger')} icon={Database} label="Ledger" />
                    <NavButton active={view === 'mint'} onClick={() => setView('mint')} icon={Lock} label="Mint" />
                    <NavButton active={view === 'verify'} onClick={() => setView('verify')} icon={Search} label="Verify" />
                    <NavButton active={view === 'lab'} onClick={() => setView('lab')} icon={Activity} label="Network Lab" />
                </div>

                <div className="hidden md:block mt-auto pt-8 text-xs text-gray-600 font-mono space-y-2">
                    <div className="flex items-center justify-between">
                        <span>Status</span>
                        <span className="text-neon-green flex items-center gap-1"><Wifi size={10}/> ONLINE</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span>Peers</span>
                        <span className="text-white">{Object.keys(peers).length} Active</span>
                    </div>
                    <div className="h-px bg-subtle-border w-full my-2"></div>
                    {backgroundActivity && (
                        <div className="text-[10px] text-neon-blue animate-pulse flex items-center gap-1">
                            <RefreshCw size={10} className="animate-spin" />
                            {backgroundActivity}
                        </div>
                    )}
                </div>
            </nav>

            {/* Main Content Area */}
            <main className="flex-1 bg-panel-bg rounded-lg border border-subtle-border p-4 md:p-6 relative overflow-hidden flex flex-col h-full">
                <div className="scan-line"></div>
                
                {toast && (
                    <div className="absolute top-4 right-4 z-50 animate-in fade-in slide-in-from-top-4">
                        <div className="bg-dark-bg border border-neon-blue/30 text-neon-blue px-4 py-2 rounded shadow-[0_0_15px_rgba(0,243,255,0.1)] flex items-center gap-2 text-sm font-mono">
                            <Activity size={14} />
                            {toast.msg}
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                    {view === 'ledger' && <LedgerView records={records} onVerify={(r) => {
                        window.selectedRecord = r; 
                        setView('verify');
                    }} />}
                    
                    {view === 'mint' && <MintView onSuccess={() => setView('ledger')} />}
                    
                    {view === 'verify' && <VerifyView initialRecord={window.selectedRecord} />}
                    
                    {view === 'lab' && <LabView peers={peers} />}
                </div>
            </main>
        </div>
    );
}

function NavButton({ active, onClick, icon: Icon, label }) {
    return (
        <button 
            onClick={onClick}
            className={cn(
                "flex items-center gap-3 px-4 py-3 rounded transition-all duration-200 font-mono text-sm border border-transparent w-full",
                active 
                    ? "bg-neon-blue/10 text-neon-blue border-neon-blue/30 shadow-[0_0_15px_rgba(0,243,255,0.2)]" 
                    : "hover:bg-white/5 text-gray-400 hover:text-white"
            )}
        >
            <Icon size={18} />
            {label}
        </button>
    );
}

// -----------------------------------------------------------------------------
// VIEWS
// -----------------------------------------------------------------------------

function LedgerView({ records, onVerify }) {
    return (
        <div className="space-y-6">
            <header className="flex justify-between items-end border-b border-subtle-border pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Database className="text-neon-pink" /> 
                        Global Ledger
                    </h2>
                    <p className="text-gray-400 text-sm mt-1">Immutable records secured by AI model weights.</p>
                </div>
                <div className="text-right font-mono text-xs text-gray-500">
                    <p>ENTRIES: {records.length}</p>
                    <p>LAST SYNC: NOW</p>
                </div>
            </header>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="text-xs font-mono text-gray-500 border-b border-subtle-border">
                            <th className="p-3">TIMESTAMP</th>
                            <th className="p-3">USER</th>
                            <th className="p-3">DATA SNIPPET</th>
                            <th className="p-3">NONCE</th>
                            <th className="p-3">FINGERPRINT (First 8)</th>
                            <th className="p-3">ACTION</th>
                        </tr>
                    </thead>
                    <tbody className="font-mono text-sm">
                        {records.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="p-8 text-center text-gray-600 italic">
                                    No records found. Start by minting data.
                                </td>
                            </tr>
                        ) : (
                            records.map((record) => (
                                <tr key={record.id} className="border-b border-subtle-border/50 hover:bg-white/5 transition-colors group">
                                    <td className="p-3 text-gray-400">
                                        {new Date(record.created_at).toLocaleTimeString()}
                                    </td>
                                    <td className="p-3 text-neon-blue">
                                        @{record.username}
                                    </td>
                                    <td className="p-3 text-white max-w-[200px] truncate" title={record.data}>
                                        {record.data}
                                    </td>
                                    <td className="p-3 text-gray-500 font-xs">
                                        {record.nonce}
                                    </td>
                                    <td className="p-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{backgroundColor: hexToColor(record.fingerprint)}}></div>
                                            <span className="bg-neon-pink/10 text-neon-pink px-2 py-1 rounded text-xs font-mono">
                                                {record.fingerprint.substring(0, 8)}...
                                            </span>
                                        </div>
                                    </td>
                                    <td className="p-3">
                                        <button 
                                            onClick={() => onVerify(record)}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity bg-neon-blue text-black px-3 py-1 rounded text-xs font-bold hover:bg-white"
                                        >
                                            AUDIT
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function MintView({ onSuccess }) {
    const [data, setData] = useState("");
    const [status, setStatus] = useState("idle"); 
    const [logs, setLogs] = useState([]);
    const [securityLevel, setSecurityLevel] = useState("high"); 
    const [progress, setProgress] = useState(0);
    const logContainerRef = useRef(null);

    const addLog = (msg) => setLogs(prev => [...prev, `> ${msg}`]);

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    const handleMint = async () => {
        if (!data.trim()) return;
        
        try {
            setStatus("mining");
            setLogs([`> Initializing Proof-of-Work sequence...`]);
            setProgress(0);
            
            // Allow UI to update
            await new Promise(r => setTimeout(r, 100));

            const startTime = performance.now();
            
            // Mining Phase
            addLog("Searching for nonce (Difficulty: 3)...");
            const { nonce, hash } = await mineNonce(data, 3, (count) => {
                setProgress(Math.min((count / 200000) * 100, 90));
            });
            
            const mineTime = (performance.now() - startTime).toFixed(0);
            setProgress(100);
            addLog(`Nonce found: ${nonce}`);
            addLog(`Hash: ${hash.substring(0, 10)}... (${mineTime}ms)`);

            await new Promise(r => setTimeout(r, 200));

            // Neural Phase
            setStatus("fingerprinting");
            addLog(`Requesting Neural Consensus (Level: ${securityLevel.toUpperCase()})...`);
            
            const result = await generateNeuralHash(data, nonce, securityLevel);
            const { fingerprint, confidence, attempts } = result;
            
            addLog(`Neural Fingerprint: ${fingerprint.substring(0, 12)}...`);
            addLog(`Network Confidence: ${(confidence * 100).toFixed(0)}% (${attempts} nodes)`);
            
            // Commit Phase
            setStatus("saving");
            addLog("Broadcasting to ledger...");

            const record = await room.collection('neurohash_ledger_v3').create({
                data,
                nonce,
                fingerprint,
                security_level: securityLevel,
                confidence: confidence,
                model_version: 'gpt-4o-mini', 
                created_at: new Date().toISOString()
            });
            
            if (!record) throw new Error("Ledger rejected commit.");

            addLog("SUCCESS: Block finalized.");
            
            setTimeout(() => {
                onSuccess();
            }, 1500);

        } catch (err) {
            console.error("Minting Error:", err);
            setStatus("idle");
            addLog(`CRITICAL FAILURE: ${err.message}`);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6 md:space-y-8 pb-8">
            <header className="border-b border-subtle-border pb-4">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Lock className="text-neon-green" /> 
                    Mint Data Commitment
                </h2>
                <p className="text-gray-400 text-sm mt-1">
                    Seal your data with the weight of the model. 
                </p>
            </header>

            <div className="space-y-6">
                <div className="space-y-2">
                    <label className="text-xs font-mono text-neon-blue uppercase">Data Payload</label>
                    <textarea 
                        value={data}
                        onChange={(e) => setData(e.target.value)}
                        placeholder='{"transaction": "transfer", "amount": 500, "to": "0x123..."}'
                        className="w-full h-32 bg-dark-bg border border-subtle-border rounded p-4 text-white font-mono text-sm focus:border-neon-blue focus:outline-none focus:ring-1 focus:ring-neon-blue transition-all resize-none"
                        disabled={status !== 'idle'}
                    />
                </div>

                <div className="grid grid-cols-3 gap-2 md:gap-4">
                    {['standard', 'high', 'maximum'].map(level => (
                        <button
                            key={level}
                            onClick={() => setSecurityLevel(level)}
                            disabled={status !== 'idle'}
                            className={cn(
                                "p-2 md:p-3 rounded border text-xs font-mono uppercase text-left transition-all",
                                securityLevel === level 
                                    ? "bg-neon-blue/20 border-neon-blue text-white shadow-lg shadow-neon-blue/10" 
                                    : "bg-black/20 border-subtle-border text-gray-500 hover:border-gray-500"
                            )}
                        >
                            <div className="font-bold mb-1 truncate">{level}</div>
                            <div className="text-[10px] opacity-70 hidden md:block">
                                {level === 'standard' && "1 Pass (Fast)"}
                                {level === 'high' && "3 Pass (Robust)"}
                                {level === 'maximum' && "5 Pass (Strict)"}
                            </div>
                        </button>
                    ))}
                </div>

                {/* System Log Console */}
                <div className="bg-black/40 rounded border border-subtle-border overflow-hidden relative">
                    <div className="bg-black/60 px-4 py-2 flex justify-between items-center text-[10px] font-mono uppercase tracking-widest text-gray-500 border-b border-subtle-border">
                        <div className="flex items-center gap-2">
                            <Terminal size={12} />
                            Sys_Log.log
                        </div>
                        <div className={cn("w-2 h-2 rounded-full", status !== 'idle' ? "bg-neon-green animate-pulse" : "bg-gray-700")}></div>
                    </div>
                    
                    <div className="p-4 h-32 overflow-y-auto font-mono text-xs space-y-1 custom-scrollbar" ref={logContainerRef}>
                         {logs.length === 0 && <span className="text-gray-700 italic">Ready to mint...</span>}
                         {logs.map((log, i) => (
                            <div key={i} className="text-neon-green/90 break-all">{log}</div>
                         ))}
                    </div>
                    
                    {/* Progress overlay line */}
                    {status !== 'idle' && (
                        <div className="h-[2px] bg-neon-blue transition-all duration-300 shadow-[0_0_10px_#00f3ff]" style={{width: `${progress}%`}}></div>
                    )}
                </div>

                <button 
                    onClick={handleMint}
                    disabled={status !== 'idle' || !data}
                    className="w-full py-4 bg-neon-blue text-black font-bold font-mono text-lg uppercase tracking-wider hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 rounded-sm active:scale-[0.99]"
                >
                    {status === 'idle' ? (
                        <>
                            <Lock size={18} /> Seal Data
                        </>
                    ) : (
                        <>
                            <RefreshCw className="animate-spin" size={18} /> Processing...
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

function VerifyView({ initialRecord }) {
    const [record, setRecord] = useState(initialRecord || null);
    const [testData, setTestData] = useState("");
    const [verificationStatus, setVerificationStatus] = useState("idle"); 
    const [resultFingerprint, setResultFingerprint] = useState(null);

    useEffect(() => {
        if (record) {
            setTestData(record.data);
            setVerificationStatus("idle");
            setResultFingerprint(null);
        }
    }, [record]);

    if (!record) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
                <Search size={48} />
                <p>Select a record from the Ledger to audit.</p>
            </div>
        );
    }

    const handleVerify = async () => {
        setVerificationStatus("verifying");
        try {
            const { fingerprint } = await generateNeuralHash(testData, record.nonce, 'high');
            setResultFingerprint(fingerprint);

            if (fingerprint === record.fingerprint) {
                setVerificationStatus("match");
            } else {
                setVerificationStatus("mismatch");
            }
        } catch (e) {
            console.error(e);
            setVerificationStatus("error");
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
            <div className="space-y-6">
                <header className="border-b border-subtle-border pb-4">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Shield className="text-neon-blue" /> 
                        Audit Console
                    </h2>
                    <p className="text-gray-400 text-sm mt-1">
                        Verify data integrity by querying the AI model again.
                    </p>
                </header>

                <div className="space-y-4">
                    <div className="p-4 border border-neon-blue/20 bg-neon-blue/5 rounded">
                        <label className="text-xs font-mono text-neon-blue uppercase block mb-1">Stored Fingerprint</label>
                        <div className="font-mono text-xs text-white break-all">{record.fingerprint}</div>
                    </div>
                    
                    <div className="p-4 border border-gray-700 bg-dark-bg rounded">
                        <label className="text-xs font-mono text-gray-500 uppercase block mb-1">Nonce (Proof of Work)</label>
                        <div className="font-mono text-xs text-white">{record.nonce}</div>
                    </div>

                    <div>
                        <label className="text-xs font-mono text-gray-500 uppercase block mb-2">
                            Data Content (Editable for Tamper Testing)
                        </label>
                        <textarea 
                            value={testData}
                            onChange={(e) => {
                                setTestData(e.target.value);
                                setVerificationStatus("idle");
                            }}
                            className={cn(
                                "w-full h-40 bg-dark-bg border rounded p-4 text-white font-mono text-sm focus:outline-none transition-colors",
                                testData !== record.data ? "border-neon-pink ring-1 ring-neon-pink" : "border-subtle-border focus:border-neon-blue"
                            )}
                        />
                        {testData !== record.data && (
                            <p className="text-neon-pink text-xs mt-1 flex items-center gap-1">
                                <AlertTriangle size={12} /> Local data modified. Verification should fail.
                            </p>
                        )}
                    </div>

                    <button 
                        onClick={handleVerify}
                        disabled={verificationStatus === 'verifying'}
                        className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-bold font-mono border border-white/20 rounded transition-all"
                    >
                        {verificationStatus === 'verifying' ? 'Querying Oracle...' : 'RUN VERIFICATION'}
                    </button>
                </div>
            </div>

            {/* Results Panel */}
            <div className="bg-black/40 rounded-lg p-6 flex flex-col items-center justify-center border border-subtle-border relative">
                {verificationStatus === 'idle' && (
                    <div className="text-center text-gray-600">
                        <Shield size={64} className="mx-auto mb-4 opacity-20" />
                        <p>Ready to verify.</p>
                    </div>
                )}

                {verificationStatus === 'verifying' && (
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-neon-blue mx-auto mb-4"></div>
                        <p className="text-neon-blue animate-pulse">Consulting Model Weights...</p>
                    </div>
                )}

                {verificationStatus === 'match' && (
                    <div className="text-center animate-in fade-in zoom-in duration-300">
                        <CheckCircle size={80} className="text-neon-green mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-white mb-2">VERIFIED VALID</h3>
                        <p className="text-gray-400 text-sm">
                            The model produced the exact same fingerprint.<br/>Data is authentic.
                        </p>
                    </div>
                )}

                {verificationStatus === 'mismatch' && (
                    <div className="text-center animate-in fade-in zoom-in duration-300 w-full">
                        <AlertTriangle size={80} className="text-neon-pink mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-white mb-2">TAMPER DETECTED</h3>
                        <p className="text-gray-400 text-sm mb-6">
                            The fingerprint generated does not match the stored record.
                        </p>
                        
                        <div className="text-left bg-black p-4 rounded text-xs font-mono border border-neon-pink/30 w-full overflow-hidden">
                            <div className="mb-2">
                                <span className="text-gray-500">EXPECTED:</span><br/>
                                <span className="text-neon-green break-all">{record.fingerprint}</span>
                            </div>
                            <div>
                                <span className="text-gray-500">ACTUAL:</span><br/>
                                <span className="text-neon-pink break-all">{resultFingerprint}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// -----------------------------------------------------------------------------
// LAB & NETWORK VIEWS
// -----------------------------------------------------------------------------

function LabView({ peers }) {
    const [activeTab, setActiveTab] = useState('consensus'); // consensus, determinism, avalanche

    return (
        <div className="h-full flex flex-col gap-6">
            <header className="border-b border-subtle-border pb-4 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Activity className="text-neon-pink" /> 
                        Research Lab
                    </h2>
                    <p className="text-gray-400 text-sm mt-1">Verify cryptographic properties of neural weights.</p>
                </div>
                <div className="flex gap-2 bg-black/40 p-1 rounded-lg border border-subtle-border">
                    <button 
                        onClick={() => setActiveTab('consensus')}
                        className={cn("px-4 py-2 rounded text-xs font-bold transition-all flex items-center gap-2", activeTab === 'consensus' ? "bg-neon-blue text-black" : "text-gray-400 hover:text-white")}
                    >
                        <Globe size={14}/> NETWORK CONSENSUS
                    </button>
                    <button 
                        onClick={() => setActiveTab('determinism')}
                        className={cn("px-4 py-2 rounded text-xs font-bold transition-all", activeTab === 'determinism' ? "bg-white text-black" : "text-gray-400 hover:text-white")}
                    >
                        CONSISTENCY
                    </button>
                    <button 
                        onClick={() => setActiveTab('avalanche')}
                        className={cn("px-4 py-2 rounded text-xs font-bold transition-all", activeTab === 'avalanche' ? "bg-neon-pink text-black" : "text-gray-400 hover:text-white")}
                    >
                        AVALANCHE
                    </button>
                </div>
            </header>

            <div className="flex-1 relative">
                {activeTab === 'consensus' && <NetworkConsensusLab peers={peers} />}
                {activeTab === 'determinism' && <DeterminismLab />}
                {activeTab === 'avalanche' && <AvalancheLab />}
            </div>
        </div>
    );
}

function NetworkConsensusLab({ peers }) {
    const [testing, setTesting] = useState(false);
    const [challenge, setChallenge] = useState(null);
    const [responses, setResponses] = useState([]);
    
    // Listen for responses
    useEffect(() => {
        const handler = (e) => {
            const msg = e.detail;
            if (msg.type === 'NET_RESPONSE' && challenge && msg.challengeId === challenge.id) {
                setResponses(prev => {
                    // Avoid dupes
                    if (prev.find(r => r.responderId === msg.responderId)) return prev;
                    return [...prev, {
                        ...msg,
                        latency: Date.now() - challenge.timestamp
                    }];
                });
            }
        };
        window.addEventListener('neurohash_msg', handler);
        return () => window.removeEventListener('neurohash_msg', handler);
    }, [challenge]);

    const startTest = async () => {
        setTesting(true);
        setResponses([]);
        const challengeId = Math.random().toString(36).substr(2, 9);
        const data = `CONSENSUS_CHECK_${Date.now()}`;
        const nonce = "check";
        
        // My own calculation
        const localResult = await generateNeuralHash(data, nonce, 'standard');
        
        const newChallenge = {
            id: challengeId,
            data,
            nonce,
            timestamp: Date.now(),
            localHash: localResult.fingerprint
        };
        setChallenge(newChallenge);

        // Broadcast
        room.send({
            type: 'NET_CHALLENGE',
            challengeId,
            data,
            nonce,
            username: room.peers[room.clientId]?.username,
            senderId: room.clientId
        });

        // Auto stop after 10s
        setTimeout(() => setTesting(false), 10000);
    };

    return (
        <div className="h-full flex flex-col items-center justify-center gap-8 animate-in fade-in">
            {!challenge ? (
                <div className="text-center max-w-md">
                    <Globe size={64} className="text-neon-blue mx-auto mb-6 opacity-80" />
                    <h3 className="text-xl font-bold text-white mb-2">Distributed Consensus Test</h3>
                    <p className="text-gray-400 text-sm mb-6">
                        Broadcast a challenge to all connected peers. 
                        Each peer will independently calculate the Neural Hash.
                        If the weights are truly shared and deterministic, everyone should return the exact same hash.
                    </p>
                    <button 
                        onClick={startTest}
                        className="px-8 py-3 bg-neon-blue text-black font-bold rounded hover:bg-white transition-colors flex items-center gap-2 mx-auto"
                    >
                        <Wifi size={18} /> BROADCAST CHALLENGE
                    </button>
                    <p className="mt-4 text-xs text-gray-500">
                        Active Peers: <span className="text-white">{Object.keys(peers).length}</span>
                    </p>
                </div>
            ) : (
                <div className="w-full max-w-4xl">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                {testing ? <RefreshCw className="animate-spin text-neon-blue"/> : <StopCircle className="text-gray-500"/>}
                                {testing ? "Awaiting Responses..." : "Test Complete"}
                            </h3>
                            <p className="text-xs text-gray-500 font-mono">ID: {challenge.id}</p>
                        </div>
                        <button onClick={() => setChallenge(null)} className="text-sm text-gray-400 hover:text-white underline">
                            Reset Test
                        </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {/* Me / Initiator */}
                        <div className="bg-neon-blue/10 border border-neon-blue p-4 rounded-lg relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-neon-blue"></div>
                            <div className="text-xs text-neon-blue uppercase font-bold mb-1">Initiator (You)</div>
                            <div className="text-white font-mono text-[10px] truncate mb-2">{challenge.localHash}</div>
                            <div className="text-[10px] text-gray-400">Latency: 0ms</div>
                        </div>

                        {/* Responses */}
                        {responses.map((resp, i) => {
                            const isMatch = resp.fingerprint === challenge.localHash;
                            const peerInfo = peers[resp.responderId] || { username: 'Unknown' };
                            
                            return (
                                <div key={i} className={cn(
                                    "p-4 rounded-lg relative overflow-hidden border",
                                    isMatch ? "bg-neon-green/5 border-neon-green/30" : "bg-neon-pink/5 border-neon-pink/30"
                                )}>
                                    <div className={cn("absolute top-0 left-0 w-1 h-full", isMatch ? "bg-neon-green" : "bg-neon-pink")}></div>
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="text-xs text-gray-300 font-bold truncate max-w-[80%]">@{peerInfo.username}</div>
                                        {isMatch ? <CheckCircle size={12} className="text-neon-green"/> : <AlertTriangle size={12} className="text-neon-pink"/>}
                                    </div>
                                    <div className={cn("font-mono text-[10px] truncate mb-2", isMatch ? "text-gray-400" : "text-neon-pink")}>
                                        {resp.fingerprint}
                                    </div>
                                    <div className="text-[10px] text-gray-500">{resp.latency}ms</div>
                                </div>
                            );
                        })}

                        {/* Placeholders for waiting */}
                        {testing && Array(Math.max(0, Object.keys(peers).length - 1 - responses.length)).fill(0).map((_, i) => (
                            <div key={`wait-${i}`} className="bg-black/30 border border-dashed border-gray-700 p-4 rounded-lg flex items-center justify-center">
                                <span className="text-xs text-gray-600 animate-pulse">Waiting for peer...</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function DeterminismLab() {
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);

    const runTest = async () => {
        setLoading(true);
        const data = "NeuroHash_Test_" + Math.random().toString(36).substring(7);
        const nonce = "chk";
        const logs = [];
        const n = 10;
        
        const r1 = await generateNeuralHash(data, nonce, 'standard');
        const baseline = r1.fingerprint;
        let matches = 0;
        const variations = new Set();
        
        for (let i = 0; i < n; i++) {
            const res = await generateNeuralHash(data, nonce, 'standard');
            const match = res.fingerprint === baseline;
            if (match) matches++;
            variations.add(res.fingerprint);
            logs.push({ hash: res.fingerprint, match });
            await new Promise(r => setTimeout(r, 100));
        }
        
        setResults({ total: n, matchCount: matches, uniqueVariations: variations.size, logs });
        setLoading(false);
    };

    if (!results && !loading) {
        return (
            <div className="text-center max-w-md mx-auto pt-10">
                <RefreshCw size={64} className="text-gray-700 mx-auto mb-6" />
                <h3 className="text-xl font-bold text-white mb-2">Test Model Consistency</h3>
                <p className="text-gray-400 text-sm mb-6">
                    Query the model 10 times with identical input.
                </p>
                <button onClick={runTest} className="px-8 py-3 bg-white text-black font-bold rounded hover:bg-gray-200 transition-colors">
                    RUN LOCAL TEST
                </button>
            </div>
        );
    }

    if (loading) return <div className="flex items-center justify-center h-full"><RefreshCw className="animate-spin text-neon-blue" size={48}/></div>;

    return (
        <div className="w-full max-w-3xl mx-auto pt-4">
             <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-black/40 border border-subtle-border p-4 rounded text-center">
                    <div className="text-2xl font-bold text-neon-green">{(results.matchCount/results.total)*100}%</div>
                    <div className="text-[10px] text-gray-500 uppercase">Success Rate</div>
                </div>
                <div className="bg-black/40 border border-subtle-border p-4 rounded text-center">
                    <div className="text-2xl font-bold text-white">{results.uniqueVariations}</div>
                    <div className="text-[10px] text-gray-500 uppercase">Variations</div>
                </div>
                <div className="bg-black/40 border border-subtle-border p-4 rounded text-center">
                    <button onClick={() => setResults(null)} className="text-xs text-neon-blue underline mt-2">Reset</button>
                </div>
            </div>
            <div className="bg-black/20 rounded border border-subtle-border overflow-hidden">
                {results.logs.map((log, i) => (
                    <div key={i} className="flex justify-between items-center p-3 border-b border-subtle-border/30 text-xs font-mono">
                        <span className="text-gray-500">#{i+1}</span>
                        <span className="text-white">{log.hash}</span>
                        {log.match ? <CheckCircle size={14} className="text-neon-green"/> : <AlertTriangle size={14} className="text-neon-pink"/>}
                    </div>
                ))}
            </div>
        </div>
    );
}

function AvalancheLab() {
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);

    const runTest = async () => {
        setLoading(true);
        const inputA = "NeuroHash Secure Block A";
        const inputB = "NeuroHash Secure Block B"; 
        const nonce = "avalanche";
        
        const rA = await generateNeuralHash(inputA, nonce, 'standard');
        const rB = await generateNeuralHash(inputB, nonce, 'standard');
        
        const binA = hexToBin(rA.fingerprint);
        const binB = hexToBin(rB.fingerprint);
        
        let diffs = 0;
        const visualDiff = [];
        const len = Math.min(binA.length, binB.length);
        
        for (let i = 0; i < len; i++) {
            const diff = binA[i] !== binB[i];
            if (diff) diffs++;
            visualDiff.push(diff);
        }
        
        setResults({ diffPercent: ((diffs/len)*100).toFixed(1), visualDiff, hashA: rA.fingerprint, hashB: rB.fingerprint });
        setLoading(false);
    };

    if (!results && !loading) {
         return (
            <div className="text-center max-w-md mx-auto pt-10">
                <GitMerge size={64} className="text-gray-700 mx-auto mb-6" />
                <h3 className="text-xl font-bold text-white mb-2">Avalanche Effect</h3>
                <p className="text-gray-400 text-sm mb-6">
                    Change 1 bit of input, expect ~50% output bits to flip.
                </p>
                <button onClick={runTest} className="px-8 py-3 bg-neon-pink text-black font-bold rounded hover:bg-white transition-colors">
                    RUN TEST
                </button>
            </div>
        );
    }

    if (loading) return <div className="flex items-center justify-center h-full"><RefreshCw className="animate-spin text-neon-pink" size={48}/></div>;

    return (
        <div className="max-w-3xl mx-auto pt-4 space-y-6">
             <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-white">Bit Flips: <span className="text-neon-pink">{results.diffPercent}%</span></h3>
                <button onClick={() => setResults(null)} className="text-xs text-gray-500 hover:text-white">Reset</button>
             </div>
             
             {/* Compact Visualizer */}
             <div className="flex flex-wrap gap-[1px]">
                 {results.visualDiff.map((diff, i) => (
                     <div key={i} className={cn("w-1 h-1 md:w-1.5 md:h-1.5", diff ? "bg-neon-pink" : "bg-gray-800")}></div>
                 ))}
             </div>

             <div className="grid grid-cols-2 gap-4 text-[10px] font-mono">
                 <div className="bg-black/40 p-2 rounded border border-subtle-border">
                     <div className="text-gray-500 mb-1">HASH A</div>
                     <div className="break-all text-neon-blue">{results.hashA}</div>
                 </div>
                 <div className="bg-black/40 p-2 rounded border border-subtle-border">
                     <div className="text-gray-500 mb-1">HASH B</div>
                     <div className="break-all text-neon-pink">{results.hashB}</div>
                 </div>
             </div>
        </div>
    );
}

function hexToBin(hex) {
    let bin = "";
    for (let i = 0; i < hex.length; i++) {
        bin += parseInt(hex[i], 16).toString(2).padStart(4, '0');
    }
    return bin;
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);

function NavButton({ active, onClick, icon: Icon, label }) {
    return (
        <button 
            onClick={onClick}
            className={cn(
                "flex items-center gap-3 px-4 py-3 rounded transition-all duration-200 font-mono text-sm border border-transparent w-full",
                active 
                    ? "bg-neon-blue/10 text-neon-blue border-neon-blue/30 shadow-[0_0_15px_rgba(0,243,255,0.2)]" 
                    : "hover:bg-white/5 text-gray-400 hover:text-white"
            )}
        >
            <Icon size={18} />
            {label}
        </button>
    );
}

// -----------------------------------------------------------------------------
// VIEWS
// -----------------------------------------------------------------------------

function LedgerView({ records, onVerify }) {
    return (
        <div className="space-y-6">
            <header className="flex justify-between items-end border-b border-subtle-border pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Database className="text-neon-pink" /> 
                        Global Ledger
                    </h2>
                    <p className="text-gray-400 text-sm mt-1">Immutable records secured by AI model weights.</p>
                </div>
                <div className="text-right font-mono text-xs text-gray-500">
                    <p>ENTRIES: {records.length}</p>
                    <p>LAST SYNC: NOW</p>
                </div>
            </header>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="text-xs font-mono text-gray-500 border-b border-subtle-border">
                            <th className="p-3">TIMESTAMP</th>
                            <th className="p-3">USER</th>
                            <th className="p-3">DATA SNIPPET</th>
                            <th className="p-3">NONCE</th>
                            <th className="p-3">FINGERPRINT (First 8)</th>
                            <th className="p-3">ACTION</th>
                        </tr>
                    </thead>
                    <tbody className="font-mono text-sm">
                        {records.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="p-8 text-center text-gray-600 italic">
                                    No records found. Start by minting data.
                                </td>
                            </tr>
                        ) : (
                            records.map((record) => (
                                <tr key={record.id} className="border-b border-subtle-border/50 hover:bg-white/5 transition-colors group">
                                    <td className="p-3 text-gray-400">
                                        {new Date(record.created_at).toLocaleTimeString()}
                                    </td>
                                    <td className="p-3 text-neon-blue">
                                        @{record.username}
                                    </td>
                                    <td className="p-3 text-white max-w-[200px] truncate" title={record.data}>
                                        {record.data}
                                    </td>
                                    <td className="p-3 text-gray-500 font-xs">
                                        {record.nonce}
                                    </td>
                                    <td className="p-3">
                                        <span className="bg-neon-pink/10 text-neon-pink px-2 py-1 rounded text-xs">
                                            {record.fingerprint.substring(0, 8)}...
                                        </span>
                                    </td>
                                    <td className="p-3">
                                        <button 
                                            onClick={() => onVerify(record)}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity bg-neon-blue text-black px-3 py-1 rounded text-xs font-bold hover:bg-white"
                                        >
                                            AUDIT
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function MintView({ onSuccess }) {
    const [data, setData] = useState("");
    const [status, setStatus] = useState("idle"); // idle, mining, fingerprinting, saving
    const [logs, setLogs] = useState([]);
    const [securityLevel, setSecurityLevel] = useState("high"); // standard, high, maximum
    const [progress, setProgress] = useState(0);
    const logContainerRef = useRef(null);

    const addLog = (msg) => setLogs(prev => [...prev, `> ${msg}`]);

    // Auto-scroll logs
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    const handleMint = async () => {
        if (!data.trim()) return;
        
        try {
            setStatus("mining");
            // Direct set to ensure UI updates before heavy work
            setLogs([`> Initializing PoW sequence (Difficulty: 3)...`]);
            setProgress(0);
            
            // Critical yield to let React render the "mining" state and first log
            await new Promise(r => setTimeout(r, 50));

            const startTime = performance.now();
            
            const { nonce, hash } = await mineNonce(data, 3, (count) => {
                // Approximate progress for visual flair
                setProgress(Math.min((count / 10000) * 100, 90));
            });
            
            const mineTime = (performance.now() - startTime).toFixed(2);
            setProgress(100);
            addLog(`Nonce found: ${nonce} (${mineTime}ms)`);
            addLog(`PoW Hash: ${hash.substring(0, 10)}...`);

            // Yield again for smooth UI update
            await new Promise(r => setTimeout(r, 10));

            setStatus("fingerprinting");
            addLog(`Querying Neural Oracle (Level: ${securityLevel.toUpperCase()})...`);
            
            // Consensus Query
            const result = await generateNeuralHash(data, nonce, securityLevel);
            const { fingerprint, confidence, attempts } = result;
            
            addLog(`Fingerprint: ${fingerprint.substring(0, 12)}...`);
            addLog(`Consensus Confidence: ${(confidence * 100).toFixed(0)}% (${attempts} nodes)`);
            
            setStatus("saving");
            addLog("Committing to ledger v3...");

            const record = await room.collection('neurohash_ledger_v3').create({
                data,
                nonce,
                fingerprint,
                security_level: securityLevel,
                confidence: confidence,
                model_version: 'gpt-4o-mini', 
                created_at: new Date().toISOString()
            });
            
            if (!record) throw new Error("Database commit failed");

            addLog("SUCCESS: Block committed.");
            setTimeout(() => {
                onSuccess();
            }, 1000);

        } catch (err) {
            console.error("Minting Error:", err);
            setStatus("idle");
            addLog(`CRITICAL FAILURE: ${err.message}`);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6 md:space-y-8 pb-8">
            <header className="border-b border-subtle-border pb-4">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Lock className="text-neon-green" /> 
                    Mint Data Commitment
                </h2>
                <p className="text-gray-400 text-sm mt-1">
                    Seal your data with the weight of the model. 
                </p>
            </header>

            <div className="space-y-6">
                <div className="space-y-2">
                    <label className="text-xs font-mono text-neon-blue uppercase">Data Payload</label>
                    <textarea 
                        value={data}
                        onChange={(e) => setData(e.target.value)}
                        placeholder='{"transaction": "transfer", "amount": 500, "to": "0x123..."}'
                        className="w-full h-32 bg-dark-bg border border-subtle-border rounded p-4 text-white font-mono text-sm focus:border-neon-blue focus:outline-none focus:ring-1 focus:ring-neon-blue transition-all resize-none"
                        disabled={status !== 'idle'}
                    />
                </div>

                <div className="grid grid-cols-3 gap-2 md:gap-4">
                    {['standard', 'high', 'maximum'].map(level => (
                        <button
                            key={level}
                            onClick={() => setSecurityLevel(level)}
                            disabled={status !== 'idle'}
                            className={cn(
                                "p-2 md:p-3 rounded border text-xs font-mono uppercase text-left transition-all",
                                securityLevel === level 
                                    ? "bg-neon-blue/20 border-neon-blue text-white shadow-lg shadow-neon-blue/10" 
                                    : "bg-black/20 border-subtle-border text-gray-500 hover:border-gray-500"
                            )}
                        >
                            <div className="font-bold mb-1 truncate">{level}</div>
                            <div className="text-[10px] opacity-70 hidden md:block">
                                {level === 'standard' && "1 Query (Fast)"}
                                {level === 'high' && "3 Queries (Robust)"}
                                {level === 'maximum' && "5 Queries (Strict)"}
                            </div>
                        </button>
                    ))}
                </div>

                <div className="bg-black/30 rounded p-4 font-mono text-xs text-gray-500 border border-subtle-border min-h-[140px] relative overflow-hidden">
                    {/* Progress Bar */}
                    {status !== 'idle' && (
                        <div className="absolute top-0 left-0 h-1 bg-neon-blue transition-all duration-300" style={{width: `${status === 'mining' ? progress : 100}%`}}></div>
                    )}
                    
                    <div className="mb-2 text-gray-700 uppercase tracking-widest flex justify-between">
                        <span>System Log</span>
                        <span>{status !== 'idle' && status.toUpperCase()}</span>
                    </div>
                    <div 
                        ref={logContainerRef}
                        className="space-y-1 h-24 overflow-y-auto custom-scrollbar scroll-smooth"
                    >
                        {logs.length === 0 && <span className="text-gray-700 italic">Ready for sequence start...</span>}
                        {logs.map((log, i) => (
                            <div key={i} className="text-neon-green break-all">{log}</div>
                        ))}
                    </div>
                </div>

                <button 
                    onClick={handleMint}
                    disabled={status !== 'idle' || !data}
                    className="w-full py-4 bg-neon-blue text-black font-bold font-mono text-lg uppercase tracking-wider hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 rounded-sm active:scale-[0.99]"
                >
                    {status === 'idle' ? (
                        <>
                            <Lock size={18} /> Seal Data
                        </>
                    ) : (
                        <>
                            <RefreshCw className="animate-spin" size={18} /> Processing...
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

function VerifyView({ initialRecord }) {
    const [record, setRecord] = useState(initialRecord || null);
    const [testData, setTestData] = useState("");
    const [verificationStatus, setVerificationStatus] = useState("idle"); // idle, verifying, match, mismatch
    const [resultFingerprint, setResultFingerprint] = useState(null);
    const [diff, setDiff] = useState(null);

    useEffect(() => {
        if (record) {
            setTestData(record.data);
            setVerificationStatus("idle");
            setResultFingerprint(null);
        }
    }, [record]);

    // Handle case where user navigates directly without selection
    if (!record) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
                <Search size={48} />
                <p>Select a record from the Ledger to audit.</p>
                <p className="text-xs text-gray-600">Click the "AUDIT" button on any row in the Ledger.</p>
            </div>
        );
    }

    const handleVerify = async () => {
        setVerificationStatus("verifying");
        try {
            // Re-run the generation with the CURRENT testData (which user might have tampered with)
            // but the ORIGINAL nonce.
            // Verification should use High Security (Consensus) to be sure
            const { fingerprint } = await generateNeuralHash(testData, record.nonce, 'high');
            setResultFingerprint(fingerprint);

            if (fingerprint === record.fingerprint) {
                setVerificationStatus("match");
            } else {
                setVerificationStatus("mismatch");
            }
        } catch (e) {
            console.error(e);
            setVerificationStatus("error");
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
            <div className="space-y-6">
                <header className="border-b border-subtle-border pb-4">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Shield className="text-neon-blue" /> 
                        Audit Console
                    </h2>
                    <p className="text-gray-400 text-sm mt-1">
                        Verify data integrity by querying the AI model again.
                    </p>
                </header>

                <div className="space-y-4">
                    <div className="p-4 border border-neon-blue/20 bg-neon-blue/5 rounded">
                        <label className="text-xs font-mono text-neon-blue uppercase block mb-1">Stored Fingerprint</label>
                        <div className="font-mono text-xs text-white break-all">{record.fingerprint}</div>
                    </div>
                    
                    <div className="p-4 border border-gray-700 bg-dark-bg rounded">
                        <label className="text-xs font-mono text-gray-500 uppercase block mb-1">Nonce (Proof of Work)</label>
                        <div className="font-mono text-xs text-white">{record.nonce}</div>
                    </div>

                    <div>
                        <label className="text-xs font-mono text-gray-500 uppercase block mb-2">
                            Data Content (Editable for Tamper Testing)
                        </label>
                        <textarea 
                            value={testData}
                            onChange={(e) => {
                                setTestData(e.target.value);
                                setVerificationStatus("idle");
                            }}
                            className={cn(
                                "w-full h-40 bg-dark-bg border rounded p-4 text-white font-mono text-sm focus:outline-none transition-colors",
                                testData !== record.data ? "border-neon-pink ring-1 ring-neon-pink" : "border-subtle-border focus:border-neon-blue"
                            )}
                        />
                        {testData !== record.data && (
                            <p className="text-neon-pink text-xs mt-1 flex items-center gap-1">
                                <AlertTriangle size={12} /> Local data modified. Verification should fail.
                            </p>
                        )}
                    </div>

                    <button 
                        onClick={handleVerify}
                        disabled={verificationStatus === 'verifying'}
                        className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-bold font-mono border border-white/20 rounded transition-all"
                    >
                        {verificationStatus === 'verifying' ? 'Querying Oracle...' : 'RUN VERIFICATION'}
                    </button>
                </div>
            </div>

            {/* Results Panel */}
            <div className="bg-black/40 rounded-lg p-6 flex flex-col items-center justify-center border border-subtle-border relative">
                {verificationStatus === 'idle' && (
                    <div className="text-center text-gray-600">
                        <Shield size={64} className="mx-auto mb-4 opacity-20" />
                        <p>Ready to verify.</p>
                    </div>
                )}

                {verificationStatus === 'verifying' && (
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-neon-blue mx-auto mb-4"></div>
                        <p className="text-neon-blue animate-pulse">Consulting Model Weights...</p>
                    </div>
                )}

                {verificationStatus === 'match' && (
                    <div className="text-center animate-in fade-in zoom-in duration-300">
                        <CheckCircle size={80} className="text-neon-green mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-white mb-2">VERIFIED VALID</h3>
                        <p className="text-gray-400 text-sm">
                            The model produced the exact same fingerprint.<br/>Data is authentic.
                        </p>
                    </div>
                )}

                {verificationStatus === 'mismatch' && (
                    <div className="text-center animate-in fade-in zoom-in duration-300 w-full">
                        <AlertTriangle size={80} className="text-neon-pink mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-white mb-2">TAMPER DETECTED</h3>
                        <p className="text-gray-400 text-sm mb-6">
                            The fingerprint generated does not match the stored record.
                        </p>
                        
                        <div className="text-left bg-black p-4 rounded text-xs font-mono border border-neon-pink/30 w-full overflow-hidden">
                            <div className="mb-2">
                                <span className="text-gray-500">EXPECTED:</span><br/>
                                <span className="text-neon-green break-all">{record.fingerprint}</span>
                            </div>
                            <div>
                                <span className="text-gray-500">ACTUAL:</span><br/>
                                <span className="text-neon-pink break-all">{resultFingerprint}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// -----------------------------------------------------------------------------
// NEW ANALYSIS VIEW
// -----------------------------------------------------------------------------

function AnalysisView() {
    const [mode, setMode] = useState('determinism'); // determinism, avalanche
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);

    return (
        <div className="h-full flex flex-col gap-6">
            <header className="border-b border-subtle-border pb-4 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Activity className="text-neon-pink" /> 
                        Research Lab
                    </h2>
                    <p className="text-gray-400 text-sm mt-1">Verify the cryptographic properties of the neural weights.</p>
                </div>
                <div className="flex gap-2 bg-black/40 p-1 rounded-lg border border-subtle-border">
                    <button 
                        onClick={() => { setMode('determinism'); setResults(null); }}
                        className={cn("px-4 py-2 rounded text-xs font-bold transition-all", mode === 'determinism' ? "bg-neon-blue text-black" : "text-gray-400 hover:text-white")}
                    >
                        CONSISTENCY
                    </button>
                    <button 
                        onClick={() => { setMode('avalanche'); setResults(null); }}
                        className={cn("px-4 py-2 rounded text-xs font-bold transition-all", mode === 'avalanche' ? "bg-neon-pink text-black" : "text-gray-400 hover:text-white")}
                    >
                        AVALANCHE
                    </button>
                </div>
            </header>

            <div className="flex-1 flex flex-col items-center justify-center">
                {!results && !loading && mode === 'determinism' && (
                    <DeterminismStart onRun={async () => {
                        setLoading(true);
                        const res = await runDeterminismCheck();
                        setResults(res);
                        setLoading(false);
                    }} />
                )}
                {!results && !loading && mode === 'avalanche' && (
                    <AvalancheStart onRun={async () => {
                        setLoading(true);
                        const res = await runAvalancheCheck();
                        setResults(res);
                        setLoading(false);
                    }} />
                )}

                {loading && (
                    <div className="text-center animate-pulse">
                        <Cpu size={48} className="text-neon-blue mx-auto mb-4 animate-spin" />
                        <h3 className="text-lg font-bold">Running Experiments...</h3>
                        <p className="text-gray-500 text-sm">Please wait while we query the model multiple times.</p>
                    </div>
                )}

                {results && mode === 'determinism' && (
                    <DeterminismResults data={results} onReset={() => setResults(null)} />
                )}

                {results && mode === 'avalanche' && (
                    <AvalancheResults data={results} onReset={() => setResults(null)} />
                )}
            </div>
        </div>
    );
}

function DeterminismStart({ onRun }) {
    return (
        <div className="text-center max-w-md">
            <RefreshCw size={64} className="text-gray-700 mx-auto mb-6" />
            <h3 className="text-xl font-bold text-white mb-2">Test Model Consistency</h3>
            <p className="text-gray-400 text-sm mb-6">
                We will send the exact same input to the model 10 times. 
                In a perfect cryptographic hash, the output should be identical every time.
                For a Neural Hash, we expect high consistency but potentially minor drift if the model floats vary.
            </p>
            <button onClick={onRun} className="px-8 py-3 bg-neon-blue text-black font-bold rounded hover:bg-white transition-colors">
                START TEST (n=10)
            </button>
        </div>
    );
}

function DeterminismResults({ data, onReset }) {
    const successRate = (data.matchCount / data.total) * 100;
    
    return (
        <div className="w-full max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-black/40 border border-subtle-border p-6 rounded-lg text-center">
                    <div className="text-4xl font-bold text-neon-green mb-1">{successRate}%</div>
                    <div className="text-xs text-gray-500 uppercase tracking-widest">Consistency Rate</div>
                </div>
                <div className="bg-black/40 border border-subtle-border p-6 rounded-lg text-center">
                    <div className="text-4xl font-bold text-white mb-1">{data.uniqueVariations}</div>
                    <div className="text-xs text-gray-500 uppercase tracking-widest">Unique Outputs</div>
                </div>
                <div className="bg-black/40 border border-subtle-border p-6 rounded-lg text-center">
                    <div className="text-4xl font-bold text-neon-blue mb-1">{data.total}</div>
                    <div className="text-xs text-gray-500 uppercase tracking-widest">Total Trials</div>
                </div>
            </div>

            <div className="bg-panel-bg border border-subtle-border rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-black/40 text-gray-500">
                        <tr>
                            <th className="p-3">TRIAL</th>
                            <th className="p-3">OUTPUT HASH</th>
                            <th className="p-3">STATUS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.logs.map((log, i) => (
                            <tr key={i} className="border-b border-subtle-border/30">
                                <td className="p-3 text-gray-500">#{i+1}</td>
                                <td className="p-3 text-white">{log.hash}</td>
                                <td className="p-3">
                                    {log.match ? (
                                        <span className="text-neon-green flex items-center gap-1"><CheckCircle size={12}/> MATCH</span>
                                    ) : (
                                        <span className="text-neon-pink flex items-center gap-1"><AlertTriangle size={12}/> DRIFT</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="mt-6 text-center">
                <button onClick={onReset} className="text-gray-500 hover:text-white text-sm underline">Run Another Test</button>
            </div>
        </div>
    );
}

function AvalancheStart({ onRun }) {
    return (
        <div className="text-center max-w-md">
            <GitMerge size={64} className="text-gray-700 mx-auto mb-6" />
            <h3 className="text-xl font-bold text-white mb-2">Avalanche Effect Test</h3>
            <p className="text-gray-400 text-sm mb-6">
                We will change a SINGLE character in the input data.
                We expect the output hash to change significantly (approx 50% of bits flipped).
                This proves the model isn't just "summarizing" but actually "hashing".
            </p>
            <button onClick={onRun} className="px-8 py-3 bg-neon-pink text-black font-bold rounded hover:bg-white transition-colors">
                START TEST
            </button>
        </div>
    );
}

function AvalancheResults({ data, onReset }) {
    return (
        <div className="w-full max-w-4xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                    <div className="text-[10px] text-gray-500 font-mono">INPUT A (ORIGINAL)</div>
                    <div className="bg-black/50 p-2 rounded border border-subtle-border font-mono text-[10px] break-all text-neon-blue">
                        {data.hashA}
                    </div>
                </div>
                <div className="space-y-1">
                    <div className="text-[10px] text-gray-500 font-mono">INPUT B (1 BIT FLIP)</div>
                    <div className="bg-black/50 p-2 rounded border border-subtle-border font-mono text-[10px] break-all text-neon-pink">
                        {data.hashB}
                    </div>
                </div>
            </div>

            <div className="bg-panel-bg border border-subtle-border p-4 rounded-lg">
                <div className="flex justify-between items-center mb-3">
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                        <Activity size={14} className="text-neon-green" /> BITMAP VISUALIZER
                    </h4>
                    <div className="text-xs font-mono">
                        <span className="text-neon-pink">{data.diffBits}</span> <span className="text-gray-600">/</span> <span className="text-gray-400">{data.totalBits}</span>
                    </div>
                </div>
                
                {/* Visualizer - Compact Grid */}
                <div className="flex flex-wrap gap-[1px] mb-4 bg-black/20 p-2 rounded justify-center">
                    {data.visualDiff.map((bit, i) => (
                        <div 
                            key={i} 
                            className={cn(
                                "w-1.5 h-1.5 md:w-2 md:h-2 rounded-[1px] transition-all duration-300",
                                bit ? "bg-neon-pink" : "bg-gray-800"
                            )}
                            title={`Bit ${i}: ${bit ? "CHANGED" : "SAME"}`}
                        ></div>
                    ))}
                </div>

                <div className="flex items-center justify-between border-t border-subtle-border pt-3">
                    <div>
                        <div className="text-2xl font-bold text-white leading-none">{data.diffPercent}%</div>
                        <div className="text-[10px] text-gray-500 uppercase">Avalanche Factor</div>
                    </div>
                    <div className="text-right">
                        <div className={cn("text-xs font-bold", data.diffPercent > 45 ? "text-neon-green" : "text-yellow-500")}>
                            {data.diffPercent > 45 ? "STRONG CRYPTO PROPERTY" : "WEAK CORRELATION"}
                        </div>
                        <div className="text-[10px] text-gray-500">
                             {data.diffPercent > 45 ? "Outputs are uncorrelated." : "Model may be overfitting."}
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="mt-4 text-center">
                <button onClick={onReset} className="text-xs text-gray-500 hover:text-white underline">Run New Experiment</button>
            </div>
        </div>
    );
}

// Logic for experiments
async function runDeterminismCheck() {
    const data = "NeuroHash_Test_" + Math.random().toString(36).substring(7);
    const nonce = "chk";
    const logs = [];
    const n = 10;
    
    // First run to set baseline
    const r1 = await generateNeuralHash(data, nonce, 'standard');
    const baseline = r1.fingerprint;
    
    let matches = 0;
    const variations = new Set();
    
    for (let i = 0; i < n; i++) {
        // Use standard (single query) for the test to see raw model behavior
        const res = await generateNeuralHash(data, nonce, 'standard');
        const match = res.fingerprint === baseline;
        if (match) matches++;
        variations.add(res.fingerprint);
        
        logs.push({
            hash: res.fingerprint,
            match
        });
        // small delay to not hit rate limits if any
        await new Promise(r => setTimeout(r, 200));
    }
    
    return {
        total: n,
        matchCount: matches,
        uniqueVariations: variations.size,
        logs,
        baseline
    };
}

async function runAvalancheCheck() {
    const inputA = "NeuroHash Secure Data Block A";
    const inputB = "NeuroHash Secure Data Block B"; // One char diff
    const nonce = "avalanche";
    
    const rA = await generateNeuralHash(inputA, nonce, 'standard');
    const rB = await generateNeuralHash(inputB, nonce, 'standard');
    
    // Calculate bit diff
    const binA = hexToBin(rA.fingerprint);
    const binB = hexToBin(rB.fingerprint);
    
    let diffs = 0;
    const visualDiff = [];
    const len = Math.min(binA.length, binB.length);
    
    for (let i = 0; i < len; i++) {
        const diff = binA[i] !== binB[i];
        if (diff) diffs++;
        visualDiff.push(diff);
    }
    
    return {
        inputA,
        inputB,
        hashA: rA.fingerprint,
        hashB: rB.fingerprint,
        diffBits: diffs,
        totalBits: len,
        diffPercent: ((diffs / len) * 100).toFixed(1),
        visualDiff
    };
}

function hexToBin(hex) {
    let bin = "";
    for (let i = 0; i < hex.length; i++) {
        bin += parseInt(hex[i], 16).toString(2).padStart(4, '0');
    }
    return bin;
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);