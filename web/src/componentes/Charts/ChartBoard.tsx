import { useEffect, useMemo, useState, useRef } from "react";
import CpuChart from "./CpuChart";
import TransactionChart from "./TransferChart";
import MemoryChart from "./MemoryChart";
import { ScatterChart } from "./ScatterChart";
import TerminalController from "../TerminalController";
import ReloadButton from "../ReloadButton";

interface ChartBoardProps {
    cpuChart: boolean;
    transferChart: boolean;
    terminalLog: string[];
    onReloadButtonClick: (e: Event, chartConnections: WebSocket[]) => void;
    configData?: any;
}

const ChartBoard = ({
    cpuChart,
    transferChart,
    terminalLog,
    onReloadButtonClick,
    configData = {}
}: ChartBoardProps) => {
    const [chartConnections, setChartConnections] = useState<WebSocket[]>([]);
    const [dataCPU, setDataCPU] = useState<[number, number][]>([]);
    const [dataTransfer, setDataTransfer] = useState<[number, number][]>([]);
    const [dataMemory, setDataMemory] = useState<[number, number][]>([]);
    
    // Agregação de Latência por Segundo
    const [dataScatter, setDataScatter] = useState<[number, number | null, number | null][]>([]);
    const latencyMapRef = useRef<Map<number, { normalSum: number; normalCount: number; abnormalSum: number; abnormalCount: number }>>(new Map());

    const [maxMemoryUsage, setMaxMemoryUsage] = useState(0);
    const [showTerminal, setShowTerminal] = useState<boolean>(true);

    // Estados do Experimento e Marcos Temporais
    const [systemStatus, setSystemStatus] = useState<string>("Idle");
    
    // Marcos de tempo UTC (fontes primárias de verdade)
    const [recoveryStartAtUtc, setRecoveryStartAtUtc] = useState<string | null>(null);
    const [recoveryEndAtUtc, setRecoveryEndAtUtc] = useState<string | null>(null);

    const [failureTime, setFailureTime] = useState<number | null>(null);
    const [recoveryStartTime, setRecoveryStartTime] = useState<number | null>(null);
    const [recoveryEndTime, setRecoveryEndTime] = useState<number | null>(null);
    const [stabilityTime, setStabilityTime] = useState<number | null>(null);

    const [isCpuConnected, setIsCpuConnected] = useState(false);
    const [isDataConnected, setIsDataConnected] = useState(false);
    const [isMemoryConnected, setIsMemoryConnected] = useState(false);
    const [isLatencyConnected, setIsLatencyConnected] = useState(false);

    const [reconnectTrigger, setReconnectTrigger] = useState(0);

    // Variáveis auxiliares para mesclar dados com mesmo timestamp
    const timestampsCpu = useRef<number[]>([]);
    const cpuUsage = useRef<number[]>([]);
    const timestampsMemory = useRef<number[]>([]);
    const memoryUsage = useRef<number[]>([]);

    // 1. Detecção automática de marcos e estados a partir dos logs de terminal
    useEffect(() => {
        if (terminalLog.length === 0) return;

        let detectedStatus = systemStatus;
        let detectedFail = failureTime;
        let detectedRecStart = recoveryStartTime;
        let detectedRecEnd = recoveryEndTime;
        let detectedStability = stabilityTime;
        let recStartUtc = recoveryStartAtUtc;
        let recEndUtc = recoveryEndAtUtc;

        terminalLog.forEach((log) => {
            const text = log.toLowerCase();
            
            // Extrai timestamp UTC se presente no log
            const redisTimeRegex = /^\d+:[M|S|C]\s+([\d\s\w\:\.]+)\s+[\*\#\-]/;
            const matchTime = log.match(redisTimeRegex);
            let logUtcStr: string | null = null;
            if (matchTime) {
                const parsed = Date.parse(matchTime[1] + " GMT-0300"); // parser Brasília local
                if (!isNaN(parsed) && isFinite(parsed)) {
                    logUtcStr = new Date(parsed).toISOString();
                }
            }

            if (text.includes("loading the database from")) {
                detectedStatus = "Carregando Banco";
                if (logUtcStr) recStartUtc = logUtcStr;
            } else if (text.includes("memtier benchmark") && text.includes("started")) {
                detectedStatus = "Executando Carga";
            } else if (text.includes("user requested shutdown") || text.includes("redis is now ready to exit")) {
                detectedStatus = "Falha Simulada";
                if (detectedFail === null && dataTransfer.length > 0) {
                    detectedFail = dataTransfer[dataTransfer.length - 1][0];
                }
            } else if (text.includes("indexed log environment started") || text.includes("loading the database from indexed log")) {
                detectedStatus = "Recuperando";
                if (detectedRecStart === null && dataTransfer.length > 0) {
                    detectedRecStart = dataTransfer[dataTransfer.length - 1][0];
                }
                if (logUtcStr) recStartUtc = logUtcStr;
            } else if (text.includes("ready to accept connections") || text.includes("db loaded from indexed log") || text.includes("db loaded from aof")) {
                detectedStatus = "Estável";
                if (logUtcStr) recEndUtc = logUtcStr;

                if (detectedRecEnd === null && dataTransfer.length > 0) {
                    detectedRecEnd = dataTransfer[dataTransfer.length - 1][0];
                    detectedStability = detectedRecEnd + 2; 
                }
            }
        });

        if (detectedStatus !== systemStatus) setSystemStatus(detectedStatus);
        if (detectedFail !== failureTime) setFailureTime(detectedFail);
        if (detectedRecStart !== recoveryStartTime) setRecoveryStartTime(detectedRecStart);
        if (detectedRecEnd !== recoveryEndTime) setRecoveryEndTime(detectedRecEnd);
        if (detectedStability !== stabilityTime) setStabilityTime(detectedStability);
        if (recStartUtc !== recoveryStartAtUtc) setRecoveryStartAtUtc(recStartUtc);
        if (recEndUtc !== recoveryEndAtUtc) setRecoveryEndAtUtc(recEndUtc);

    }, [terminalLog, dataTransfer]);

    // Cálculo robusto do tempo de recuperação baseado estritamente em UTC
    const calculatedRecoveryTimeText = useMemo(() => {
        if (!recoveryStartAtUtc) {
            return "--";
        }
        if (!recoveryEndAtUtc) {
            return "Em andamento";
        }

        const startMs = new Date(recoveryStartAtUtc).getTime();
        const endMs = new Date(recoveryEndAtUtc).getTime();

        if (isNaN(startMs) || !isFinite(startMs) || isNaN(endMs) || !isFinite(endMs)) {
            return "--";
        }

        const diffSeconds = (endMs - startMs) / 1000;
        if (diffSeconds < 0 || !isFinite(diffSeconds)) {
            return "--";
        }

        return `${diffSeconds.toFixed(3)}s`;
    }, [recoveryStartAtUtc, recoveryEndAtUtc]);

    // 2. Conectar e gerenciar WebSockets com reconexão automática e backoff progressivo
    useEffect(() => {
        let isComponentMounted = true;

        const connect = (url: string, onMessage: (data: any) => void, onStateChange: (connected: boolean) => void) => {
            let socket: WebSocket | null = null;
            let retryDelay = 1000;
            let timer: any = null;

            const startConnection = () => {
                if (!isComponentMounted) return;
                
                console.log(`Tentando conectar ao WebSocket: ${url}`);
                socket = new WebSocket(url);

                socket.onopen = () => {
                    if (!isComponentMounted) {
                        socket?.close();
                        return;
                    }
                    console.log(`WebSocket conectado: ${url}`);
                    onStateChange(true);
                    retryDelay = 1000; 
                    setChartConnections((prev) => {
                        if (socket && !prev.includes(socket)) {
                            return [...prev, socket];
                        }
                        return prev;
                    });
                };

                socket.onmessage = (event) => {
                    if (!isComponentMounted) return;
                    onMessage(event.data);
                };

                socket.onerror = (err) => {
                    console.warn(`Erro no WebSocket: ${url}`, err);
                    onStateChange(false);
                };

                socket.onclose = () => {
                    if (!isComponentMounted) return;
                    console.log(`WebSocket desconectado: ${url}. Reconectando em ${retryDelay}ms...`);
                    onStateChange(false);
                    
                    setChartConnections((prev) => {
                        if (socket) {
                            return prev.filter((s) => s !== socket);
                        }
                        return prev;
                    });

                    const jitter = Math.random() * 300; // Jitter de até 300ms para evitar colisões
                    timer = setTimeout(() => {
                        timer = null;
                        retryDelay = Math.min(retryDelay * 2, 8000); 
                        startConnection();
                    }, retryDelay + jitter);
                };
            };

            startConnection();

            return {
                close: () => {
                    if (timer) {
                        clearTimeout(timer);
                        timer = null;
                    }
                    if (socket) {
                        socket.onclose = null; 
                        socket.onerror = null;
                        socket.onopen = null;
                        socket.close();
                    }
                }
            };
        };

        const cpuConn = connect("ws://localhost:8081/cpu", (data) => {
            try {
                const message = JSON.parse(data);
                const tsList = timestampsCpu.current;
                const usageList = cpuUsage.current;
                tsList.push(message[0]);
                usageList.push(message[1]);
                if (tsList.length > 1 && tsList[tsList.length - 1] === tsList[tsList.length - 2]) {
                    const media = (usageList[usageList.length - 1] + usageList[usageList.length - 2]) / 2;
                    setDataCPU((prev) => {
                        const next = [...prev];
                        if (next.length > 0) next[next.length - 1] = [message[0], media];
                        return next;
                    });
                } else {
                    setDataCPU((prev) => [...prev, message]);
                }
            } catch (e) {
                console.error("Erro CPU WS parsing:", e);
            }
        }, setIsCpuConnected);

        const dataConn = connect("ws://localhost:8081/data", (data) => {
            try {
                const endMessage = "CSV file successfully processed";
                if (data !== endMessage) {
                    const message = JSON.parse(data);
                    setDataTransfer((prev) => [...prev, message]);
                }
            } catch (e) {
                console.error("Erro Data WS parsing:", e);
            }
        }, setIsDataConnected);

        const memoryConn = connect("ws://localhost:8081/memory", (data) => {
            try {
                const message = JSON.parse(data);
                const tsList = timestampsMemory.current;
                const usageList = memoryUsage.current;
                tsList.push(message[0]);
                const usageMb = message[1] / 1024;
                usageList.push(usageMb);
                if (tsList.length > 1 && tsList[tsList.length - 1] === tsList[tsList.length - 2]) {
                    const media = (usageList[usageList.length - 1] + usageList[usageList.length - 2]) / 2;
                    setDataMemory((prev) => {
                        const next = [...prev];
                        if (next.length > 0) next[next.length - 1] = [message[0], media];
                        if (media > maxMemoryUsage) setMaxMemoryUsage(media);
                        return next;
                    });
                } else {
                    setDataMemory((prev) => {
                        if (usageMb > maxMemoryUsage) setMaxMemoryUsage(usageMb);
                        return [...prev, [message[0], usageMb]];
                    });
                }
            } catch (e) {
                console.error("Erro Memory WS parsing:", e);
            }
        }, setIsMemoryConnected);

        const latencyConn = connect("ws://localhost:8081/latencia", (data) => {
            try {
                const message = JSON.parse(data);
                let sec: number | null = null;
                let val: number | null = null;
                let isNormal = true;
                if (message.x1) {
                    sec = message.x1[0];
                    val = message.x1[1];
                    isNormal = true;
                } else if (message.x2) {
                    sec = message.x2[0];
                    val = message.x2[1];
                    isNormal = false;
                }
                if (sec !== null && val !== null) {
                    const map = latencyMapRef.current;
                    if (!map.has(sec)) {
                        map.set(sec, { normalSum: 0, normalCount: 0, abnormalSum: 0, abnormalCount: 0 });
                    }
                    const entry = map.get(sec)!;
                    if (isNormal) {
                        entry.normalSum += val;
                        entry.normalCount += 1;
                    } else {
                        entry.abnormalSum += val;
                        entry.abnormalCount += 1;
                    }
                }
            } catch (e) {
                console.error("Erro Latency WS parsing:", e);
            }
        }, setIsLatencyConnected);

        const latencyInterval = setInterval(() => {
            const map = latencyMapRef.current;
            const sortedSecs = Array.from(map.keys()).sort((a, b) => a - b);
            const aggregated = sortedSecs.map((sec) => {
                const entry = map.get(sec)!;
                const normalAvg = entry.normalCount > 0 ? Math.round(entry.normalSum / entry.normalCount) : null;
                const abnormalAvg = entry.abnormalCount > 0 ? Math.round(entry.abnormalSum / entry.abnormalCount) : null;
                return [sec, normalAvg, abnormalAvg] as [number, number | null, number | null];
            });
            setDataScatter(aggregated);
        }, 1000);

        return () => {
            isComponentMounted = false;
            cpuConn.close();
            dataConn.close();
            memoryConn.close();
            latencyConn.close();
            clearInterval(latencyInterval);
        };
    }, [reconnectTrigger]);

    // Modo de recuperação do setup
    const isDirectMode = useMemo(() => {
        const state = configData?.instantRecoveryState || "ON";
        return state.toUpperCase() === "ON";
    }, [configData]);

    const getBrasiliaISOString = (dateInput?: Date) => {
        const date = dateInput || new Date();
        
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        });
        
        const parts = formatter.formatToParts(date);
        const p: any = {};
        parts.forEach(part => p[part.type] = part.value);
        
        const tzParts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Sao_Paulo',
            timeZoneName: 'longOffset'
        }).formatToParts(date);
        const nameVal = tzParts.find(pt => pt.type === 'timeZoneName')?.value || 'GMT-03:00';
        
        let offsetStr = '-03:00';
        if (nameVal === 'GMT') {
            offsetStr = '+00:00';
        } else {
            const match = nameVal.match(/GMT([+-])(\d+)(?::(\d+))?/);
            if (match) {
                const sign = match[1];
                const hours = match[2].padStart(2, '0');
                const minutes = (match[3] || '00').padStart(2, '0');
                offsetStr = `${sign}${hours}:${minutes}`;
            }
        }
        
        const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
        return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${ms}${offsetStr}`;
    };

    const downloadActiveJsonReport = () => {
        let peakThroughput = 0;
        let averageThroughput = 0;
        let totalCommands = 0;

        if (dataTransfer.length > 0) {
            const counts = dataTransfer.map(item => item[1]);
            peakThroughput = Math.max(...counts);
            const sum = counts.reduce((acc, curr) => acc + curr, 0);
            averageThroughput = parseFloat((sum / counts.length).toFixed(2));
            totalCommands = sum;
        }

        let peakCpu = 0;
        let averageCpu = 0;
        if (dataCPU.length > 0) {
            const cpus = dataCPU.map(item => item[1]);
            peakCpu = Math.max(...cpus);
            const sumCpu = cpus.reduce((acc, curr) => acc + curr, 0);
            averageCpu = parseFloat((sumCpu / cpus.length).toFixed(2));
        }

        let peakMemory = 0;
        let averageMemory = 0;
        if (dataMemory.length > 0) {
            const mems = dataMemory.map(item => item[1]);
            peakMemory = Math.max(...mems);
            const sumMem = mems.reduce((acc, curr) => acc + curr, 0);
            averageMemory = parseFloat((sumMem / mems.length).toFixed(2));
        }

        const startedTime = new Date(Date.now() - (dataTransfer.length > 0 ? dataTransfer[dataTransfer.length - 1][0] * 1000 : 0));
        const failTime = failureTime !== null ? new Date(Date.now() - (dataTransfer.length > 0 ? (dataTransfer[dataTransfer.length - 1][0] - failureTime) * 1000 : 0)) : null;
        const recStartTime = recoveryStartTime !== null ? new Date(Date.now() - (dataTransfer.length > 0 ? (dataTransfer[dataTransfer.length - 1][0] - recoveryStartTime) * 1000 : 0)) : null;
        const recEndTime = recoveryEndTime !== null ? new Date(Date.now() - (dataTransfer.length > 0 ? (dataTransfer[dataTransfer.length - 1][0] - recoveryEndTime) * 1000 : 0)) : null;
        const stabTime = stabilityTime !== null ? new Date(Date.now() - (dataTransfer.length > 0 ? (dataTransfer[dataTransfer.length - 1][0] - stabilityTime) * 1000 : 0)) : null;

        const report = {
            runId: `run_active_${Date.now()}`,
            mode: isDirectMode ? "MM-DIRECT (B-Tree)" : "Tradicional (AOF)",
            timezone: "America/Sao_Paulo",
            startedAtUtc: startedTime.toISOString(),
            startedAtLocal: getBrasiliaISOString(startedTime),
            failureAtUtc: failTime !== null ? failTime.toISOString() : null,
            failureAtLocal: failTime !== null ? getBrasiliaISOString(failTime) : null,
            recoveryStartAtUtc: recStartTime !== null ? recStartTime.toISOString() : null,
            recoveryStartAtLocal: recStartTime !== null ? getBrasiliaISOString(recStartTime) : null,
            recoveryEndAtUtc: recEndTime !== null ? recEndTime.toISOString() : null,
            recoveryEndAtLocal: recEndTime !== null ? getBrasiliaISOString(recEndTime) : null,
            stabilityAtUtc: stabTime !== null ? stabTime.toISOString() : null,
            stabilityAtLocal: stabTime !== null ? getBrasiliaISOString(stabTime) : null,
            recoveryDurationSeconds: (recoveryStartTime !== null && recoveryEndTime !== null) ? (recoveryEndTime - recoveryStartTime) : null,
            status: stabilityTime ? "Estável" : "Interrompido",
            config: configData,
            throughputSummary: {
                peakThroughput,
                averageThroughput,
                totalCommands
            },
            cpuSummary: {
                peakCpu,
                averageCpu
            },
            memorySummary: {
                peakMemory,
                averageMemory
            }
        };

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
        const downloadAnchor = document.createElement("a");
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `report_active_${Date.now()}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    };

    return (
        <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans p-6 space-y-6">
            {/* Cabeçalho do Workbench */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4 md:space-y-0">
                <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                        <h1 className="text-2xl font-bold tracking-tight text-white">MM-DIRECT Workbench</h1>
                        <span className="flex h-3 w-3 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                    </div>
                    <p className="text-sm text-slate-400 mt-1">Análise empírica e instrumentação experimental em computação de alta performance</p>
                    
                    {/* Botões de Exportação na Faixa Superior */}
                    <div className="flex items-center space-x-2 pt-1">
                        <button
                            onClick={downloadActiveJsonReport}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition"
                        >
                            Exportar JSON
                        </button>
                        <button
                            onClick={() => window.print()}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-750 text-white rounded-lg text-xs font-semibold transition"
                        >
                            Exportar PDF
                        </button>
                        {(!isCpuConnected || !isDataConnected || !isMemoryConnected || !isLatencyConnected) && (
                            <button
                                onClick={() => setReconnectTrigger(prev => prev + 1)}
                                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition animate-pulse"
                            >
                                Reconexão Manual
                            </button>
                        )}
                    </div>
                </div>
                
                {/* Métricas de Status */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full md:w-auto">
                    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 min-w-[140px]">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Status</span>
                        <div className={`text-sm font-semibold mt-0.5 ${
                            systemStatus === "Estável" ? "text-emerald-400" :
                            systemStatus === "Recuperando" ? "text-amber-500 animate-pulse" :
                            systemStatus === "Falha Simulada" ? "text-rose-500" : "text-blue-400"
                        }`}>{systemStatus}</div>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 min-w-[140px]">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Modo de Operação</span>
                        <div className="text-sm font-semibold mt-0.5 text-slate-200">
                            {isDirectMode ? "MM-DIRECT (B-Tree)" : "Tradicional (AOF)"}
                        </div>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 min-w-[140px]">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Tempo de Rec.</span>
                        <div className="text-sm font-bold mt-0.5 text-blue-400">{calculatedRecoveryTimeText}</div>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 min-w-[140px]">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Atraso de Falha</span>
                        <div className="text-sm font-semibold mt-0.5 text-slate-300">
                            {configData?.restartAfterTime ? `${configData.restartAfterTime}s` : "N/A"}
                        </div>
                    </div>
                </div>
            </div>

            {/* Grid Principal - Gráfico de Throughput e Detalhes */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Gráfico Mestre */}
                <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl flex flex-col justify-between">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-semibold text-slate-250 flex items-center space-x-2">
                            <span>Taxa de Throughput (Vazão de Comandos/s)</span>
                            <span className={`inline-block w-2 h-2 rounded-full ${isDataConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-pulse'}`} title={isDataConnected ? "Conectado" : "Buscando conexão..."}></span>
                        </h2>
                        <div className="flex space-x-2 text-xs">
                            <span className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300">Tempo real</span>
                        </div>
                    </div>
                    <div className="w-full">
                        {transferChart && (
                            dataTransfer.length > 0 ? (
                                <TransactionChart
                                    data={dataTransfer}
                                    chartMode="default"
                                    failureTime={failureTime}
                                    recoveryStartTime={recoveryStartTime}
                                    recoveryEndTime={recoveryEndTime}
                                    stabilityTime={stabilityTime}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center h-[280px] text-xs text-slate-400 italic space-y-2">
                                    <div className="animate-pulse text-blue-400 font-semibold">Aguardando telemetria...</div>
                                    <div className="text-[10px] text-slate-500">Inicializando benchmark de Throughput</div>
                                </div>
                            )
                        )}
                    </div>
                </div>

                {/* Painel Lateral com Parâmetros e Console */}
                <div className="flex flex-col space-y-6">
                    {/* Parâmetros do Experimento */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl">
                        <h2 className="text-base font-semibold text-slate-200 mb-3">Parâmetros do Setup</h2>
                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between border-b border-slate-800 pb-1.5">
                                <span className="text-slate-500">Checkpoint State</span>
                                <span className="font-mono text-slate-300">{configData?.checkpointState || "OFF"}</span>
                            </div>
                            <div className="flex justify-between border-b border-slate-800 pb-1.5">
                                <span className="text-slate-500">Intervalo Indexador</span>
                                <span className="font-mono text-slate-300">{configData?.indexerTimeInterval || "500"} μs</span>
                            </div>
                            <div className="flex justify-between border-b border-slate-800 pb-1.5">
                                <span className="text-slate-500">Porta Redis</span>
                                <span className="font-mono text-slate-300">{configData?.redisPort || "6379"}</span>
                            </div>
                            <div className="flex justify-between pb-0.5">
                                <span className="text-slate-500">Benchmark Act.</span>
                                <span className="font-mono text-slate-300">{configData?.memtierBenchmarkState || "OFF"}</span>
                            </div>
                        </div>
                    </div>

                    {/* Botões de Ação Rápida */}
                    <div className="flex space-x-3 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl">
                        <button
                            onClick={() => setShowTerminal(!showTerminal)}
                            className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold transition"
                        >
                            {showTerminal ? "Ocultar Terminal" : "Ver Terminal"}
                        </button>
                        <div className="w-fit">
                            <ReloadButton onButtonClick={(e: Event) => onReloadButtonClick(e, chartConnections)} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Grade Inferior de Monitores de Sistema (Task Manager Style) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* CPU Monitor */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-3">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="text-sm font-semibold text-slate-400 flex items-center space-x-2">
                                <span>Uso de CPU</span>
                                <span className={`inline-block w-2.5 h-2.5 rounded-full ${isCpuConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-pulse'}`} title={isCpuConnected ? "Conectado" : "Buscando conexão..."}></span>
                            </h3>
                            <p className="text-xs text-slate-500">Frequência de monitoramento do sistema</p>
                        </div>
                        {dataCPU.length > 0 && (
                            <span className="text-lg font-bold text-emerald-400">
                                {dataCPU[dataCPU.length - 1][1].toFixed(1)}%
                            </span>
                        )}
                    </div>
                    <div className="w-full">
                        {cpuChart && (
                            dataCPU.length > 0 ? (
                                <CpuChart chartMode="minimalist" data={dataCPU} />
                            ) : (
                                <div className="flex flex-col items-center justify-center h-[160px] text-xs text-slate-500 italic space-y-1">
                                    <div className="animate-pulse text-emerald-400">Aguardando telemetria de CPU...</div>
                                </div>
                            )
                        )}
                    </div>
                </div>

                {/* Memory Monitor */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-3">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="text-sm font-semibold text-slate-400 flex items-center space-x-2">
                                <span>Uso de Memória RAM</span>
                                <span className={`inline-block w-2.5 h-2.5 rounded-full ${isMemoryConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-pulse'}`} title={isMemoryConnected ? "Conectado" : "Buscando conexão..."}></span>
                            </h3>
                            <p className="text-xs text-slate-500">Pico de consumo: {maxMemoryUsage.toFixed(1)} MB</p>
                        </div>
                        {dataMemory.length > 0 && (
                            <span className="text-lg font-bold text-emerald-400">
                                {dataMemory[dataMemory.length - 1][1].toFixed(1)} MB
                            </span>
                        )}
                    </div>
                    <div className="w-full">
                        {dataMemory.length > 0 ? (
                            <MemoryChart chartMode="minimalist" data={dataMemory} />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-[160px] text-xs text-slate-500 italic space-y-1">
                                <div className="animate-pulse text-emerald-400">Aguardando telemetria de Memória...</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Latency Monitor */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-3">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="text-sm font-semibold text-slate-400 flex items-center space-x-2">
                                <span>Latência das Operações</span>
                                <span className={`inline-block w-2.5 h-2.5 rounded-full ${isLatencyConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-pulse'}`} title={isLatencyConnected ? "Conectado" : "Buscando conexão..."}></span>
                            </h3>
                            <p className="text-xs text-slate-500">Normal vs Degradação por falha</p>
                        </div>
                        {dataScatter.length > 0 && (
                            <span className="text-lg font-bold text-rose-400">
                                {dataScatter[dataScatter.length - 1][1] || dataScatter[dataScatter.length - 1][2] || 0} μs
                            </span>
                        )}
                    </div>
                    <div className="w-full">
                        {dataScatter.length > 0 ? (
                            <ScatterChart chartMode="minimalist" data={dataScatter} />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-[160px] text-xs text-slate-500 italic space-y-1">
                                <div className="animate-pulse text-rose-400">Aguardando telemetria de Latência...</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Terminal em Destaque (Renderizado na base de toda a área analítica de gráficos) */}
            {showTerminal && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                        <h2 className="text-xs uppercase font-bold tracking-wider text-slate-400">Terminal Output (redis-server logs)</h2>
                    </div>
                    <TerminalController value={terminalLog} />
                </div>
            )}
            {/* Layout Científico de Impressão Acadêmica (Apenas visível ao imprimir PDF) */}
            <div className="print-report bg-white text-black font-serif leading-relaxed text-sm p-4 w-full">
                {/* Linha Dupla IEEE */}
                <div className="text-center space-y-2 border-b-2 border-double border-black pb-4 mb-6">
                    <h1 className="text-2xl font-bold tracking-wide uppercase">Relatório Técnico Experimental: MM-DIRECT vs Redis-IR (Ativo)</h1>
                    <p className="text-[10px] italic">Instrumentação científica para bancos de dados em memória baseados em árvore indexada</p>
                    <p className="text-xs">ID do Ensaio: <strong className="font-mono">run_active_{Date.now()}</strong> | Modo: <strong>{isDirectMode ? "MM-DIRECT (B-Tree)" : "Tradicional (AOF)"}</strong></p>
                </div>

                <div className="space-y-6">
                    {/* Seção 1: Resumo Analítico */}
                    <div>
                        <h2 className="text-sm uppercase font-bold border-b border-black mb-2">I. Resumo Analítico e Resultados Gerais</h2>
                        <p className="text-xs text-justify">
                            Este documento relata formalmente a execução e validação empírica do banco de dados MM-DIRECT em tempo real. 
                            O ensaio sob análise operou em modo de recuperação <strong>{isDirectMode ? "MM-DIRECT (B-Tree)" : "Tradicional (AOF)"}</strong>, 
                            com status de encerramento classificado como <strong>{systemStatus}</strong>. 
                            O tempo total de recuperação de dados e carga do banco na memória foi aferido em: <strong>{calculatedRecoveryTimeText}</strong>.
                        </p>
                    </div>

                    {/* Seção 2: Parâmetros Científicos */}
                    <div>
                        <h2 className="text-sm uppercase font-bold border-b border-black mb-2">II. Parâmetros de Entrada Utilizados</h2>
                        <table className="w-full text-xs text-left border-collapse border border-black">
                            <thead>
                                <tr className="bg-slate-100 border-b border-black">
                                    <th className="p-1.5 border-r border-black font-semibold">Parâmetro do Setup</th>
                                    <th className="p-1.5 font-semibold">Valor Configurado</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-b border-black">
                                    <td className="p-1 border-r border-black font-mono">Modo de Recuperação Instantânea</td>
                                    <td className="p-1 font-mono">{configData?.instantRecoveryState || "ON"}</td>
                                </tr>
                                <tr className="border-b border-black">
                                    <td className="p-1 border-r border-black font-mono">Intervalo de Varredura do Indexador</td>
                                    <td className="p-1 font-mono">{configData?.indexerTimeInterval || "500"} μs</td>
                                </tr>
                                <tr className="border-b border-black">
                                    <td className="p-1 border-r border-black font-mono">Simulação de Checkpointing</td>
                                    <td className="p-1 font-mono">{configData?.checkpointState || "OFF"}</td>
                                </tr>
                                <tr className="border-b border-black">
                                    <td className="p-1 border-r border-black font-mono">Intervalo Fixo de Checkpoint</td>
                                    <td className="p-1 font-mono">{configData?.checkpointTimeInterval || "60"}s</td>
                                </tr>
                                <tr className="border-b border-black">
                                    <td className="p-1 border-r border-black font-mono">Carga com Memtier Benchmark</td>
                                    <td className="p-1 font-mono">{configData?.memtierBenchmarkState || "OFF"}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Seção 3: Cronologia dos Marcos */}
                    <div>
                        <h2 className="text-sm uppercase font-bold border-b border-black mb-2">III. Cronologia Operacional de Eventos</h2>
                        <table className="w-full text-xs text-left border-collapse border border-black">
                            <thead>
                                <tr className="bg-slate-100 border-b border-black">
                                    <th className="p-1.5 border-r border-black font-semibold">Marco Temporal</th>
                                    <th className="p-1.5 font-semibold">Instante da Ocorrência</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-b border-black">
                                    <td className="p-1 border-r border-black font-mono">Início da Recuperação (UTC)</td>
                                    <td className="p-1 font-mono">{recoveryStartAtUtc || "N/A"}</td>
                                </tr>
                                <tr className="border-b border-black">
                                    <td className="p-1 border-r border-black font-mono">Recuperação Concluída (UTC)</td>
                                    <td className="p-1 font-mono">{recoveryEndAtUtc || "N/A"}</td>
                                </tr>
                                <tr className="border-b border-black">
                                    <td className="p-1 border-r border-black font-mono">Tempo de Recuperação</td>
                                    <td className="p-1 font-mono">{calculatedRecoveryTimeText}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Seção 4: Consumo e Vazão */}
                    <div>
                        <h2 className="text-sm uppercase font-bold border-b border-black mb-2">IV. Vazão Científica e Perfil de Recursos (Parcial)</h2>
                        <table className="w-full text-xs text-left border-collapse border border-black">
                            <thead>
                                <tr className="bg-slate-100 border-b border-black">
                                    <th className="p-1.5 border-r border-black font-semibold">Métrica de Instrumentação</th>
                                    <th className="p-1.5 font-semibold">Resultados Obtidos</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-b border-black">
                                    <td className="p-1 border-r border-black font-mono">Média de Throughput</td>
                                    <td className="p-1 font-mono">
                                        {dataTransfer.length > 0
                                            ? (dataTransfer.reduce((acc, curr) => acc + curr[1], 0) / dataTransfer.length).toFixed(2)
                                            : 0} cmd/s
                                    </td>
                                </tr>
                                <tr className="border-b border-black">
                                    <td className="p-1 border-r border-black font-mono">Pico de CPU Registrado</td>
                                    <td className="p-1 font-mono">
                                        {dataCPU.length > 0
                                            ? Math.max(...dataCPU.map(item => item[1])).toFixed(1)
                                            : 0}%
                                    </td>
                                </tr>
                                <tr>
                                    <td className="p-1 border-r border-black font-mono">Pico de Consumo RAM</td>
                                    <td className="p-1 font-mono">{maxMemoryUsage.toFixed(1)} MB</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Assinaturas */}
                    <div className="pt-16 grid grid-cols-2 gap-8 text-center text-xs">
                        <div className="border-t border-black pt-2">
                            <strong>Assinatura do Pesquisador</strong>
                            <p className="text-[10px] text-slate-500">Validação Científica MM-DIRECT</p>
                        </div>
                        <div className="border-t border-black pt-2">
                            <strong>Instrumentação em Computação de Alto Desempenho</strong>
                            <p className="text-[10px] text-slate-500">Laboratório de Sistemas de Banco de Dados</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ChartBoard;
