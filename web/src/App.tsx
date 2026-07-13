import { useState } from "react";
import NavBar from "./componentes/NavBar";
import SetupPanel from "./componentes/Form/SetupPanel";
import ChartBoard from "./componentes/Charts/ChartBoard";
import HistoryPanel from "./componentes/HistoryPanel";

const App = () => {
    const [loadingServer, setLoadingServer] = useState<boolean>(false);
    const [generateArquive, setGenerateArquive] = useState<boolean>(false);
    const [generateArquiveMonitoring, setGenerateArquiveMonitoring] =
        useState<boolean>(false);
    const [startConnection, setStartConnection] = useState<WebSocket>();
    const [logs, setLogs] = useState<string[]>([]);
    const [configData, setConfigData] = useState<any>({});
    
    // Controla a aba atual quando fora de execução
    const [currentTab, setCurrentTab] = useState<"experiment" | "history">("experiment");

    const initializeServer = (params: any) => {
        console.log("Iniciando servidor com config:", params);
        setConfigData(params);
        setLoadingServer(true);
        setLogs([]);

        const ws = new WebSocket(`ws://localhost:8081/start`);

        ws.onmessage = (event) => {
            setLogs((prevLogs) => [...prevLogs, event.data]);
            if (event.data === "Generating information database commands") {
                console.log("Server started");
                setLoadingServer(false);
                setGenerateArquive(true);
            }

            if (
                event.data === "Generating system monitoring" &&
                !generateArquiveMonitoring
            ) {
                console.log("Server started");
                setLoadingServer(false);
                setGenerateArquiveMonitoring(true);
            }
        };

        ws.onerror = (err) => {
            console.error("Erro na conexão ws://localhost:8081/start:", err);
            setLoadingServer(false);
        };

        setStartConnection(ws);
    };

    const onReloadButtuonClick = (e: Event, connectionsArray: WebSocket[]) => {
        if (e) {
            console.log("Reiniciando experimento...");
        }
        
        // Dispara parada limpa do servidor Redis antes de retornar
        try {
            const stopWs = new WebSocket("ws://localhost:8081/stop");
            stopWs.onopen = () => {
                console.log("Comando de desligamento limpo (shutdown) enviado ao Redis.");
                setTimeout(() => stopWs.close(), 500);
            };
        } catch (err) {
            console.error("Erro ao conectar no stop WS:", err);
        }

        connectionsArray.forEach((conection: WebSocket) => conection.close())
        startConnection?.close()
        setLogs([]);
        setGenerateArquive(false);
        setGenerateArquiveMonitoring(false);
        setConfigData({});
        // Retorna para a aba de novo experimento ao reiniciar
        setCurrentTab("experiment");
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
            {/* Oculta o NavBar durante a execução do experimento ou impressão do PDF */}
            <div className="print:hidden">
                {!generateArquive && <NavBar currentTab={currentTab} setCurrentTab={setCurrentTab} />}
            </div>

            <main className="flex-1 flex flex-col justify-start">
                
                {/* Exibição Condicional de Telas */}
                {!generateArquive && !generateArquiveMonitoring && (
                    currentTab === "experiment" ? (
                        <div className="container mx-auto max-w-4xl px-4 py-4 print:hidden">
                            <SetupPanel initServer={initializeServer} />
                        </div>
                    ) : (
                        <HistoryPanel onBack={() => setCurrentTab("experiment")} />
                    )
                )}

                {loadingServer && (
                    <div className="fixed inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm z-50 print:hidden">
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-sm text-center shadow-2xl space-y-6">
                            <div className="relative w-16 h-16 mx-auto">
                                <div className="absolute inset-0 rounded-full border-4 border-slate-800"></div>
                                <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-lg font-bold text-white">Inicializando Ensaio...</h3>
                                <p className="text-xs text-slate-400">Higienizando pipeline e disparando MM-DIRECT em segundo plano.</p>
                            </div>
                            <div className="bg-slate-950 rounded-lg p-3 max-h-32 overflow-y-auto text-left font-mono text-[10px] text-blue-400 border border-slate-850">
                                {logs.length > 0 ? logs[logs.length - 1] : "Aguardando sinal do servidor..."}
                            </div>
                        </div>
                    </div>
                )}

                {generateArquive && (
                    <div className="flex-1 flex flex-col">
                        <ChartBoard
                            cpuChart={generateArquiveMonitoring}
                            transferChart={generateArquive}
                            terminalLog={logs}
                            onReloadButtonClick={onReloadButtuonClick}
                            configData={configData}
                        />
                    </div>
                )}
            </main>
        </div>
    );
}

export default App;
