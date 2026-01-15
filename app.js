import React, { useState, useEffect, useRef } from 'react';
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
    Hash
} from 'lucide-react';
// Utilities are now loaded globally from utils.js

// Setup WebsimSocket
const room = new WebsimSocket();

function App() {
    const [view, setView] = useState('ledger'); // ledger, mint, verify, experiment
    const [records, setRecords] = useState([]);
    
    useEffect(() => {
        // Subscribe to ledger updates
        const unsubscribe = room.collection('neurohash_ledger').subscribe((data) => {
            // Sort by created_at desc
            const sorted = data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            setRecords(sorted);
        });
        return () => unsubscribe();
    }, []);

    return (
        <div className="min-h-screen flex flex-col md:flex-row max-w-7xl mx-auto p-4 gap-4">
            {/* Sidebar Navigation */}
            <nav className="w-full md:w-64 flex flex-col gap-2 p-4 bg-panel-bg rounded-lg border border-subtle-border h-fit">
                <div className="flex items-center gap-3 mb-6 px-2">
                    <div className="relative">
                        <Cpu className="w-8 h-8 text-neon-blue" />
                        <div className="absolute inset-0 bg-neon-blue blur-lg opacity-40"></div>
                    </div>
                    <div>
                        <h1 className="font-bold text-lg tracking-wider">NEUROHASH</h1>
                        <p className="text-xs text-gray-500 font-mono">MODEL_WEIGHTS_SEC</p>
                    </div>
                </div>

                <NavButton active={view === 'ledger'} onClick={() => setView('ledger')} icon={Database} label="Ledger" />
                <NavButton active={view === 'mint'} onClick={() => setView('mint')} icon={Lock} label="Mint Data" />
                <NavButton active={view === 'verify'} onClick={() => setView('verify')} icon={Search} label="Verify / Audit" />
                <NavButton active={view === 'experiment'} onClick={() => setView('experiment')} icon={Activity} label="Lab / Tests" />

                <div className="mt-auto pt-8 text-xs text-gray-600 font-mono">
                    <p>Network Status: <span className="text-neon-green">ONLINE</span></p>
                    <p>Model: GPT-4o-Mini (Temp 0)</p>
                </div>
            </nav>

            {/* Main Content Area */}
            <main className="flex-1 bg-panel-bg rounded-lg border border-subtle-border p-6 min-h-[600px] relative overflow-hidden">
                <div className="scan-line"></div>
                
                {view === 'ledger' && <LedgerView records={records} onVerify={(r) => {
                    window.selectedRecord = r; 
                    setView('verify');
                }} />}
                
                {view === 'mint' && <MintView onSuccess={() => setView('ledger')} />}
                
                {view === 'verify' && <VerifyView initialRecord={window.selectedRecord} />}
                
                {view === 'experiment' && <ExperimentView />}
            </main>
        </div>
    );
}

function NavButton({ active, onClick, icon: Icon, label }) {
    return (
        <button 
            onClick={onClick}
            className={cn(
                "flex items-center gap-3 px-4 py-3 rounded transition-all duration-200 font-mono text-sm border border-transparent",
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

    const addLog = (msg) => setLogs(prev => [...prev, `> ${msg}`]);

    const handleMint = async () => {
        if (!data.trim()) return;
        
        try {
            setStatus("mining");
            setLogs([]);
            addLog("Initializing Proof-of-Work sequence...");
            
            // 1. Mine Nonce
            const startTime = performance.now();
            const { nonce, hash } = await mineNonce(data, 3); // difficulty 3
            const mineTime = (performance.now() - startTime).toFixed(2);
            addLog(`Nonce found: ${nonce} (${mineTime}ms)`);
            addLog(`PoW Hash: ${hash.substring(0, 10)}...`);

            setStatus("fingerprinting");
            addLog("Querying Neural Oracle (Temp=0)...");
            
            // 2. Query AI
            const { fingerprint, raw } = await generateAIFingerprint(data, nonce);
            addLog(`Fingerprint generated: ${fingerprint.substring(0, 16)}...`);
            
            setStatus("saving");
            addLog("Committing to ledger...");

            // 3. Save
            await room.collection('neurohash_ledger').create({
                data,
                nonce,
                fingerprint,
                model_version: 'gpt-4o-mini', // Conceptual versioning
                raw_response_preview: raw.substring(0, 50)
            });

            addLog("SUCCESS: Block committed.");
            setTimeout(() => {
                onSuccess();
            }, 1000);

        } catch (err) {
            console.error(err);
            setStatus("idle");
            addLog(`ERROR: ${err.message}`);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-8">
            <header className="border-b border-subtle-border pb-4">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Lock className="text-neon-green" /> 
                    Mint Data Commitment
                </h2>
                <p className="text-gray-400 text-sm mt-1">
                    Your data will be bound to the AI model's weights. 
                    This process is deterministic but computationally expensive to forge.
                </p>
            </header>

            <div className="space-y-4">
                <div className="space-y-2">
                    <label className="text-xs font-mono text-neon-blue uppercase">Data Payload</label>
                    <textarea 
                        value={data}
                        onChange={(e) => setData(e.target.value)}
                        placeholder='{"transaction": "transfer", "amount": 500, "to": "0x123..."}'
                        className="w-full h-32 bg-dark-bg border border-subtle-border rounded p-4 text-white font-mono text-sm focus:border-neon-blue focus:outline-none focus:ring-1 focus:ring-neon-blue transition-all"
                        disabled={status !== 'idle'}
                    />
                </div>

                <div className="bg-black/30 rounded p-4 font-mono text-xs text-gray-500 border border-subtle-border min-h-[100px]">
                    <div className="mb-2 text-gray-700 uppercase tracking-widest">System Log</div>
                    {logs.map((log, i) => (
                        <div key={i} className="text-neon-green">{log}</div>
                    ))}
                    {status === 'mining' && <span className="animate-pulse text-neon-blue">Mining nonce...</span>}
                    {status === 'fingerprinting' && <span className="animate-pulse text-neon-pink">Computing neural hash...</span>}
                </div>

                <button 
                    onClick={handleMint}
                    disabled={status !== 'idle' || !data}
                    className="w-full py-4 bg-neon-blue text-black font-bold font-mono text-lg uppercase tracking-wider hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {status === 'idle' ? 'Seal Data' : 'Processing...'}
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
                <button 
                    onClick={() => document.querySelector('button[aria-label="Ledger"]').click()}
                    className="text-neon-blue hover:underline"
                >
                    Go to Ledger
                </button>
            </div>
        );
    }

    const handleVerify = async () => {
        setVerificationStatus("verifying");
        try {
            // Re-run the generation with the CURRENT testData (which user might have tampered with)
            // but the ORIGINAL nonce.
            const { fingerprint } = await generateAIFingerprint(testData, record.nonce);
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

function ExperimentView() {
    const [log, setLog] = useState([]);
    const [running, setRunning] = useState(false);

    const runDeterminismTest = async () => {
        if (running) return;
        setRunning(true);
        setLog([]);
        
        const data = "Test_Data_" + Math.random().toString(36).substring(7);
        const nonce = "test_nonce";
        
        setLog(prev => [...prev, `Starting Determinism Test (n=5)`]);
        setLog(prev => [...prev, `Data: ${data}`]);
        
        let firstHash = null;
        let successCount = 0;
        
        for (let i = 0; i < 5; i++) {
            setLog(prev => [...prev, `Query ${i+1}...`]);
            try {
                const { fingerprint } = await generateAIFingerprint(data, nonce);
                setLog(prev => [...prev, `-> ${fingerprint.substring(0, 16)}...`]);
                
                if (firstHash === null) {
                    firstHash = fingerprint;
                    successCount++;
                } else if (fingerprint === firstHash) {
                    successCount++;
                } else {
                    setLog(prev => [...prev, `MISMATCH DETECTED!`]);
                }
            } catch (e) {
                setLog(prev => [...prev, `Error: ${e.message}`]);
            }
        }
        
        const rate = (successCount / 5) * 100;
        setLog(prev => [...prev, `RESULT: ${rate}% Determinism Rate`]);
        setRunning(false);
    };

    const runAvalancheTest = async () => {
        if (running) return;
        setRunning(true);
        setLog([]);

        const baseData = "Hello World 1";
        const modData = "Hello World 2";
        const nonce = "avalanche";

        setLog(prev => [...prev, `Avalanche Effect Test`]);
        setLog(prev => [...prev, `Base: "${baseData}"`]);
        setLog(prev => [...prev, `Mod:  "${modData}"`]);

        try {
            const r1 = await generateAIFingerprint(baseData, nonce);
            setLog(prev => [...prev, `Hash 1: ${r1.fingerprint.substring(0, 32)}...`]);

            const r2 = await generateAIFingerprint(modData, nonce);
            setLog(prev => [...prev, `Hash 2: ${r2.fingerprint.substring(0, 32)}...`]);

            if (r1.fingerprint !== r2.fingerprint) {
                setLog(prev => [...prev, `SUCCESS: Hashes are significantly different.`]);
            } else {
                setLog(prev => [...prev, `FAIL: Collision or lack of sensitivity.`]);
            }

        } catch (e) {
             setLog(prev => [...prev, `Error: ${e.message}`]);
        }
        setRunning(false);
    };

    return (
        <div className="max-w-3xl mx-auto">
            <header className="mb-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Activity className="text-neon-pink" /> 
                    Laboratory
                </h2>
                <p className="text-gray-400 text-sm">Test the properties of the Neural Oracle.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <button 
                    onClick={runDeterminismTest}
                    disabled={running}
                    className="p-4 bg-white/5 hover:bg-white/10 border border-subtle-border rounded text-left group"
                >
                    <div className="flex items-center gap-2 mb-2">
                        <RefreshCw className={cn("text-neon-blue", running && "animate-spin")} />
                        <span className="font-bold text-white">Determinism Check</span>
                    </div>
                    <p className="text-xs text-gray-500">
                        Query the model 5 times with identical input to measure output consistency.
                    </p>
                </button>

                <button 
                    onClick={runAvalancheTest}
                    disabled={running}
                    className="p-4 bg-white/5 hover:bg-white/10 border border-subtle-border rounded text-left"
                >
                    <div className="flex items-center gap-2 mb-2">
                        <Hash className="text-neon-pink" />
                        <span className="font-bold text-white">Avalanche Test</span>
                    </div>
                    <p className="text-xs text-gray-500">
                        Change one character of input and verify the hash changes completely.
                    </p>
                </button>
            </div>

            <div className="bg-black p-4 rounded border border-subtle-border font-mono text-xs h-64 overflow-y-auto custom-scrollbar">
                {log.length === 0 ? (
                    <span className="text-gray-600">Experiment logs will appear here...</span>
                ) : (
                    log.map((line, i) => <div key={i} className="mb-1 text-neon-green">{line}</div>)
                )}
            </div>
        </div>
    );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);