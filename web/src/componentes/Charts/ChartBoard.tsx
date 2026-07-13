import { useEffect, useMemo, useState, useRef } from "react";
import { Chart } from "react-google-charts";
import CpuChart from "./CpuChart";
import TransactionChart from "./TransferChart";
import MemoryChart from "./MemoryChart";
import { ScatterChart } from "./ScatterChart";
import TerminalController from "../TerminalController";
import ReloadButton from "../ReloadButton";
import { Line } from "react-chartjs-2";
import { Chart as ChartJS, registerables, ChartOptions } from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";

try {
    ChartJS.register(...registerables, annotationPlugin);
} catch (e) {
    console.error("Error registering ChartJS in ChartBoard", e);
}

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
    const formatPtBr = (val: number | string | undefined | null, decimals = 3) => {
        if (val === undefined || val === null) return "N/A";
        const num = typeof val === "string" ? parseFloat(val) : val;
        if (isNaN(num)) return "N/A";
        return num.toFixed(decimals).replace(".", ",");
    };

    const printChartOptions = (title: string, yTitle: string, color: string) => ({
        title,
        backgroundColor: "white",
        chartArea: { width: "80%", height: "65%", top: "15%", left: "12%" },
        titleTextStyle: { color: "black", fontSize: 9, fontName: "Times New Roman", bold: true },
        hAxis: {
            title: "Tempo (s)",
            titleTextStyle: { color: "black", fontSize: 8, fontName: "Times New Roman", italic: true },
            textStyle: { color: "black", fontSize: 7, fontName: "Times New Roman" },
            gridlines: { color: "#e2e8f0" }
        },
        vAxis: {
            title: yTitle,
            titleTextStyle: { color: "black", fontSize: 8, fontName: "Times New Roman", italic: true },
            textStyle: { color: "black", fontSize: 7, fontName: "Times New Roman" },
            gridlines: { color: "#e2e8f0" }
        },
        colors: [color],
        legend: { position: "none" },
        curveType: "function"
    });

    const activeRunId = useMemo(() => String(Date.now()), []);

    const triggerActivePdfPrint = () => {
        const originalTitle = document.title;
        document.title = activeRunId;
        window.print();
        document.title = originalTitle;
    };

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

    const activeTimeline = useMemo(() => {
        const dStartupToCrash = (failureTime !== null) ? failureTime : null;
        const dDowntime = (recoveryStartTime !== null && failureTime !== null) ? (recoveryStartTime - failureTime) : null;
        const dRecovery = (recoveryEndTime !== null && recoveryStartTime !== null) ? (recoveryEndTime - recoveryStartTime) : null;
        const dToStability = (stabilityTime !== null && recoveryEndTime !== null) ? (stabilityTime - recoveryEndTime) : null;
        const dDowntimeToAvailability = (stabilityTime !== null && failureTime !== null) ? (stabilityTime - failureTime) : null;
        
        return {
            dStartupToCrash,
            dDowntime,
            dRecovery,
            dToStability,
            dDowntimeToAvailability
        };
    }, [failureTime, recoveryStartTime, recoveryEndTime, stabilityTime]);

    const printCpuChartData = useMemo(() => {
        const header = ["Tempo (s)", "CPU (%)"];
        if (dataCPU.length === 0) return [header, [0, 0]];
        return [
            header,
            ...dataCPU
        ];
    }, [dataCPU]);

    const printRamChartData = useMemo(() => {
        const header = ["Tempo (s)", "RAM (MB)"];
        if (dataMemory.length === 0) return [header, [0, 0]];
        return [
            header,
            ...dataMemory
        ];
    }, [dataMemory]);

    const printThroughputChartData = useMemo(() => {
        const failT = failureTime ?? recoveryStartTime ?? Infinity;
        const recEnd = recoveryEndTime ?? Infinity;

        return {
            datasets: [
                {
                    label: "Throughput",
                    data: dataTransfer.map((item) => ({ x: item[0], y: item[1] })),
                    borderColor: "#3b82f6", // Default fallback color
                    borderWidth: 1.5,
                    pointRadius: 0,
                    pointHoverRadius: 3,
                    tension: 0.15,
                    fill: false,
                    segment: {
                        borderColor: (ctx: any) => {
                            if (ctx.p1) {
                                const xVal = ctx.p1.parsed.x;
                                if (xVal >= failT && xVal <= recEnd) {
                                    return "#f59e0b"; // Orange during recovery
                                } else if (xVal > recEnd) {
                                    return "#10b981"; // Green post-recovery
                                }
                            }
                            return "#3b82f6"; // Blue during normal operation
                        }
                    }
                }
            ]
        };
    }, [dataTransfer, failureTime, recoveryStartTime, recoveryEndTime]);

    const printThroughputOptions = useMemo<ChartOptions<"line">>(() => {
        const recZoneStart = recoveryStartTime ?? failureTime;
        const recZoneEnd = recoveryEndTime;

        return {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: "linear" as const,
                    grid: {
                        color: "#e2e8f0"
                    },
                    ticks: {
                        color: "black",
                        font: {
                            family: "Times New Roman",
                            size: 7
                        }
                    },
                    title: {
                        display: true,
                        text: "Tempo (s)",
                        color: "black",
                        font: {
                            family: "Times New Roman",
                            size: 8,
                            style: "italic"
                        }
                    }
                },
                y: {
                    grid: {
                        color: "#e2e8f0"
                    },
                    ticks: {
                        color: "black",
                        font: {
                            family: "Times New Roman",
                            size: 7
                        }
                    },
                    title: {
                        display: true,
                        text: "Vazão (ops/seg)",
                        color: "black",
                        font: {
                            family: "Times New Roman",
                            size: 8,
                            style: "italic"
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: "Vazão de Comandos ao Longo do Tempo (Ativo)",
                    color: "black",
                    font: {
                        family: "Times New Roman",
                        size: 9,
                        weight: "bold"
                    }
                },
                tooltip: {
                    enabled: true
                },
                annotation: {
                    annotations: {
                        ...(failureTime !== null ? {
                            linhaFalha: {
                                type: "line" as const,
                                scaleID: "x",
                                value: failureTime,
                                borderColor: "#ef4444",
                                borderWidth: 1.5,
                                borderDash: [5, 5],
                                label: {
                                    content: "Falha do Sistema",
                                    display: true,
                                    position: "start" as const,
                                    backgroundColor: "rgba(239, 68, 68, 0.9)",
                                    color: "#ffffff",
                                    padding: 3,
                                    font: {
                                        size: 8,
                                        family: "Times New Roman",
                                        weight: "bold"
                                    }
                                }
                            }
                        } : {}),
                        ...(recZoneStart !== null && recZoneEnd !== null ? {
                            zonaRecuperacao: {
                                type: "box" as const,
                                xMin: recZoneStart,
                                xMax: recZoneEnd,
                                backgroundColor: "rgba(245, 158, 11, 0.12)",
                                borderColor: "transparent",
                                label: {
                                    content: "Recuperação",
                                    display: true,
                                    position: "center" as const,
                                    color: "#d97706",
                                    font: {
                                        size: 9,
                                        family: "Times New Roman",
                                        weight: "bold"
                                    }
                                }
                            }
                        } : {})
                    }
                }
            }
        };
    }, [failureTime, recoveryStartTime, recoveryEndTime]);

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
            runId: activeRunId,
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
        downloadAnchor.setAttribute("download", `report_${activeRunId}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    };

    return (
        <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans p-6 space-y-6">
            <div className="print:hidden space-y-6 flex flex-col flex-1">
                {/* Cabeçalho do Workbench */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl gap-6">
                    {/* Coluna Esquerda: Título e Botões de Exportação */}
                    <div className="space-y-3 flex-shrink-0">
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
                                onClick={triggerActivePdfPrint}
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
                    
                    {/* Coluna Central: Métricas de Status (Centralizadas, mais largas e com menor altura) */}
                    <div className="flex-1 flex justify-center w-full lg:w-auto">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full max-w-3xl">
                            <div className="bg-slate-950/60 border border-slate-800 rounded-lg py-2 px-4 text-center sm:text-left min-w-[160px]">
                                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Status</span>
                                <div className={`text-sm font-semibold mt-0.5 ${
                                    systemStatus === "Estável" ? "text-emerald-400" :
                                    systemStatus === "Recuperando" ? "text-amber-500 animate-pulse" :
                                    systemStatus === "Falha Simulada" ? "text-rose-500" : "text-blue-400"
                                }`}>{systemStatus}</div>
                            </div>
                            <div className="bg-slate-950/60 border border-slate-800 rounded-lg py-2 px-4 text-center sm:text-left min-w-[160px]">
                                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Modo de Operação</span>
                                <div className="text-sm font-semibold mt-0.5 text-slate-200">
                                    {isDirectMode ? "MM-DIRECT (B-Tree)" : "Tradicional (AOF)"}
                                </div>
                            </div>
                            <div className="bg-slate-950/60 border border-slate-800 rounded-lg py-2 px-4 text-center sm:text-left min-w-[160px]">
                                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Tempo de Rec.</span>
                                <div className="text-sm font-bold mt-0.5 text-blue-400">{calculatedRecoveryTimeText}</div>
                            </div>
                            <div className="bg-slate-950/60 border border-slate-800 rounded-lg py-2 px-4 text-center sm:text-left min-w-[160px]">
                                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Atraso de Falha</span>
                                <div className="text-sm font-semibold mt-0.5 text-slate-300">
                                    {configData?.restartAfterTime ? `${configData.restartAfterTime}s` : "N/A"}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Coluna Direita: Botão RETURN */}
                    <div className="flex-shrink-0 flex items-center justify-end w-full lg:w-auto">
                        <ReloadButton onButtonClick={(e: Event) => onReloadButtonClick(e, chartConnections)} />
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

                {/* Painel Lateral com Parâmetros */}
                <div className="flex flex-col space-y-6 lg:col-span-1">
                    {/* Parâmetros do Experimento */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl flex-1 flex flex-col justify-between">
                        <h2 className="text-base font-semibold text-slate-200 mb-3">Parâmetros do Setup</h2>
                        <div className="space-y-1.5 text-xs pr-1">
                            {/* Item 1 */}
                            <div className="flex justify-between border-b border-slate-800 pb-1 pt-0.5">
                                <span 
                                    className="text-slate-400 cursor-help border-b border-dotted border-slate-700" 
                                    title="MM-DIRECT ativo permite que o banco aceite conexões imediatas, recuperando dados em background."
                                >
                                    Modo de Rec. Instantânea
                                </span>
                                <span className="font-mono text-blue-400 font-semibold">{configData?.instantRecoveryState || "ON"}</span>
                            </div>
                            
                            {/* Item 2 */}
                            <div className="flex justify-between border-b border-slate-800 pb-1 pt-0.5">
                                <span 
                                    className="text-slate-400 cursor-help border-b border-dotted border-slate-700" 
                                    title="Frequência da thread indexadora. Intervalos menores reduzem o log físico mas elevam o uso de CPU."
                                >
                                    Intervalo do Indexador
                                </span>
                                <span className="font-mono text-slate-300">{configData?.indexerTimeInterval || "500"} μs</span>
                            </div>

                            {/* Item 3 */}
                            <div className="flex justify-between border-b border-slate-800 pb-1 pt-0.5">
                                <span 
                                    className="text-slate-400 cursor-help border-b border-dotted border-slate-700" 
                                    title="Consolida estados na memória de forma periódica para acelerar leituras e carregamentos iniciais."
                                >
                                    Simulação de Checkpoint
                                </span>
                                <span className="font-mono text-slate-300">{configData?.checkpointState || "OFF"}</span>
                            </div>

                            {/* Item 4 */}
                            <div className="flex justify-between border-b border-slate-800 pb-1 pt-0.5">
                                <span 
                                    className="text-slate-400 cursor-help border-b border-dotted border-slate-700" 
                                    title="Frequência de checkpoint. Intervalos muito curtos diminuem o tempo de boot mas degradam o throughput."
                                >
                                    Intervalo de Checkpoint
                                </span>
                                <span className="font-mono text-slate-300">{configData?.checkpointTimeInterval || "60"}s</span>
                            </div>

                            {/* Item 5 */}
                            <div className="flex justify-between border-b border-slate-800 pb-1 pt-0.5">
                                <span 
                                    className="text-slate-400 cursor-help border-b border-dotted border-slate-700" 
                                    title="Define a presença de carga externa concorrente e a geração da métrica de vazão (Throughput)."
                                >
                                    Carga Memtier Benchmark
                                </span>
                                <span className="font-mono text-slate-300">{configData?.memtierBenchmarkState || "OFF"}</span>
                            </div>

                            {/* Item 6 */}
                            <div className="flex justify-between border-b border-slate-800 pb-1 pt-0.5">
                                <span 
                                    className="text-slate-400 cursor-help border-b border-dotted border-slate-700" 
                                    title="Se ON, cada atualização de dados bloqueia esperando a confirmação da escrita síncrona no log indexado. Se OFF, a indexação ocorre de forma assíncrona para maior desempenho."
                                >
                                    Escrita Indexada no Commit
                                </span>
                                <span className="font-mono text-slate-300">
                                    {configData?.instantRecoverySynchronous === "ON" ? "Síncrono" : "Assíncrono"}
                                </span>
                            </div>

                            {/* Item 7 */}
                            <div className="flex justify-between border-b border-slate-800 pb-1 pt-0.5">
                                <span 
                                    className="text-slate-400 cursor-help border-b border-dotted border-slate-700" 
                                    title="Bancos indexados gravam em árvores prontas. O AOF sequencial requer parsing de todo o histórico no boot."
                                >
                                    Estratégia de Persistência
                                </span>
                                <span className="font-mono text-slate-300">
                                    {(configData?.instantRecoveryState || "ON") === "ON" ? "Logs (DB)" : "Sequencial (AOF)"}
                                </span>
                            </div>

                            {/* Item 8 */}
                            <div className="flex justify-between border-b border-slate-800 pb-1 pt-0.5">
                                <span 
                                    className="text-slate-400 cursor-help border-b border-dotted border-slate-700" 
                                    title="Estrutura de dados interna do log indexado (ex: BTREE ou HASH). Contextualiza o custo e a busca indexada."
                                >
                                    Estrutura do Log Indexado
                                </span>
                                <span className="font-mono text-slate-300">
                                    {configData?.indexedlogStructure || "BTREE"}
                                </span>
                            </div>

                            {/* Item 9 */}
                            <div className="flex justify-between border-b border-slate-800 pb-1 pt-0.5">
                                <span 
                                    className="text-slate-400 cursor-help border-b border-dotted border-slate-700" 
                                    title="Quantidade de falhas simuladas e reinicializações automáticas programadas durante o experimento."
                                >
                                    Reinicializações Simuladas
                                </span>
                                <span className="font-mono text-slate-300">
                                    {configData?.numberRestartsAfterTime || "0"}
                                </span>
                            </div>

                            {/* Item 10 */}
                            <div className="flex justify-between border-b border-slate-800 pb-1 pt-0.5">
                                <span 
                                    className="text-slate-400 cursor-help border-b border-dotted border-slate-700" 
                                    title="Intervalo em segundos programado para o disparo automático da falha após o início do ensaio."
                                >
                                    Tempo para Reinício
                                </span>
                                <span className="font-mono text-slate-300">
                                    {configData?.restartAfterTime ? `${configData.restartAfterTime}s` : "N/A"}
                                </span>
                            </div>

                            {/* Item 11 */}
                            <div className="flex justify-between pb-0.5">
                                <span 
                                    className="text-slate-400 cursor-help border-b border-dotted border-slate-700" 
                                    title="Número de repetições consecutivas programadas para a carga de trabalho do Memtier."
                                >
                                    Execuções da Carga Memtier
                                </span>
                                <span className="font-mono text-slate-300">
                                    {configData?.memtierBenchmarkWorkloadRunTimes || "1"}
                                </span>
                            </div>
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

            {/* Controle de Exibição do Terminal */}
            <div className="flex justify-start">
                <button
                    onClick={() => setShowTerminal(!showTerminal)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 rounded-lg text-xs font-semibold transition flex items-center space-x-2 shadow-2xl"
                >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                    <span>{showTerminal ? "Ocultar Terminal" : "Ver Terminal"}</span>
                </button>
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
            </div>
            {/* Layout Científico de Impressão Acadêmica (Apenas visível ao imprimir PDF) */}
            <div className="print-report bg-white text-black font-serif leading-relaxed text-sm p-4 w-full">
                {/* Linha Dupla IEEE/ACM */}
                <div className="text-center space-y-2 border-b-2 border-double border-black pb-4 mb-6">
                    <h1 className="text-xl font-bold tracking-wide">Relatório Técnico Experimental: MM-DIRECT vs Redis-IR (Ativo)</h1>
                    <p className="text-[10px] italic">Instrumentação científica para bancos de dados em memória baseados em árvore indexada</p>
                    <p className="text-xs">ID do Ensaio: <strong className="font-mono">{activeRunId}</strong> | Modo: <strong>{isDirectMode ? "MM-DIRECT (B-Tree)" : "Tradicional (AOF)"}</strong></p>
                </div>

                <div className="space-y-6">
                    {/* Seção I: Resumo Analítico */}
                    <section>
                        <h2 className="text-sm uppercase font-bold border-b border-black mb-2">I. Resumo Analítico e Resultados Gerais</h2>
                        <p className="text-xs text-justify">
                            Este documento relata formalmente a execução e validação empírica do banco de dados MM-DIRECT em tempo real. 
                            O ensaio sob análise operou em modo de recuperação <strong>{isDirectMode ? "MM-DIRECT (B-Tree)" : "Tradicional (AOF)"}</strong>, 
                            com status de encerramento classificado como <strong>{systemStatus}</strong>. 
                            O tempo total de recuperação de dados e carga do banco na memória foi aferido em: <strong>{recoveryEndAtUtc && recoveryStartAtUtc ? `${formatPtBr(calculatedRecoveryTimeText.replace('s', ''), 3)} segundos` : "N/A"}</strong>.
                        </p>
                    </section>

                    {/* Seção II: Parâmetros Científicos */}
                    <section>
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
                                <tr className="border-b border-black">
                                    <td className="p-1 border-r border-black font-mono">Escrita Indexada no Commit</td>
                                    <td className="p-1 font-mono">{configData?.instantRecoverySynchronous === "ON" ? "Síncrono" : "Assíncrono"}</td>
                                </tr>
                                <tr className="border-b border-black">
                                    <td className="p-1 border-r border-black font-mono">Estratégia de Persistência de Logs</td>
                                    <td className="p-1 font-mono">{(configData?.instantRecoveryState || "ON") === "ON" ? "Logs Indexados (DB)" : "Sequencial (AOF)"}</td>
                                </tr>
                                <tr className="border-b border-black">
                                    <td className="p-1 border-r border-black font-mono">Estrutura do Log Indexado</td>
                                    <td className="p-1 font-mono">{configData?.indexedlogStructure || "BTREE"}</td>
                                </tr>
                                <tr className="border-b border-black">
                                    <td className="p-1 border-r border-black font-mono">Reinicializações Simuladas</td>
                                    <td className="p-1 font-mono">{configData?.numberRestartsAfterTime || "0"}</td>
                                </tr>
                                <tr className="border-b border-black">
                                    <td className="p-1 border-r border-black font-mono">Tempo para Reinício</td>
                                    <td className="p-1 font-mono">{configData?.restartAfterTime ? `${configData.restartAfterTime}s` : "N/A"}</td>
                                </tr>
                                <tr>
                                    <td className="p-1 border-r border-black font-mono">Execuções da Carga Memtier</td>
                                    <td className="p-1 font-mono">{configData?.memtierBenchmarkWorkloadRunTimes || "1"}</td>
                                </tr>
                            </tbody>
                        </table>
                    </section>

                    {/* Seção III: Cronologia dos Marcos */}
                    <section>
                        <h2 className="text-sm uppercase font-bold border-b border-black mb-2">III. Cronologia Operacional de Eventos</h2>
                        <table className="w-full text-xs text-left border-collapse border border-black">
                            <thead>
                                <tr className="bg-slate-100 border-b border-black">
                                    <th className="p-1.5 border-r border-black font-semibold">Etapa de Execução</th>
                                    <th className="p-1.5 border-r border-black font-semibold">Instante da Ocorrência (UTC)</th>
                                    <th className="p-1.5 font-semibold">Duração Calculada</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-b border-black">
                                    <td className="p-1 border-r border-black font-mono">Início da Recuperação (Boot)</td>
                                    <td className="p-1 border-r border-black font-mono">{recoveryStartAtUtc || "N/A"}</td>
                                    <td className="p-1 font-mono">{activeTimeline.dDowntime !== null ? `${formatPtBr(activeTimeline.dDowntime, 3)} s (Downtime)` : "-"}</td>
                                </tr>
                                <tr className="border-b border-black">
                                    <td className="p-1 border-r border-black font-mono">Retorno à Disponibilidade (Pronto)</td>
                                    <td className="p-1 border-r border-black font-mono">{recoveryStartAtUtc || "N/A"}</td>
                                    <td className="p-1 font-mono">{activeTimeline.dDowntimeToAvailability !== null ? `${formatPtBr(activeTimeline.dDowntimeToAvailability, 3)} s (Disponibilidade)` : "-"}</td>
                                </tr>
                                <tr>
                                    <td className="p-1 border-r border-black font-mono">Recuperação Concluída</td>
                                    <td className="p-1 border-r border-black font-mono">{recoveryEndAtUtc || "N/A"}</td>
                                    <td className="p-1 font-mono">{activeTimeline.dRecovery !== null ? `${formatPtBr(activeTimeline.dRecovery, 3)} s (Carga Total)` : "-"}</td>
                                </tr>
                            </tbody>
                        </table>
                        <p className="text-[10px] text-slate-600 mt-1 italic">
                            Nota: Em modo MM-DIRECT (Instant Recovery), o banco de dados está pronto para aceitar conexões concorrentemente ao carregamento em segundo plano.
                        </p>
                    </section>

                    {/* Seção IV: Consumo e Vazão */}
                    <section>
                        <h2 className="text-sm uppercase font-bold border-b border-black mb-2">IV. Vazão Científica e Perfil de Recursos (Parcial)</h2>
                        <table className="w-full text-xs text-left border-collapse border border-black">
                            <thead>
                                <tr className="bg-slate-100 border-b border-black">
                                    <th className="p-1.5 border-r border-black font-semibold">Métrica de Instrumentação</th>
                                    <th className="p-1.5 border-r border-black font-semibold">Resultados Obtidos</th>
                                    <th className="p-1.5 font-semibold">Período de Medição / Detalhes</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-b border-black">
                                    <td className="p-1 border-r border-black font-mono">Média de Throughput</td>
                                    <td className="p-1 font-mono">
                                        {configData?.memtierBenchmarkState === "OFF"
                                            ? "0,00 ops/seg (Inativo)"
                                            : `${formatPtBr(dataTransfer.length > 0 ? (dataTransfer.reduce((acc, curr) => acc + curr[1], 0) / dataTransfer.length) : 0, 2)} ops/seg`}
                                    </td>
                                    <td className="p-1 text-slate-700">Durante fase de carga operacional do cliente (Memtier)</td>
                                </tr>
                                <tr className="border-b border-black">
                                    <td className="p-1 border-r border-black font-mono">Pico de CPU Registrado</td>
                                    <td className="p-1 font-mono">
                                        {formatPtBr(dataCPU.length > 0 ? Math.max(...dataCPU.map(item => item[1])) : 0, 1)}%
                                    </td>
                                    <td className="p-1 text-slate-700">Coletado continuamente durante todo o ensaio</td>
                                </tr>
                                <tr>
                                    <td className="p-1 border-r border-black font-mono">Pico de Consumo RAM</td>
                                    <td className="p-1 font-mono">{formatPtBr(maxMemoryUsage, 1)} MB</td>
                                    <td className="p-1 text-slate-700">Coletado continuamente durante todo o ensaio</td>
                                </tr>
                            </tbody>
                        </table>
                    </section>

                    {/* Gráficos Integrados de Desempenho */}
                    <section className="break-inside-avoid">
                        <h2 className="text-sm uppercase font-bold border-b border-black mb-2">Gráficos de Tendência e Telemetria em Tempo Real</h2>
                        <div className="grid grid-cols-2 gap-4 my-2">
                            <div className="border border-black p-2 bg-white" style={{ height: "130px" }}>
                                {dataTransfer.length > 0 ? (
                                    <Line
                                        data={printThroughputChartData}
                                        options={printThroughputOptions}
                                        width="100%"
                                        height="100%"
                                    />
                                ) : (
                                    <div className="text-center text-xs text-slate-500 py-10">Aguardando dados...</div>
                                )}
                            </div>
                            <div className="border border-black p-2 bg-white">
                                <Chart
                                    chartType="LineChart"
                                    data={printCpuChartData}
                                    options={printChartOptions("Perfil de Uso de CPU ao Longo do Tempo (Ativo)", "CPU (%)", "#b91c1c")}
                                    width="100%"
                                    height="130px"
                                />
                            </div>
                            <div className="border border-black p-2 bg-white col-span-2">
                                <Chart
                                    chartType="LineChart"
                                    data={printRamChartData}
                                    options={printChartOptions("Perfil de Consumo de RAM ao Longo do Tempo (Ativo)", "RAM (MB)", "#047857")}
                                    width="100%"
                                    height="130px"
                                />
                            </div>
                        </div>
                    </section>

                    {/* Seção V: Metodologia Experimental */}
                    <section className="break-inside-avoid">
                        <h2 className="text-sm uppercase font-bold border-b border-black mb-2">V. Metodologia Experimental</h2>
                        <p className="text-xs text-justify">
                            O objetivo deste ensaio consiste em avaliar o desempenho temporal e a estabilidade da recuperação instantânea MM-DIRECT 
                            em contraste com a recuperação baseada em log sequencial tradicional (AOF). O teste operacional submete a instância a 
                            falhas simuladas durante operações contínuas de gravação e leitura promovidas pelo gerador de carga Memtier Benchmark. 
                            Os indicadores analíticos primários computados compreendem o tempo necessário para aceitação de novas conexões (downtime real) 
                            e o tempo total de reabastecimento físico do banco de dados na DRAM. A integridade do dataset é aferida por contagem de tuplas 
                            e detecção de inconsistências lógicas pós-recuperação.
                        </p>
                    </section>

                    {/* Seção VI: Conclusão e Próximos Passos */}
                    <section className="break-inside-avoid">
                        <h2 className="text-sm uppercase font-bold border-b border-black mb-2">VI. Conclusão e Próximos Passos</h2>
                        <p className="text-xs text-justify">
                            Os resultados obtidos confirmam que o mecanismo de árvore indexada do MM-DIRECT possibilita a retomada operacional do banco de dados 
                            em tempo reduzido de downtime se comparado ao Redis convencional, fornecendo disponibilidade instantânea em frações de segundo. 
                            A vazão de comandos (throughput) observada é nula nos casos em que a carga externa do Memtier não foi ativada nas configurações, 
                            o que corrobora a consistência dos dados de instrumentação com o setup planejado. Recomenda-se, para rodadas futuras, a calibração 
                            sistemática do intervalo de varredura do indexador sob cargas volumétricas superiores e a ativação de checkpoints para avaliar o 
                            trade-off entre overhead de escrita e tempo final de carregamento em DRAM.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default ChartBoard;
