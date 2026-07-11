import { useEffect, useState, useMemo } from "react";
import { Chart } from "react-google-charts";

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
        if (!telemetryA || !telemetryB || !runA || !runB) return [];

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
        const header = ["Tempo (s)", `${runA.metadata?.mode} (Run A)`, `${runB.metadata?.mode} (Run B)`];

        return [
            header,
            ...sortedSecs.map((sec) => {
                const vals = map.get(sec)!;
                return [sec, vals[0], vals[1]];
            })
        ];
    }, [telemetryA, telemetryB, runA, runB]);

    // Opções de design escuro profissional para o gráfico de comparação
    const comparisonChartOptions = {
        backgroundColor: "transparent",
        chartArea: { width: "90%", height: "75%", top: "12%", left: "7%" },
        titleTextStyle: { color: "#cbd5e1", fontSize: 14, fontName: "Inter, monospace", bold: true },
        hAxis: {
            title: "Tempo do Experimento (segundos)",
            titleTextStyle: { color: "#94a3b8", fontSize: 11 },
            textStyle: { color: "#94a3b8", fontSize: 10 },
            gridlines: { color: "#334155" }
        },
        vAxis: {
            title: "Operações por Segundo (ops/s)",
            titleTextStyle: { color: "#94a3b8", fontSize: 11 },
            textStyle: { color: "#94a3b8", fontSize: 10 },
            gridlines: { color: "#334155" }
        },
        colors: ["#3b82f6", "#10b981"],
        legend: { position: "bottom", textStyle: { color: "#cbd5e1", fontSize: 11 } },
        curveType: "function"
    };

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

    // 5. Aciona o diálogo de impressão PDF
    const triggerPdfPrint = () => {
        window.print();
    };

    // Calcula speedup de recuperação
    const recoveryComparison = useMemo(() => {
        if (!runA || !runB) return null;
        const tA = runA.results?.recoveryDurationSeconds || null;
        const tB = runB.results?.recoveryDurationSeconds || null;
        let speedup = null;
        if (tA && tB) {
            speedup = tA > tB ? (tA / tB).toFixed(2) : (tB / tA).toFixed(2);
        }
        return { tA, tB, speedup };
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
                        
                        {/* Seção de Comparação se dois ensaios forem selecionados */}
                        {runA && runB ? (
                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-6">
                                <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                                    <div>
                                        <h2 className="text-lg font-bold text-white">Comparação de Cenários Experimentais</h2>
                                        <p className="text-xs text-slate-400 mt-1">Análise de speedup de recuperação e eficiência estrutural da árvore indexada.</p>
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
                                    <h3 className="text-sm font-semibold text-slate-300 mb-3">Comportamento de Throughput Sobreposto</h3>
                                    {loadingTelemetry ? (
                                        <div className="text-center text-xs text-slate-500 py-16">Carregando telemetria...</div>
                                    ) : comparisonThroughputData.length > 0 ? (
                                        <Chart
                                            chartType="LineChart"
                                            data={comparisonThroughputData}
                                            options={comparisonChartOptions}
                                            width="100%"
                                            height="250px"
                                        />
                                    ) : (
                                        <div className="text-center text-xs text-slate-500 py-16">Dados de telemetria indisponíveis para comparação.</div>
                                    )}
                                </div>

                                {/* Tabela de Speedup e Consumo */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-4">
                                        <h3 className="text-sm font-semibold text-slate-300">Tempo de Recuperação</h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 text-center">
                                                <span className="text-[10px] text-slate-500 uppercase font-semibold">Run A ({runA.metadata?.mode?.includes("MM-DIRECT") ? "MM-Direct" : "AOF"})</span>
                                                <div className="text-lg font-bold text-blue-400 mt-1">{recoveryComparison?.tA ? `${recoveryComparison.tA}s` : "N/A"}</div>
                                            </div>
                                            <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 text-center">
                                                <span className="text-[10px] text-slate-500 uppercase font-semibold">Run B ({runB.metadata?.mode?.includes("MM-DIRECT") ? "MM-Direct" : "AOF"})</span>
                                                <div className="text-lg font-bold text-emerald-400 mt-1">{recoveryComparison?.tB ? `${recoveryComparison.tB}s` : "N/A"}</div>
                                            </div>
                                        </div>
                                        {recoveryComparison?.speedup && (
                                            <div className="p-3 bg-indigo-950/30 border border-indigo-900/50 rounded-lg text-center text-xs">
                                                Diferença de tempo e aceleração calculada: <strong className="text-indigo-400 font-mono text-sm">{recoveryComparison.speedup}x</strong> mais rápido.
                                            </div>
                                        )}
                                    </div>

                                    {/* Comparativo de Carga de Recursos */}
                                    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-4">
                                        <h3 className="text-sm font-semibold text-slate-300">Sumário Analítico de Recursos</h3>
                                        <div className="overflow-x-auto text-xs">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="border-b border-slate-850 text-slate-500">
                                                        <th className="pb-2">Métrica</th>
                                                        <th className="pb-2">Run A</th>
                                                        <th className="pb-2">Run B</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-850">
                                                    <tr>
                                                        <td className="py-2 text-slate-400">Pico de Throughput</td>
                                                        <td className="py-2 font-mono">{runA.report?.throughputSummary?.peakThroughput || 0} cmd/s</td>
                                                        <td className="py-2 font-mono">{runB.report?.throughputSummary?.peakThroughput || 0} cmd/s</td>
                                                    </tr>
                                                    <tr>
                                                        <td className="py-2 text-slate-400">Méd. Throughput</td>
                                                        <td className="py-2 font-mono">{runA.report?.throughputSummary?.averageThroughput || 0} cmd/s</td>
                                                        <td className="py-2 font-mono">{runB.report?.throughputSummary?.averageThroughput || 0} cmd/s</td>
                                                    </tr>
                                                    <tr>
                                                        <td className="py-2 text-slate-400">Pico de CPU</td>
                                                        <td className="py-2 font-mono">{runA.report?.cpuSummary?.peakCpu || 0}%</td>
                                                        <td className="py-2 font-mono">{runB.report?.cpuSummary?.peakCpu || 0}%</td>
                                                    </tr>
                                                    <tr>
                                                        <td className="py-2 text-slate-400">Pico de RAM</td>
                                                        <td className="py-2 font-mono">{runA.report?.memorySummary?.peakMemory || 0} MB</td>
                                                        <td className="py-2 font-mono">{runB.report?.memorySummary?.peakMemory || 0} MB</td>
                                                    </tr>
                                                </tbody>
                                            </table>
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
                                            {selectedRun.results?.recoveryDurationSeconds ? `${selectedRun.results.recoveryDurationSeconds}s` : "N/A"}
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
                                            {selectedRun.report?.throughputSummary?.averageThroughput ? `${selectedRun.report.throughputSummary.averageThroughput} cmd/s` : "N/A"}
                                        </div>
                                    </div>
                                    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
                                        <span className="text-[10px] text-slate-500 uppercase font-semibold">Pico de Memória</span>
                                        <div className="text-xl font-bold text-slate-200 mt-1">
                                            {selectedRun.report?.memorySummary?.peakMemory ? `${selectedRun.report.memorySummary.peakMemory.toFixed(1)} MB` : "N/A"}
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
                    {/* Linha Dupla IEEE */}
                    <div className="text-center space-y-2 border-b-2 border-double border-black pb-4 mb-6">
                        <h1 className="text-2xl font-bold tracking-wide uppercase">Relatório Técnico Experimental: MM-DIRECT vs Redis-IR</h1>
                        <p className="text-[10px] italic">Instrumentação científica para bancos de dados em memória baseados em árvore indexada</p>
                        <p className="text-xs">ID do Ensaio: <strong className="font-mono">{selectedRun.id}</strong> | Data de Execução: {selectedRun.metadata?.timestamp ? new Date(selectedRun.metadata.timestamp).toLocaleDateString() : "N/A"}</p>
                    </div>

                    <div className="space-y-6">
                        {/* Seção 1: Resumo Analítico */}
                        <div>
                            <h2 className="text-sm uppercase font-bold border-b border-black mb-2">I. Resumo Analítico e Resultados Gerais</h2>
                            <p className="text-xs text-justify">
                                Este documento relata formalmente a execução e validação empírica do banco de dados MM-DIRECT. 
                                O ensaio sob análise operou em modo de recuperação <strong>{selectedRun.metadata?.mode}</strong>, 
                                com status de encerramento classificado como <strong>{selectedRun.results?.status}</strong>. 
                                O tempo total de recuperação de dados e carga do banco na memória foi aferido em: <strong>{selectedRun.results?.recoveryDurationSeconds ? `${selectedRun.results.recoveryDurationSeconds} segundos` : "N/A"}</strong>.
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
                                        <th className="p-1.5 font-semibold">Registro do Log</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Início da Rodada</td>
                                        <td className="p-1 font-mono">{selectedRun.metadata?.timestamp ? new Date(selectedRun.metadata.timestamp).toLocaleTimeString() : "N/A"}</td>
                                    </tr>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Instante da Falha Simulada</td>
                                        <td className="p-1 font-mono">{selectedRun.results?.milestones?.failureAtLocal || selectedRun.results?.milestones?.failureTime || "N/A"}</td>
                                    </tr>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Início da Recuperação</td>
                                        <td className="p-1 font-mono">{selectedRun.results?.milestones?.recoveryStartAtLocal || selectedRun.results?.milestones?.recoveryStartTime || "N/A"}</td>
                                    </tr>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Recuperação Concluída</td>
                                        <td className="p-1 font-mono">{selectedRun.results?.milestones?.recoveryEndAtLocal || selectedRun.results?.milestones?.recoveryEndTime || "N/A"}</td>
                                    </tr>
                                    <tr>
                                        <td className="p-1 border-r border-black font-mono">Retorno à Estabilidade</td>
                                        <td className="p-1 font-mono">{selectedRun.results?.milestones?.stabilityAtLocal || selectedRun.results?.milestones?.stabilityTime || "N/A"}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Seção 4: Consumo e Vazão */}
                        <div>
                            <h2 className="text-sm uppercase font-bold border-b border-black mb-2">IV. Vazão Científica e Perfil de Recursos</h2>
                            <table className="w-full text-xs text-left border-collapse border border-black">
                                <thead>
                                    <tr className="bg-slate-100 border-b border-black">
                                        <th className="p-1.5 border-r border-black font-semibold">Métrica de Instrumentação</th>
                                        <th className="p-1.5 font-semibold">Resultados Obtidos</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Pico de Throughput (ops/seg)</td>
                                        <td className="p-1 font-mono">{selectedRun.report?.throughputSummary?.peakThroughput || 0} cmd/s</td>
                                    </tr>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Média de Throughput</td>
                                        <td className="p-1 font-mono">{selectedRun.report?.throughputSummary?.averageThroughput || 0} cmd/s</td>
                                    </tr>
                                    <tr className="border-b border-black">
                                        <td className="p-1 border-r border-black font-mono">Pico de CPU Registrado</td>
                                        <td className="p-1 font-mono">{selectedRun.report?.cpuSummary?.peakCpu || 0}%</td>
                                    </tr>
                                    <tr>
                                        <td className="p-1 border-r border-black font-mono">Pico de Consumo RAM</td>
                                        <td className="p-1 font-mono">{selectedRun.report?.memorySummary?.peakMemory || 0} MB</td>
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
            )}

        </div>
    );
};

export default HistoryPanel;
