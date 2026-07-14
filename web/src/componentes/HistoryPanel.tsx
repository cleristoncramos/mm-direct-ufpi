import { useEffect, useState, useMemo } from "react";
import { Line } from "react-chartjs-2";
import { Chart as ChartJS, registerables, ChartOptions } from "chart.js";

try {
    ChartJS.register(...registerables);
} catch (e) {
    console.error("Error registering ChartJS in HistoryPanel", e);
}

interface HistoryPanelProps {
    onBack: () => void;
}

const HistoryPanel = ({ onBack }: HistoryPanelProps) => {
    const [runs, setRuns] = useState<any[]>([]);
    const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
    const [compareAId, setCompareAId] = useState<string | null>(null);
    const [compareBId, setCompareBId] = useState<string | null>(null);

    const [telemetryA, setTelemetryA] = useState<any>(null);
    const [telemetryB, setTelemetryB] = useState<any>(null);
    const [loadingTelemetry, setLoadingTelemetry] = useState<boolean>(false);

    const [selectedTelemetry, setSelectedTelemetry] = useState<any>(null);
    const [_, setLoadingSelectedTelemetry] = useState<boolean>(false);

    // Carrega a telemetria do ensaio selecionado individualmente
    useEffect(() => {
        if (!selectedRunId) {
            setSelectedTelemetry(null);
            return;
        }
        setLoadingSelectedTelemetry(true);
        fetch(`http://localhost:8081/api/runs/${selectedRunId}/telemetry`)
            .then((res) => res.json())
            .then((data) => setSelectedTelemetry(data))
            .catch((err) => console.error("Erro ao carregar telemetria do ensaio:", err))
            .finally(() => setLoadingSelectedTelemetry(false));
    }, [selectedRunId]);

    // 1. Carrega a lista de ensaios do backend
    const loadRunsList = () => {
        fetch("http://localhost:8081/api/runs")
            .then((res) => res.json())
            .then((data) => {
                setRuns(data);
                if (data.length > 0 && !selectedRunId) {
                    setSelectedRunId(data[0].id);
                }
            })
            .catch((err) => console.error("Erro ao carregar ensaios:", err));
    };

    useEffect(() => {
        loadRunsList();
    }, []);

    // Encontra o ensaio selecionado atualmente
    const selectedRun = useMemo(() => {
        return runs.find((r) => r.id === selectedRunId) || null;
    }, [runs, selectedRunId]);

    const runA = useMemo(() => runs.find((r) => r.id === compareAId) || null, [runs, compareAId]);
    const runB = useMemo(() => runs.find((r) => r.id === compareBId) || null, [runs, compareBId]);

    // 2. Carrega a telemetria ao selecionar ensaios para comparação
    useEffect(() => {
        if (!compareAId && !compareBId) {
            setTelemetryA(null);
            setTelemetryB(null);
            return;
        }

        setLoadingTelemetry(true);
        const promises = [];

        if (compareAId) {
            promises.push(
                fetch(`http://localhost:8081/api/runs/${compareAId}/telemetry`)
                    .then((res) => res.json())
                    .then((data) => setTelemetryA(data))
            );
        } else {
            setTelemetryA(null);
        }

        if (compareBId) {
            promises.push(
                fetch(`http://localhost:8081/api/runs/${compareBId}/telemetry`)
                    .then((res) => res.json())
                    .then((data) => setTelemetryB(data))
            );
        } else {
            setTelemetryB(null);
        }

        Promise.all(promises).finally(() => setLoadingTelemetry(false));
    }, [compareAId, compareBId]);

    // 3. Mescla as curvas de vazão para o gráfico de comparação
    const comparisonThroughputData = useMemo(() => {
        if (!telemetryA || !telemetryB || !runA || !runB) return null;

        const map = new Map<number, [number | null, number | null]>();

        telemetryA.throughput.forEach(([sec, val]: any) => {
            map.set(sec, [val, null]);
        });

        telemetryB.throughput.forEach(([sec, val]: any) => {
            if (map.has(sec)) {
                map.get(sec)![1] = val;
            } else {
                map.set(sec, [null, val]);
            }
        });

        const sortedSecs = Array.from(map.keys()).sort((a, b) => a - b);

        return {
            datasets: [
                {
                    label: `${runA.metadata?.mode} (Run A)`,
                    data: sortedSecs.map((sec) => ({ x: sec, y: map.get(sec)![0] })),
                    borderColor: "#3b82f6", // Blue
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.15,
                    spanGaps: true
                },
                {
                    label: `${runB.metadata?.mode} (Run B)`,
                    data: sortedSecs.map((sec) => ({ x: sec, y: map.get(sec)![1] })),
                    borderColor: "#10b981", // Green
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.15,
                    spanGaps: true
                }
            ]
        };
    }, [telemetryA, telemetryB, runA, runB]);

    // Opções de design escuro profissional para o gráfico de comparação
    const comparisonChartOptionsJS = useMemo<ChartOptions<"line">>(() => {
        return {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: "linear" as const,
                    grid: { color: "#334155" }, // slate-700
                    ticks: { color: "#94a3b8" },
                    title: { display: true, text: "Tempo do Experimento (segundos)", color: "#cbd5e1" }
                },
                y: {
                    grid: { color: "#334155" },
                    ticks: { color: "#94a3b8" },
                    title: { display: true, text: "Operações por Segundo (ops/s)", color: "#cbd5e1" }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    labels: { color: "#cbd5e1" }
                }
            }
        };
    }, []);

    // Helper para formatar números em português do Brasil
    const formatPtBr = (val: number | string | undefined | null, decimals = 3) => {
        if (val === undefined || val === null) return "N/A";
        const num = typeof val === "string" ? parseFloat(val) : val;
        if (isNaN(num)) return "N/A";
        return num.toFixed(decimals).replace(".", ",");
    };

    // Helper para formatar tamanho em MB
    const formatSizeMb = (bytes: number | undefined | null) => {
        if (bytes === undefined || bytes === null) return "N/A";
        return formatPtBr(bytes / (1024 * 1024), 2) + " MB";
    };

    // Opções de gráficos em preto e branco de alta legibilidade para a impressão PDF
    const printChartOptionsJS = (title: string, yTitle: string) => ({
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                type: "linear" as const,
                grid: { color: "#e2e8f0" },
                ticks: { color: "black", font: { family: "Times New Roman", size: 7 } },
                title: { display: true, text: "Tempo (s)", color: "black", font: { family: "Times New Roman", size: 8, style: "italic" as const } }
            },
            y: {
                grid: { color: "#e2e8f0" },
                ticks: { color: "black", font: { family: "Times New Roman", size: 7 } },
                title: { display: true, text: yTitle, color: "black", font: { family: "Times New Roman", size: 8, style: "italic" as const } }
            }
        },
        plugins: {
            legend: { display: false },
            title: {
                display: true,
                text: title,
                color: "black",
                font: { family: "Times New Roman", size: 9, weight: "bold" as const }
            }
        }
    });

    const historyChartOptionsJS = (yTitle: string) => {
        return {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: "linear" as const,
                    grid: { color: "#1e293b" }, // slate-800
                    ticks: { color: "#64748b" },
                    title: { display: true, text: "Tempo (s)", color: "#94a3b8" }
                },
                y: {
                    grid: { color: "#1e293b" },
                    ticks: { color: "#64748b" },
                    title: { display: true, text: yTitle, color: "#94a3b8" }
                }
            },
            plugins: {
                legend: { display: false }
            }
        };
    };

    // Calcula marcos de cronologia e durações do ensaio selecionado
    const selectedRunTimeline = useMemo(() => {
        if (!selectedRun) return null;
        const ms = selectedRun.results?.milestones || selectedRun.report || {};
        
        const startTimeStr = selectedRun.metadata?.timestamp || selectedRun.report?.startedAtLocal || selectedRun.report?.startedAtUtc;
        const failureTimeStr = ms.failureAtLocal || ms.failureTime || ms.failureAtUtc;
        const recoveryStartStr = ms.recoveryStartAtLocal || ms.recoveryStartTime || ms.recoveryStartAtUtc;
        const recoveryEndStr = ms.recoveryEndAtLocal || ms.recoveryEndTime || ms.recoveryEndAtUtc;
        const stabilityStr = ms.stabilityAtLocal || ms.stabilityTime || ms.stabilityAtUtc;
        
        const parseTime = (str: string | null | undefined) => {
            if (!str) return null;
            let parsed = Date.parse(str);
            if (isNaN(parsed)) {
                parsed = Date.parse(str + " GMT-0300");
            }
            return isNaN(parsed) ? null : parsed;
        };

        const tStart = parseTime(startTimeStr);
        const tFailure = parseTime(failureTimeStr);
        const tRecStart = parseTime(recoveryStartStr);
        const tRecEnd = parseTime(recoveryEndStr);
        const tStability = parseTime(stabilityStr);

        const dStartupToCrash = (tStart && tFailure && tFailure > tStart) ? (tFailure - tStart) / 1000 : null;
        const dDowntime = (tFailure && tRecStart && tRecStart > tFailure) ? (tRecStart - tFailure) / 1000 : null;
        const dRecovery = (tRecStart && tRecEnd && tRecEnd > tRecStart) ? (tRecEnd - tRecStart) / 1000 : null;
        const dToStability = (tRecEnd && tStability && tStability > tRecEnd) ? (tStability - tRecEnd) / 1000 : null;
        const dDowntimeToAvailability = (tFailure && tStability && tStability > tFailure) ? (tStability - tFailure) / 1000 : null;

        return {
            tStart, tFailure, tRecStart, tRecEnd, tStability,
            dStartupToCrash,
            dDowntime,
            dRecovery,
            dToStability,
            dDowntimeToAvailability
        };
    }, [selectedRun]);

    const selectedCpuChartData = useMemo(() => {
        if (!selectedTelemetry || !selectedTelemetry.monitoring || selectedTelemetry.monitoring.length === 0) {
            return null;
        }
        const sortedData = [...selectedTelemetry.monitoring].sort((a, b) => a[0] - b[0]);
        return {
            datasets: [
                {
                    label: "Uso de CPU (%)",
                    data: sortedData.map(([sec, cpu]: any) => ({ x: sec, y: cpu })),
                    borderColor: "#ef4444", // Red
                    backgroundColor: "rgba(239, 68, 68, 0.15)",
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.15,
                }
            ]
        };
    }, [selectedTelemetry]);

    const selectedRamChartData = useMemo(() => {
        if (!selectedTelemetry || !selectedTelemetry.monitoring || selectedTelemetry.monitoring.length === 0) {
            return null;
        }
        const sortedData = [...selectedTelemetry.monitoring].sort((a, b) => a[0] - b[0]);
        return {
            datasets: [
                {
                    label: "Consumo de RAM (MB)",
                    data: sortedData.map(([sec, _, ramKb]: any) => ({ x: sec, y: ramKb / 1024 })),
                    borderColor: "#10b981", // Green
                    backgroundColor: "rgba(16, 185, 129, 0.15)",
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.15,
                }
            ]
        };
    }, [selectedTelemetry]);

    const selectedThroughputChartData = useMemo(() => {
        if (!selectedTelemetry || !selectedTelemetry.throughput || selectedTelemetry.throughput.length === 0) {
            return null;
        }
        const sortedData = [...selectedTelemetry.throughput].sort((a, b) => a[0] - b[0]);
        return {
            datasets: [
                {
                    label: "Throughput (ops/s)",
                    data: sortedData.map(([sec, val]: any) => ({ x: sec, y: val })),
                    borderColor: "#3b82f6", // Blue
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.15,
                }
            ]
        };
    }, [selectedTelemetry]);

    // 4. Download do JSON de relatório consolidado
    const downloadJsonReport = (run: any) => {
        if (!run || !run.report) return;
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(run.report, null, 2));
        const downloadAnchor = document.createElement("a");
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `report_${run.id}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    };

    // 5. Aciona o diálogo de impressão PDF com apenas o número do ensaio como título do documento
    const triggerPdfPrint = () => {
        const originalTitle = document.title;
        const runNumber = (selectedRunId || "").replace(/\D/g, "");
        document.title = runNumber || "experiment";
        window.print();
        document.title = originalTitle;
    };

    // Calcula speedup de recuperação
    const recoveryComparison = useMemo(() => {
        if (!runA || !runB) return null;
        const tA = runA.results?.recoveryDurationSeconds || null;
        const tB = runB.results?.recoveryDurationSeconds || null;
        let speedup = null;
        let faster = null;
        if (tA && tB) {
            speedup = tA > tB ? (tA / tB).toFixed(2) : (tB / tA).toFixed(2);
            faster = tA > tB ? "Run B" : "Run A";
        }
        return { tA, tB, speedup, faster };
    }, [runA, runB]);

    return (
        <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans p-6 space-y-6">
            
            {/* Seção não imprimível (Interface do Usuário) */}
            <div className="print:hidden space-y-6">
                
                {/* Cabeçalho */}
                <div className="flex justify-between items-center bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-white">Histórico & Análise Comparativa</h1>
                        <p className="text-sm text-slate-400 mt-1">Explore rodadas concluídas, analise telemetrias arquivadas e compare os cenários de recuperação.</p>
                    </div>
                    <button
                        onClick={onBack}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg transition"
                    >
                        Voltar ao Painel
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Barra Lateral: Lista de Ensaios */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4">
                        <h2 className="text-base font-bold text-slate-200">Ensaios Registrados ({runs.length})</h2>
                        <div className="space-y-3 overflow-y-auto max-h-[60vh] pr-2">
                            {runs.length === 0 ? (
                                <p className="text-xs text-slate-500 text-center py-8">Nenhum ensaio arquivado encontrado.</p>
                            ) : (
                                runs.map((run) => (
                                    <div
                                        key={run.id}
                                        onClick={() => setSelectedRunId(run.id)}
                                        className={`p-3 rounded-lg border cursor-pointer transition ${
                                            selectedRunId === run.id
                                                ? "bg-slate-850 border-blue-500"
                                                : "bg-slate-950/40 border-slate-800 hover:border-slate-700"
                                        }`}
                                    >
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="font-mono text-slate-400 font-semibold">{run.id}</span>
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                run.metadata?.mode?.includes("MM-DIRECT") 
                                                    ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" 
                                                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                            }`}>
                                                {run.metadata?.mode?.includes("MM-DIRECT") ? "MM-DIRECT" : "Tradicional"}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center mt-2 text-[10px] text-slate-500">
                                            <span>Tempo Rec: {run.results?.recoveryDurationSeconds ? `${run.results.recoveryDurationSeconds}s` : "N/A"}</span>
                                            <span>Status: {run.results?.status || "N/A"}</span>
                                        </div>

                                        {/* Seleção para comparação */}
                                        <div className="flex items-center space-x-2 mt-3 pt-2 border-t border-slate-850 justify-between">
                                            <label className="text-[10px] text-slate-400 cursor-pointer flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={compareAId === run.id}
                                                    onChange={() => setCompareAId(compareAId === run.id ? null : run.id)}
                                                    className="rounded border-slate-800 bg-slate-900 text-blue-600 focus:ring-0 w-3 h-3"
                                                />
                                                <span>Comparar A</span>
                                            </label>
                                            <label className="text-[10px] text-slate-400 cursor-pointer flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={compareBId === run.id}
                                                    onChange={() => setCompareBId(compareBId === run.id ? null : run.id)}
                                                    className="rounded border-slate-800 bg-slate-900 text-emerald-600 focus:ring-0 w-3 h-3"
                                                />
                                                <span>Comparar B</span>
                                            </label>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Área Principal: Visualização de Detalhes ou Comparador */}
                    <div className="lg:col-span-3 space-y-6">
                        
                        {runA && runB ? (
                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-6">
                                <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                                    <div>
                                        <h2 className="text-lg font-bold text-white">Comparação de Cenários Experimentais</h2>
                                        <p className="text-xs text-slate-400 mt-1">Análise aprofundada de eficiência de recuperação, vazão e perfil de recursos.</p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setCompareAId(null);
                                            setCompareBId(null);
                                        }}
                                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs transition"
                                    >
                                        Limpar Comparação
                                    </button>
                                </div>

                                {/* Gráfico de Comparação */}
                                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-lg">
                                    <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center space-x-2">
                                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                        <span>Comportamento de Throughput Sobreposto (ops/seg)</span>
                                    </h3>
                                    {loadingTelemetry ? (
                                        <div className="text-center text-xs text-slate-500 py-16">Carregando telemetria...</div>
                                    ) : comparisonThroughputData !== null ? (
                                        <div className="w-full h-[250px]">
                                            <Line
                                                data={comparisonThroughputData}
                                                options={comparisonChartOptionsJS}
                                            />
                                        </div>
                                    ) : (
                                        <div className="text-center text-xs text-slate-500 py-16">Dados de telemetria indisponíveis para comparação.</div>
                                    )}
                                </div>

                                {/* Seção Superior de Cards de Destaque */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {/* Card de Tempo e Speedup */}
                                    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-4 flex flex-col justify-between">
                                        <h3 className="text-sm font-semibold text-slate-300">Tempo de Recuperação</h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 text-center">
                                                <span className="text-[10px] text-slate-500 uppercase font-semibold">Run A ({runA.metadata?.mode?.includes("MM-DIRECT") ? "MM-Direct" : "AOF"})</span>
                                                <div className="text-lg font-bold text-blue-400 mt-1">{recoveryComparison?.tA ? `${formatPtBr(recoveryComparison.tA, 3)}s` : "N/A"}</div>
                                            </div>
                                            <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 text-center">
                                                <span className="text-[10px] text-slate-500 uppercase font-semibold">Run B ({runB.metadata?.mode?.includes("MM-DIRECT") ? "MM-Direct" : "AOF"})</span>
                                                <div className="text-lg font-bold text-emerald-400 mt-1">{recoveryComparison?.tB ? `${formatPtBr(recoveryComparison.tB, 3)}s` : "N/A"}</div>
                                            </div>
                                        </div>
                                        {recoveryComparison?.speedup && (
                                            <div className="p-2.5 bg-indigo-950/40 border border-indigo-900/50 rounded-lg text-center text-xs text-slate-300">
                                                Aceleração calculada: o <strong className="text-indigo-400 font-bold">{recoveryComparison.faster}</strong> foi <strong className="text-indigo-400 font-mono text-sm">{recoveryComparison.speedup}x</strong> mais rápido no carregamento.
                                            </div>
                                        )}
                                    </div>

                                    {/* Card de Diferença de Armazenamento em Disco */}
                                    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-4 flex flex-col justify-between">
                                        <h3 className="text-sm font-semibold text-slate-300">Tamanho em Disco (AOF vs DB)</h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 text-center">
                                                <span className="text-[9px] text-slate-500 uppercase font-semibold">Run A (Logs Físicos)</span>
                                                <div className="text-xs font-bold text-slate-200 mt-1 leading-relaxed">
                                                    AOF: {formatSizeMb(runA.results?.aofSizeBytes || runA.report?.aofSizeBytes)}
                                                    <br />
                                                    DB: {formatSizeMb(runA.results?.indexedLogSizeBytes || runA.report?.indexedLogSizeBytes)}
                                                </div>
                                            </div>
                                            <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 text-center">
                                                <span className="text-[9px] text-slate-500 uppercase font-semibold">Run B (Logs Físicos)</span>
                                                <div className="text-xs font-bold text-slate-200 mt-1 leading-relaxed">
                                                    AOF: {formatSizeMb(runB.results?.aofSizeBytes || runB.report?.aofSizeBytes)}
                                                    <br />
                                                    DB: {formatSizeMb(runB.results?.indexedLogSizeBytes || runB.report?.indexedLogSizeBytes)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-[10px] text-slate-400 text-center leading-normal">
                                            Logs indexados (DB) do MM-DIRECT estruturam árvores na DRAM. O AOF sequencial exige reprocessamento linear de comandos.
                                        </div>
                                    </div>

                                    {/* Card de Integridade e Tuplas */}
                                    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-4 flex flex-col justify-between">
                                        <h3 className="text-sm font-semibold text-slate-300">Tuplas e Consistência</h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800 text-center">
                                                <span className="text-[10px] text-slate-500 uppercase font-semibold">Run A (Inconsist.)</span>
                                                <div className={`text-base font-bold mt-1 ${(runA.results?.inconsistencies || runA.report?.inconsistencies) > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                                                    {runA.results?.inconsistencies ?? runA.report?.inconsistencies ?? 0}
                                                </div>
                                                <span className="text-[9px] text-slate-500 block">Tuplas: {runA.results?.recoveredTuples || runA.report?.recoveredTuples || "N/A"}</span>
                                            </div>
                                            <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800 text-center">
                                                <span className="text-[10px] text-slate-500 uppercase font-semibold">Run B (Inconsist.)</span>
                                                <div className={`text-base font-bold mt-1 ${(runB.results?.inconsistencies || runB.report?.inconsistencies) > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                                                    {runB.results?.inconsistencies ?? runB.report?.inconsistencies ?? 0}
                                                </div>
                                                <span className="text-[9px] text-slate-500 block">Tuplas: {runB.results?.recoveredTuples || runB.report?.recoveredTuples || "N/A"}</span>
                                            </div>
                                        </div>
                                        <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-[10px] text-slate-400 text-center leading-normal">
                                            Inconsistências indicam dados em conflito pós-recuperação (comuns no modo AOF de alta concorrência).
                                        </div>
                                    </div>
                                </div>

                                {/* Tabela Completa de Métricas Científicas */}
                                <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-4">
                                    <h3 className="text-sm font-semibold text-slate-300">Sumário Analítico Comparativo de Métricas</h3>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead>
                                                <tr className="border-b border-slate-800 text-slate-400 font-bold">
                                                    <th className="pb-2 pl-2">Métrica do Ensaio</th>
                                                    <th className="pb-2">Ensaio A (id: {runA.id})</th>
                                                    <th className="pb-2">Ensaio B (id: {runB.id})</th>
                                                    <th className="pb-2 pr-2">Análise de Variação</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-850">
                                                <tr>
                                                    <td className="py-2.5 pl-2 font-medium text-slate-400">Modo de Operação</td>
                                                    <td className="py-2.5 font-mono text-slate-200">{runA.metadata?.mode || runA.report?.mode || "N/A"}</td>
                                                    <td className="py-2.5 font-mono text-slate-200">{runB.metadata?.mode || runB.report?.mode || "N/A"}</td>
                                                    <td className="py-2.5 text-slate-500 italic">Diferença de arquitetura</td>
                                                </tr>
                                                <tr>
                                                    <td className="py-2.5 pl-2 font-medium text-slate-400">Tempo de Recuperação (Downtime)</td>
                                                    <td className="py-2.5 font-mono text-blue-400 font-bold">{runA.results?.recoveryDurationSeconds ? `${formatPtBr(runA.results.recoveryDurationSeconds, 3)} s` : "N/A"}</td>
                                                    <td className="py-2.5 font-mono text-emerald-400 font-bold">{runB.results?.recoveryDurationSeconds ? `${formatPtBr(runB.results.recoveryDurationSeconds, 3)} s` : "N/A"}</td>
                                                    <td className="py-2.5 font-bold text-slate-200">
                                                        {recoveryComparison?.speedup ? `${recoveryComparison.speedup}x mais rápido para ${recoveryComparison.faster}` : "N/A"}
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td className="py-2.5 pl-2 font-medium text-slate-400">Throughput Médio</td>
                                                    <td className="py-2.5 font-mono text-slate-300">{runA.report?.throughputSummary?.averageThroughput ? `${formatPtBr(runA.report.throughputSummary.averageThroughput, 2)} ops/seg` : "N/A"}</td>
                                                    <td className="py-2.5 font-mono text-slate-300">{runB.report?.throughputSummary?.averageThroughput ? `${formatPtBr(runB.report.throughputSummary.averageThroughput, 2)} ops/seg` : "N/A"}</td>
                                                    <td className="py-2.5">
                                                        {runA.report?.throughputSummary?.averageThroughput && runB.report?.throughputSummary?.averageThroughput ? (
                                                            runA.report.throughputSummary.averageThroughput > runB.report.throughputSummary.averageThroughput ?
                                                            <span className="text-blue-400">Run A +{formatPtBr((runA.report.throughputSummary.averageThroughput / runB.report.throughputSummary.averageThroughput - 1) * 100, 1)}%</span> :
                                                            <span className="text-emerald-400">Run B +{formatPtBr((runB.report.throughputSummary.averageThroughput / runA.report.throughputSummary.averageThroughput - 1) * 100, 1)}%</span>
                                                        ) : "N/A"}
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td className="py-2.5 pl-2 font-medium text-slate-400">Throughput de Pico (Máximo)</td>
                                                    <td className="py-2.5 font-mono text-slate-300">{runA.report?.throughputSummary?.peakThroughput ? `${formatPtBr(runA.report.throughputSummary.peakThroughput, 0)} ops/seg` : "N/A"}</td>
                                                    <td className="py-2.5 font-mono text-slate-300">{runB.report?.throughputSummary?.peakThroughput ? `${formatPtBr(runB.report.throughputSummary.peakThroughput, 0)} ops/seg` : "N/A"}</td>
                                                    <td className="py-2.5">
                                                        {runA.report?.throughputSummary?.peakThroughput && runB.report?.throughputSummary?.peakThroughput ? (
                                                            runA.report.throughputSummary.peakThroughput > runB.report.throughputSummary.peakThroughput ?
                                                            <span className="text-blue-400">Run A +{formatPtBr((runA.report.throughputSummary.peakThroughput / runB.report.throughputSummary.peakThroughput - 1) * 100, 1)}%</span> :
                                                            <span className="text-emerald-400">Run B +{formatPtBr((runB.report.throughputSummary.peakThroughput / runA.report.throughputSummary.peakThroughput - 1) * 100, 1)}%</span>
                                                        ) : "N/A"}
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td className="py-2.5 pl-2 font-medium text-slate-400">Total de Comandos Executados</td>
                                                    <td className="py-2.5 font-mono text-slate-300">{runA.report?.throughputSummary?.totalCommands ? formatPtBr(runA.report.throughputSummary.totalCommands, 0) : "N/A"}</td>
                                                    <td className="py-2.5 font-mono text-slate-300">{runB.report?.throughputSummary?.totalCommands ? formatPtBr(runB.report.throughputSummary.totalCommands, 0) : "N/A"}</td>
                                                    <td className="py-2.5 text-slate-500 italic">Volume operacional</td>
                                                </tr>
                                                <tr>
                                                    <td className="py-2.5 pl-2 font-medium text-slate-400">Tamanho do Arquivo AOF</td>
                                                    <td className="py-2.5 font-mono text-slate-300">{formatSizeMb(runA.results?.aofSizeBytes || runA.report?.aofSizeBytes)}</td>
                                                    <td className="py-2.5 font-mono text-slate-300">{formatSizeMb(runB.results?.aofSizeBytes || runB.report?.aofSizeBytes)}</td>
                                                    <td className="py-2.5 text-slate-500 italic">Espaço físico de log sequencial</td>
                                                </tr>
                                                <tr>
                                                    <td className="py-2.5 pl-2 font-medium text-slate-400">Tamanho do Banco Indexado (DB)</td>
                                                    <td className="py-2.5 font-mono text-slate-300">{formatSizeMb(runA.results?.indexedLogSizeBytes || runA.report?.indexedLogSizeBytes)}</td>
                                                    <td className="py-2.5 font-mono text-slate-300">{formatSizeMb(runB.results?.indexedLogSizeBytes || runB.report?.indexedLogSizeBytes)}</td>
                                                    <td className="py-2.5 text-slate-500 italic">Espaço físico de árvore estruturada</td>
                                                </tr>
                                                <tr>
                                                    <td className="py-2.5 pl-2 font-medium text-slate-400">Pico de Consumo de RAM</td>
                                                    <td className="py-2.5 font-mono text-slate-300">{runA.report?.memorySummary?.peakMemory ? `${formatPtBr(runA.report.memorySummary.peakMemory, 2)} MB` : "N/A"}</td>
                                                    <td className="py-2.5 font-mono text-slate-300">{runB.report?.memorySummary?.peakMemory ? `${formatPtBr(runB.report.memorySummary.peakMemory, 2)} MB` : "N/A"}</td>
                                                    <td className="py-2.5">
                                                        {runA.report?.memorySummary?.peakMemory && runB.report?.memorySummary?.peakMemory ? (
                                                            runA.report.memorySummary.peakMemory < runB.report.memorySummary.peakMemory ?
                                                            <span className="text-blue-400">Run A economizou {formatPtBr((1 - runA.report.memorySummary.peakMemory / runB.report.memorySummary.peakMemory) * 100, 1)}%</span> :
                                                            <span className="text-emerald-400">Run B economizou {formatPtBr((1 - runB.report.memorySummary.peakMemory / runA.report.memorySummary.peakMemory) * 100, 1)}%</span>
                                                        ) : "N/A"}
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td className="py-2.5 pl-2 font-medium text-slate-400">Consumo Médio de RAM</td>
                                                    <td className="py-2.5 font-mono text-slate-300">{runA.report?.memorySummary?.averageMemory ? `${formatPtBr(runA.report.memorySummary.averageMemory, 2)} MB` : "N/A"}</td>
                                                    <td className="py-2.5 font-mono text-slate-300">{runB.report?.memorySummary?.averageMemory ? `${formatPtBr(runB.report.memorySummary.averageMemory, 2)} MB` : "N/A"}</td>
                                                    <td className="py-2.5 text-slate-500 italic">Pegada de memória média</td>
                                                </tr>
                                                <tr>
                                                    <td className="py-2.5 pl-2 font-medium text-slate-400">Pico de Uso de CPU</td>
                                                    <td className="py-2.5 font-mono text-slate-300">{runA.report?.cpuSummary?.peakCpu ? `${formatPtBr(runA.report.cpuSummary.peakCpu, 1)}%` : "N/A"}</td>
                                                    <td className="py-2.5 font-mono text-slate-300">{runB.report?.cpuSummary?.peakCpu ? `${formatPtBr(runB.report.cpuSummary.peakCpu, 1)}%` : "N/A"}</td>
                                                    <td className="py-2.5 text-slate-500 italic">Sobrecarga máxima da CPU</td>
                                                </tr>
                                                <tr>
                                                    <td className="py-2.5 pl-2 font-medium text-slate-400">Tuplas Totais Carregadas</td>
                                                    <td className="py-2.5 font-mono text-slate-300">{runA.results?.recoveredTuples ? formatPtBr(runA.results.recoveredTuples, 0) : "N/A"}</td>
                                                    <td className="py-2.5 font-mono text-slate-300">{runB.results?.recoveredTuples ? formatPtBr(runB.results.recoveredTuples, 0) : "N/A"}</td>
                                                    <td className="py-2.5 text-slate-500 italic">Capacidade de DRAM restaurada</td>
                                                </tr>
                                                <tr>
                                                    <td className="py-2.5 pl-2 font-medium text-slate-400">Inconsistências pós-recuperação</td>
                                                    <td className="py-2.5 font-mono text-slate-300">{runA.results?.inconsistencies ? formatPtBr(runA.results.inconsistencies, 0) : "0"}</td>
                                                    <td className="py-2.5 font-mono text-slate-300">{runB.results?.inconsistencies ? formatPtBr(runB.results.inconsistencies, 0) : "0"}</td>
                                                    <td className="py-2.5">
                                                        {(runA.results?.inconsistencies || 0) !== (runB.results?.inconsistencies || 0) ? (
                                                            <span className="text-amber-450 font-semibold">Desvio de integridade</span>
                                                        ) : (
                                                            <span className="text-slate-500 italic">Equivalência de integridade</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Comparação Visual de Parâmetros de Configuração */}
                                <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-4">
                                    <h3 className="text-sm font-semibold text-slate-300">Configuração Comparada dos Setups</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                        <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                                            <h4 className="font-semibold text-slate-200 border-b border-slate-800 pb-1.5">Setup - Ensaio A ({runA.id})</h4>
                                            <div className="space-y-1 font-mono text-[11px] text-slate-300">
                                                <div className="flex justify-between"><span>Recuperação Instantânea:</span> <span>{runA.metadata?.config?.instantRecoveryState || "ON"}</span></div>
                                                <div className="flex justify-between"><span>Intervalo do Indexador:</span> <span>{runA.metadata?.config?.indexerTimeInterval || "500"} μs</span></div>
                                                <div className="flex justify-between"><span>Checkpointing:</span> <span>{runA.metadata?.config?.checkpointState || "OFF"}</span></div>
                                                <div className="flex justify-between"><span>Intervalo de Checkpoint:</span> <span>{runA.metadata?.config?.checkpointTimeInterval || "60"}s</span></div>
                                                <div className="flex justify-between"><span>Escrita Indexada Commit:</span> <span>{runA.metadata?.config?.instantRecoverySynchronous || "OFF"}</span></div>
                                                <div className="flex justify-between"><span>Estrutura do Log Indexado:</span> <span>{runA.metadata?.config?.indexedlogStructure || "BTREE"}</span></div>
                                                <div className="flex justify-between"><span>Reinícios Simulados:</span> <span>{runA.metadata?.config?.numberRestartsAfterTime || "0"}</span></div>
                                                <div className="flex justify-between"><span>Tempo para Reinício:</span> <span>{runA.metadata?.config?.restartAfterTime ? `${runA.metadata.config.restartAfterTime}s` : "N/A"}</span></div>
                                            </div>
                                        </div>
                                        <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                                            <h4 className="font-semibold text-slate-200 border-b border-slate-800 pb-1.5">Setup - Ensaio B ({runB.id})</h4>
                                            <div className="space-y-1 font-mono text-[11px] text-slate-300">
                                                <div className="flex justify-between"><span>Recuperação Instantânea:</span> <span>{runB.metadata?.config?.instantRecoveryState || "ON"}</span></div>
                                                <div className="flex justify-between"><span>Intervalo do Indexador:</span> <span>{runB.metadata?.config?.indexerTimeInterval || "500"} μs</span></div>
                                                <div className="flex justify-between"><span>Checkpointing:</span> <span>{runB.metadata?.config?.checkpointState || "OFF"}</span></div>
                                                <div className="flex justify-between"><span>Intervalo de Checkpoint:</span> <span>{runB.metadata?.config?.checkpointTimeInterval || "60"}s</span></div>
                                                <div className="flex justify-between"><span>Escrita Indexada Commit:</span> <span>{runB.metadata?.config?.instantRecoverySynchronous || "OFF"}</span></div>
                                                <div className="flex justify-between"><span>Estrutura do Log Indexado:</span> <span>{runB.metadata?.config?.indexedlogStructure || "BTREE"}</span></div>
                                                <div className="flex justify-between"><span>Reinícios Simulados:</span> <span>{runB.metadata?.config?.numberRestartsAfterTime || "0"}</span></div>
                                                <div className="flex justify-between"><span>Tempo para Reinício:</span> <span>{runB.metadata?.config?.restartAfterTime ? `${runB.metadata.config.restartAfterTime}s` : "N/A"}</span></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : selectedRun ? (
                            /* Visualização Individual */
                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-6">
                                <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                                    <div>
                                        <h2 className="text-lg font-bold text-white">Relatório Técnico - Ensaio {selectedRun.id}</h2>
                                        <p className="text-xs text-slate-400 mt-1">Resumo analítico consolidado e metadados científicos do experimento.</p>
                                    </div>
                                    <div className="flex space-x-3">
                                        <button
                                            onClick={() => downloadJsonReport(selectedRun)}
                                            className="px-3 py-1.5 bg-slate-850 hover:bg-slate-800 border border-slate-700 rounded-lg text-xs font-semibold transition"
                                            disabled={!selectedRun.report}
                                        >
                                            Exportar JSON
                                        </button>
                                        <button
                                            onClick={triggerPdfPrint}
                                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-750 text-white rounded-lg text-xs font-semibold transition"
                                        >
                                            Imprimir PDF
                                        </button>
                                    </div>
                                </div>

                                {/* Sumário de Resultados */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
                                        <span className="text-[10px] text-slate-500 uppercase font-semibold">Tempo de Recuperação</span>
                                        <div className="text-xl font-bold text-blue-400 mt-1">
                                            {selectedRun.results?.recoveryDurationSeconds ? `${formatPtBr(selectedRun.results.recoveryDurationSeconds, 3)}s` : "N/A"}
                                        </div>
                                    </div>
                                    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
                                        <span className="text-[10px] text-slate-500 uppercase font-semibold">Status de Rodada</span>
                                        <div className={`text-xl font-bold mt-1 ${
                                            selectedRun.results?.status === "Estável" ? "text-emerald-400" : "text-rose-500"
                                        }`}>
                                            {selectedRun.results?.status || "N/A"}
                                        </div>
                                    </div>
                                    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
                                        <span className="text-[10px] text-slate-500 uppercase font-semibold">Vazão Média</span>
                                        <div className="text-xl font-bold text-slate-200 mt-1">
                                            {selectedRun.report?.throughputSummary?.averageThroughput ? `${formatPtBr(selectedRun.report.throughputSummary.averageThroughput, 2)} ops/seg` : "N/A"}
                                        </div>
                                    </div>
                                    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
                                        <span className="text-[10px] text-slate-500 uppercase font-semibold">Pico de Memória</span>
                                        <div className="text-xl font-bold text-slate-200 mt-1">
                                            {selectedRun.report?.memorySummary?.peakMemory ? `${formatPtBr(selectedRun.report.memorySummary.peakMemory, 1)} MB` : "N/A"}
                                        </div>
                                    </div>
                                </div>

                                {/* Tabelas Detalhadas */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    
                                    {/* Configuração do Ensaio */}
                                    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-3">
                                        <h3 className="text-xs uppercase font-bold tracking-wider text-slate-400">Parâmetros de Entrada</h3>
                                        <div className="space-y-1.5 text-xs">
                                            <div className="flex justify-between border-b border-slate-850 pb-1">
                                                <span className="text-slate-500">Instant Recovery</span>
                                                <span className="font-mono text-slate-300">{selectedRun.metadata?.config?.instantRecoveryState || "ON"}</span>
                                            </div>
                                            <div className="flex justify-between border-b border-slate-850 pb-1">
                                                <span className="text-slate-500">Intervalo do Indexador</span>
                                                <span className="font-mono text-slate-300">{selectedRun.metadata?.config?.indexerTimeInterval || "500"} μs</span>
                                            </div>
                                            <div className="flex justify-between border-b border-slate-850 pb-1">
                                                <span className="text-slate-500">Estado Checkpoint</span>
                                                <span className="font-mono text-slate-300">{selectedRun.metadata?.config?.checkpointState || "OFF"}</span>
                                            </div>
                                            <div className="flex justify-between border-b border-slate-850 pb-1">
                                                <span className="text-slate-500">Intervalo Checkpoint</span>
                                                <span className="font-mono text-slate-300">{selectedRun.metadata?.config?.checkpointTimeInterval || "60"}s</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-slate-500">Memtier Benchmark</span>
                                                <span className="font-mono text-slate-300">{selectedRun.metadata?.config?.memtierBenchmarkState || "OFF"}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Marcos Experimentais */}
                                    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-3">
                                        <h3 className="text-xs uppercase font-bold tracking-wider text-slate-400">Cronologia de Eventos</h3>
                                        <div className="space-y-1.5 text-xs">
                                            <div className="flex justify-between border-b border-slate-850 pb-1">
                                                <span className="text-slate-500">Início do Experimento</span>
                                                <span className="font-mono text-slate-300 text-[10px]">
                                                    {selectedRun.metadata?.timestamp ? new Date(selectedRun.metadata.timestamp).toLocaleTimeString() : "N/A"}
                                                </span>
                                            </div>
                                            <div className="flex justify-between border-b border-slate-850 pb-1">
                                                <span className="text-slate-500">Instante da Falha</span>
                                                <span className="font-mono text-slate-300 text-[10px]">
                                                    {selectedRun.results?.milestones?.failureAtLocal || selectedRun.results?.milestones?.failureTime || "N/A"}
                                                </span>
                                            </div>
                                            <div className="flex justify-between border-b border-slate-850 pb-1">
                                                <span className="text-slate-500">Boot de Recuperação</span>
                                                <span className="font-mono text-slate-300 text-[10px]">
                                                    {selectedRun.results?.milestones?.recoveryStartAtLocal || selectedRun.results?.milestones?.recoveryStartTime || "N/A"}
                                                </span>
                                            </div>
                                            <div className="flex justify-between border-b border-slate-850 pb-1">
                                                <span className="text-slate-500">Conclusão de Carga (DB)</span>
                                                <span className="font-mono text-slate-300 text-[10px]">
                                                    {selectedRun.results?.milestones?.recoveryEndAtLocal || selectedRun.results?.milestones?.recoveryEndTime || "N/A"}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-slate-500">Retorno à Estabilidade</span>
                                                <span className="font-mono text-slate-300 text-[10px]">
                                                    {selectedRun.results?.milestones?.stabilityAtLocal || selectedRun.results?.milestones?.stabilityTime || "N/A"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Gráficos do Ensaio */}
                                {selectedTelemetry && (selectedTelemetry.throughput?.length > 0 || selectedTelemetry.monitoring?.length > 0) && (
                                    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-4">
                                        <h3 className="text-sm font-semibold text-slate-300">Curvas de Desempenho (Telemetria do Ensaio)</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {selectedThroughputChartData !== null ? (
                                                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                                                    <h4 className="text-xs text-slate-400 font-medium mb-2 text-center">Vazão de Comandos (ops/seg)</h4>
                                                    <div className="w-full h-[180px]">
                                                        <Line
                                                            data={selectedThroughputChartData}
                                                            options={historyChartOptionsJS("ops/seg")}
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center h-[216px]">
                                                    <span className="text-xs text-slate-500">Sem dados de Throughput</span>
                                                </div>
                                            )}

                                            {selectedTelemetry.monitoring?.length > 0 ? (
                                                <>
                                                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                                                        <h4 className="text-xs text-slate-400 font-medium mb-2 text-center">Uso de CPU (%)</h4>
                                                        <div className="w-full h-[180px]">
                                                            <Line
                                                                data={selectedCpuChartData!}
                                                                options={historyChartOptionsJS("CPU (%)")}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                                                        <h4 className="text-xs text-slate-400 font-medium mb-2 text-center">Consumo de RAM (MB)</h4>
                                                        <div className="w-full h-[180px]">
                                                            <Line
                                                                data={selectedRamChartData!}
                                                                options={historyChartOptionsJS("RAM (MB)")}
                                                            />
                                                        </div>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="col-span-2 p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center h-[216px]">
                                                    <span className="text-xs text-slate-500">Sem dados de monitoramento CPU/RAM</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Referências aos Arquivos Brutos */}
                                <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-2">
                                    <h3 className="text-xs uppercase font-bold tracking-wider text-slate-400">Arquivos Físicos Relacionados (no Servidor)</h3>
                                    <ul className="text-xs font-mono space-y-1 text-slate-300">
                                        <li>📁 Pasta Principal: <span className="text-slate-500">src/runs/{selectedRun.id}/</span></li>
                                        <li>📄 Configuração Inicial: <span className="text-slate-500">src/runs/{selectedRun.id}/metadata.json</span></li>
                                        <li>📊 Logs de Execução: <span className="text-slate-500">src/runs/{selectedRun.id}/logs.txt</span></li>
                                        <li>📊 CSV de Comandos (Vazão): <span className="text-slate-500">src/runs/{selectedRun.id}/datasets.csv</span></li>
                                        <li>📊 CSV de Monitoramento CPU/RAM: <span className="text-slate-500">src/runs/{selectedRun.id}/system_monitoring.csv</span></li>
                                        <li>📊 Resumo das Métricas: <span className="text-slate-500">src/runs/{selectedRun.id}/export/report.json</span></li>
                                    </ul>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-16 shadow-2xl text-center">
                                <p className="text-sm text-slate-500">Selecione um ensaio na barra lateral para analisar.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Layout Científico de Impressão Acadêmica (Apenas visível ao imprimir PDF) */}
            {selectedRun && (
                <div className="print-report bg-white text-black font-serif leading-relaxed text-sm p-4 w-full">
                    {/* Linha Dupla IEEE/ACM */}
                    <div className="text-center space-y-2 border-b-2 border-double border-black pb-4 mb-6">
                        <h1 className="text-xl font-bold tracking-wide">Relatório Técnico Experimental: MM-DIRECT vs Redis-IR</h1>
                        <p className="text-[10px] italic">Instrumentação científica para bancos de dados em memória baseados em árvore indexada</p>
                        <p className="text-xs">ID do Ensaio: <strong className="font-mono">{selectedRun.id}</strong> | Data de Execução: {selectedRun.metadata?.timestamp ? new Date(selectedRun.metadata.timestamp).toLocaleDateString() : "N/A"}</p>
                    </div>

                    <div className="space-y-6">
                        {/* Seção I: Resumo Analítico */}
                        <section>
                            <h2 className="text-sm uppercase font-bold border-b border-black mb-2">I. Resumo Analítico e Resultados Gerais</h2>
                            <p className="text-xs text-justify">
                                Este documento relata formalmente a execução e validação empírica do banco de dados MM-DIRECT em comparação ao Redis-IR. 
                                O ensaio sob análise operou em modo de recuperação <strong>{selectedRun.metadata?.mode || selectedRun.report?.mode || "N/A"}</strong>, 
                                com status de encerramento classificado como <strong>{selectedRun.results?.status || "N/A"}</strong>. 
                                O tempo total de recuperação de dados e carga do banco na memória foi aferido em: <strong>{selectedRun.results?.recoveryDurationSeconds ? `${formatPtBr(selectedRun.results.recoveryDurationSeconds, 3)} segundos` : "N/A"}</strong>.
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
                                        <td className="p-1 font-mono">{selectedRun.metadata?.config?.instantRecoveryState || "ON"}</td>
                                    </tr>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Intervalo de Varredura do Indexador</td>
                                        <td className="p-1 font-mono">{selectedRun.metadata?.config?.indexerTimeInterval || "500"} μs</td>
                                    </tr>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Simulação de Checkpointing</td>
                                        <td className="p-1 font-mono">{selectedRun.metadata?.config?.checkpointState || "OFF"}</td>
                                    </tr>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Intervalo Fixo de Checkpoint</td>
                                        <td className="p-1 font-mono">{selectedRun.metadata?.config?.checkpointTimeInterval || "60"}s</td>
                                    </tr>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Carga com Memtier Benchmark</td>
                                        <td className="p-1 font-mono">{selectedRun.metadata?.config?.memtierBenchmarkState || "OFF"}</td>
                                    </tr>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Escrita Indexada no Commit</td>
                                        <td className="p-1 font-mono">{selectedRun.metadata?.config?.instantRecoverySynchronous === "ON" ? "Síncrono" : "Assíncrono"}</td>
                                    </tr>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Estratégia de Persistência de Logs</td>
                                        <td className="p-1 font-mono">{(selectedRun.metadata?.config?.instantRecoveryState || "ON") === "ON" ? "Logs Indexados (DB)" : "Sequencial (AOF)"}</td>
                                    </tr>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Estrutura do Log Indexado</td>
                                        <td className="p-1 font-mono">{selectedRun.metadata?.config?.indexedlogStructure || "BTREE"}</td>
                                    </tr>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Reinicializações Simuladas</td>
                                        <td className="p-1 font-mono">{selectedRun.metadata?.config?.numberRestartsAfterTime || "0"}</td>
                                    </tr>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Tempo para Reinício</td>
                                        <td className="p-1 font-mono">{selectedRun.metadata?.config?.restartAfterTime ? `${selectedRun.metadata.config.restartAfterTime}s` : "N/A"}</td>
                                    </tr>
                                    <tr>
                                        <td className="p-1 border-r border-black font-mono">Execuções da Carga Memtier</td>
                                        <td className="p-1 font-mono">{selectedRun.metadata?.config?.memtierBenchmarkWorkloadRunTimes || "1"}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </section>

                        {/* Seção III: Cronologia Operacional */}
                        <section>
                            <h2 className="text-sm uppercase font-bold border-b border-black mb-2">III. Cronologia Operacional de Eventos</h2>
                            <table className="w-full text-xs text-left border-collapse border border-black">
                                <thead>
                                    <tr className="bg-slate-100 border-b border-black">
                                        <th className="p-1.5 border-r border-black font-semibold">Etapa de Execução</th>
                                        <th className="p-1.5 border-r border-black font-semibold">Marco Temporal</th>
                                        <th className="p-1.5 font-semibold">Duração Calculada</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Início da Rodada</td>
                                        <td className="p-1 border-r border-black font-mono">{selectedRun.metadata?.timestamp ? new Date(selectedRun.metadata.timestamp).toLocaleTimeString() : "N/A"}</td>
                                        <td className="p-1 font-mono">-</td>
                                    </tr>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Instante da Falha Simulada</td>
                                        <td className="p-1 border-r border-black font-mono">{selectedRun.results?.milestones?.failureAtLocal || selectedRun.results?.milestones?.failureTime || "N/A"}</td>
                                        <td className="p-1 font-mono">{selectedRunTimeline?.dStartupToCrash ? `${formatPtBr(selectedRunTimeline.dStartupToCrash, 3)} s` : "N/A"}</td>
                                    </tr>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Início da Recuperação (Boot)</td>
                                        <td className="p-1 border-r border-black font-mono">{selectedRun.results?.milestones?.recoveryStartAtLocal || selectedRun.results?.milestones?.recoveryStartTime || "N/A"}</td>
                                        <td className="p-1 font-mono">{selectedRunTimeline?.dDowntime ? `${formatPtBr(selectedRunTimeline.dDowntime, 3)} s (Downtime)` : "N/A"}</td>
                                    </tr>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Retorno à Disponibilidade (Pronto)</td>
                                        <td className="p-1 border-r border-black font-mono">{selectedRun.results?.milestones?.stabilityAtLocal || selectedRun.results?.milestones?.stabilityTime || "N/A"}</td>
                                        <td className="p-1 font-mono">{selectedRunTimeline?.dDowntimeToAvailability ? `${formatPtBr(selectedRunTimeline.dDowntimeToAvailability, 3)} s (Disponibilidade)` : "N/A"}</td>
                                    </tr>
                                    <tr>
                                        <td className="p-1 border-r border-black font-mono">Carga de Banco Concluída</td>
                                        <td className="p-1 border-r border-black font-mono">{selectedRun.results?.milestones?.recoveryEndAtLocal || selectedRun.results?.milestones?.recoveryEndTime || "N/A"}</td>
                                        <td className="p-1 font-mono">{selectedRunTimeline?.dRecovery ? `${formatPtBr(selectedRunTimeline.dRecovery, 3)} s (Carga Total)` : "N/A"}</td>
                                    </tr>
                                </tbody>
                            </table>
                            <p className="text-[10px] text-slate-600 mt-1 italic">
                                Nota: Em modo MM-DIRECT (Instant Recovery), a estabilização (pronto para conexões) ocorre imediatamente após o boot, permitindo requisições de clientes concorrentemente ao carregamento em segundo plano.
                            </p>
                        </section>

                        {/* Seção IV: Consumo e Vazão */}
                        <section>
                            <h2 className="text-sm uppercase font-bold border-b border-black mb-2">IV. Vazão Científica e Perfil de Recursos</h2>
                            <table className="w-full text-xs text-left border-collapse border border-black">
                                <thead>
                                    <tr className="bg-slate-100 border-b border-black">
                                        <th className="p-1.5 border-r border-black font-semibold">Métrica de Instrumentação</th>
                                        <th className="p-1.5 border-r border-black font-semibold">Valor Registrado</th>
                                        <th className="p-1.5 font-semibold">Período de Medição / Detalhes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Pico de Vazão de Comandos</td>
                                        <td className="p-1 font-mono">
                                            {selectedRun.metadata?.config?.memtierBenchmarkState === "OFF" 
                                                ? "0,00 ops/seg (Inativo)" 
                                                : `${formatPtBr(selectedRun.report?.throughputSummary?.peakThroughput || 0, 2)} ops/seg`}
                                        </td>
                                        <td className="p-1 text-slate-700">Durante fase de carga operacional do cliente (Memtier)</td>
                                    </tr>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Vazão Média de Comandos</td>
                                        <td className="p-1 font-mono">
                                            {selectedRun.metadata?.config?.memtierBenchmarkState === "OFF" 
                                                ? "0,00 ops/seg (Inativo)" 
                                                : `${formatPtBr(selectedRun.report?.throughputSummary?.averageThroughput || 0, 2)} ops/seg`}
                                        </td>
                                        <td className="p-1 text-slate-700">Durante fase de carga operacional do cliente (Memtier)</td>
                                    </tr>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Pico de Uso de CPU</td>
                                        <td className="p-1 font-mono">{formatPtBr(selectedRun.report?.cpuSummary?.peakCpu || 0, 1)}%</td>
                                        <td className="p-1 text-slate-700">Coletado continuamente durante todo o ensaio</td>
                                    </tr>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Pico de Consumo RAM</td>
                                        <td className="p-1 font-mono">{formatPtBr(selectedRun.report?.memorySummary?.peakMemory || 0, 1)} MB</td>
                                        <td className="p-1 text-slate-700">Coletado continuamente durante todo o ensaio</td>
                                    </tr>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Natureza da Operação</td>
                                        <td className="p-1 font-mono text-[10px]">
                                            {selectedRun.results?.recoveryOperationNature || selectedRun.report?.recoveryOperationNature || "Recuperação do Banco de Dados"}
                                        </td>
                                        <td className="p-1 text-slate-700">Indica a técnica de recarga de dados executada</td>
                                    </tr>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Dataset / Registros Processados</td>
                                        <td className="p-1 font-mono">
                                            {selectedRun.results?.recoveredTuples || selectedRun.report?.recoveredTuples ? (
                                                <>
                                                    {selectedRun.results?.recoveredTuples || selectedRun.report?.recoveredTuples} tuplas recarregadas<br />
                                                    <span className="text-[10px] text-slate-500">
                                                        ({selectedRun.results?.incrementalTuples || selectedRun.report?.incrementalTuples || 0} incr, {selectedRun.results?.onDemandTuples || selectedRun.report?.onDemandTuples || 0} demand)
                                                    </span>
                                                </>
                                            ) : "N/A"}<br />
                                            <span className="text-[10px] text-slate-600 font-semibold">
                                                Logs de Operação: {selectedRun.results?.recordsProcessed || selectedRun.report?.recordsProcessed || "N/A"} registros
                                            </span>
                                        </td>
                                        <td className="p-1 text-slate-700">Tamanho do dataset carregado na memória e registros de log analisados</td>
                                    </tr>
                                    <tr>
                                        <td className="p-1 border-r border-black font-mono">Arquivos Físicos no Disco</td>
                                        <td className="p-1 font-mono text-[10px]">
                                            AOF: {formatSizeMb(selectedRun.results?.aofSizeBytes || selectedRun.report?.aofSizeBytes)}<br />
                                            DB: {formatSizeMb(selectedRun.results?.indexedLogSizeBytes || selectedRun.report?.indexedLogSizeBytes)}
                                        </td>
                                        <td className="p-1 text-slate-700">Tamanhos dos logs sequenciais (AOF) e banco indexado (DB) no disco</td>
                                    </tr>
                                </tbody>
                            </table>
                        </section>

                        {/* Gráficos Integrados de Desempenho */}
                        {selectedTelemetry && (
                            <section className="break-inside-avoid">
                                <h2 className="text-sm uppercase font-bold border-b border-black mb-2">Gráficos de Tendência e Telemetria Científica</h2>
                                <div className="grid grid-cols-2 gap-4 my-2">
                                    <div className="border border-black p-2 bg-white" style={{ height: "130px" }}>
                                        {selectedThroughputChartData !== null ? (
                                            <Line
                                                data={selectedThroughputChartData}
                                                options={printChartOptionsJS("Vazão de Comandos ao Longo do Tempo", "Vazão (ops/seg)")}
                                                width="100%"
                                                height="100%"
                                            />
                                        ) : (
                                            <div className="text-center text-xs text-slate-500 py-10">Aguardando dados...</div>
                                        )}
                                    </div>
                                    <div className="border border-black p-2 bg-white" style={{ height: "130px" }}>
                                        {selectedCpuChartData !== null ? (
                                            <Line
                                                data={selectedCpuChartData}
                                                options={printChartOptionsJS("Perfil de Uso de CPU ao Longo do Tempo", "CPU (%)")}
                                                width="100%"
                                                height="100%"
                                            />
                                        ) : (
                                            <div className="text-center text-xs text-slate-500 py-10">Aguardando dados...</div>
                                        )}
                                    </div>
                                    <div className="border border-black p-2 bg-white col-span-2" style={{ height: "130px" }}>
                                        {selectedRamChartData !== null ? (
                                            <Line
                                                data={selectedRamChartData}
                                                options={printChartOptionsJS("Perfil de Consumo de RAM ao Longo do Tempo", "RAM (MB)")}
                                                width="100%"
                                                height="100%"
                                            />
                                        ) : (
                                            <div className="text-center text-xs text-slate-500 py-10">Aguardando dados...</div>
                                        )}
                                    </div>
                                </div>
                            </section>
                        )}

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
            )}

        </div>
    );
};

export default HistoryPanel;
