import { useEffect, useRef, useState } from "react";

interface TerminalData {
    value: string[];
}

const TerminalController = ({ value }: TerminalData) => {
    const [filterText, setFilterText] = useState("");
    const [fontSize, setFontSize] = useState<"sm" | "md" | "lg">("sm");
    const [isCopied, setIsCopied] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll para o final quando novos logs chegam
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [value, filterText]);

    const handleCopy = () => {
        navigator.clipboard.writeText(value.join("\n"));
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    // Filtra os logs com base no termo de busca
    const filteredLogs = value.filter(log => 
        log.toLowerCase().includes(filterText.toLowerCase())
    );

    // Função de colorização inteligente das linhas de log com ícones explicativos
    const getLogStyleAndIcon = (log: string) => {
        const lower = log.toLowerCase();
        
        if (lower.includes("error") || lower.includes("fail") || lower.includes("inconsistenes: [^0]")) {
            return {
                style: "text-rose-400 bg-rose-950/10 border-l border-rose-500/50 pl-2 py-0.5 rounded",
                prefix: "🔴"
            };
        }
        if (lower.includes("warning")) {
            return {
                style: "text-amber-400 bg-amber-950/10 border-l border-amber-500/50 pl-2 py-0.5 rounded",
                prefix: "🟡"
            };
        }
        if (lower.includes("db loaded") || lower.includes("ready to accept connections") || lower.includes("successfully") || lower.includes("environment started")) {
            return {
                style: "text-emerald-400 font-bold bg-emerald-950/10 border-l border-emerald-500/50 pl-2 py-0.5 rounded",
                prefix: "🟢"
            };
        }
        if (lower.includes("memtier") || lower.includes("benchmark")) {
            return {
                style: "text-sky-400 pl-2 py-0.5",
                prefix: "⚡"
            };
        }
        if (lower.includes("checkpoint") || lower.includes("indexer")) {
            return {
                style: "text-indigo-400 pl-2 py-0.5",
                prefix: "💾"
            };
        }
        return {
            style: "text-slate-300 pl-2 py-0.5",
            prefix: "  "
        };
    };

    // Mapeamento de tamanho de fonte ampliado para melhor legibilidade
    const sizeClasses = {
        sm: "text-[13px] md:text-[14px] leading-relaxed",
        md: "text-[15px] md:text-[16px] leading-relaxed",
        lg: "text-[17px] md:text-[18px] leading-relaxed",
    };

    return (
        <div className="flex flex-col bg-slate-950 rounded-xl border border-slate-800 shadow-2xl overflow-hidden font-mono">
            {/* Estilo local para otimizar o scrollbar do terminal, deixando-o largo e fácil de usar */}
            <style dangerouslySetInnerHTML={{__html: `
                .custom-terminal-scrollbar::-webkit-scrollbar {
                    width: 12px !important;
                    height: 12px !important;
                }
                .custom-terminal-scrollbar::-webkit-scrollbar-track {
                    background: #090d16 !important;
                }
                .custom-terminal-scrollbar::-webkit-scrollbar-thumb {
                    background: #1e293b !important;
                    border: 2px solid #090d16 !important;
                    border-radius: 6px !important;
                }
                .custom-terminal-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #334155 !important;
                }
            `}} />

            {/* Topbar do Terminal estilo macOS */}
            <div className="bg-slate-900 px-4 py-2.5 flex flex-col sm:flex-row justify-between items-center gap-3 border-b border-slate-850 select-none">
                {/* Janela Círculos (Estilo Mac) & Título */}
                <div className="flex items-center space-x-3 w-full sm:w-auto">
                    <div className="flex space-x-1.5 flex-shrink-0">
                        <span className="w-3 h-3 rounded-full bg-rose-500/90 inline-block shadow"></span>
                        <span className="w-3 h-3 rounded-full bg-amber-500/90 inline-block shadow"></span>
                        <span className="w-3 h-3 rounded-full bg-emerald-500/90 inline-block shadow"></span>
                    </div>
                    <span className="text-xs font-semibold text-slate-400 font-mono">
                        redis-server@mm-direct:~
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-950 text-[10px] font-mono text-slate-500 border border-slate-850">
                        {filteredLogs.length} linhas
                    </span>
                </div>

                {/* Controles de Busca, Fonte e Ações */}
                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
                    {/* Barra de Filtro */}
                    <div className="relative w-full sm:w-44">
                        <input
                            type="text"
                            placeholder="Filtrar logs..."
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            className="w-full pl-7 pr-3 py-1 bg-slate-950 border border-slate-855 rounded-lg text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition"
                        />
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.637 10.637Z" />
                        </svg>
                    </div>

                    {/* Tamanho da Fonte */}
                    <div className="flex bg-slate-950 border border-slate-850 rounded-lg p-0.5 text-[9px] font-mono text-slate-400">
                        <button
                            onClick={() => setFontSize("sm")}
                            className={`px-2.5 py-0.5 rounded transition ${fontSize === "sm" ? "bg-slate-800 text-white font-bold" : "hover:text-slate-250"}`}
                            title="Fonte Normal"
                        >
                            Aa
                        </button>
                        <button
                            onClick={() => setFontSize("md")}
                            className={`px-2.5 py-0.5 rounded transition ${fontSize === "md" ? "bg-slate-800 text-white font-bold" : "hover:text-slate-250"}`}
                            title="Fonte Média"
                        >
                            Aa+
                        </button>
                        <button
                            onClick={() => setFontSize("lg")}
                            className={`px-2.5 py-0.5 rounded transition ${fontSize === "lg" ? "bg-slate-800 text-white font-bold" : "hover:text-slate-250"}`}
                            title="Fonte Grande"
                        >
                            Aa++
                        </button>
                    </div>

                    {/* Copiar Logs */}
                    <button
                        onClick={handleCopy}
                        className="px-2.5 py-1 bg-slate-950 hover:bg-slate-850 border border-slate-850 hover:border-slate-750 rounded-lg text-xs font-mono font-medium text-slate-350 transition flex items-center space-x-1.5"
                    >
                        {isCopied ? (
                            <>
                                <span className="text-emerald-400">✓</span>
                                <span className="text-emerald-400 text-[10px]">Copiado!</span>
                            </>
                        ) : (
                            <>
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={1.5}
                                    stroke="currentColor"
                                    className="w-3.5 h-3.5"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H5.25m11.9-3.664A2.251 2.251 0 0 0 15 2.25h-3a2.251 2.251 0 0 0-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M19.5 8.25v10.5a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25V8.25a2.25 2.25 0 0 1 2.25-2.25h9a2.25 2.25 0 0 1 2.25 2.25Z" />
                                </svg>
                                <span className="text-[10px]">Copiar</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Painel do Terminal com rolagem customizada e facilitada */}
            <div
                ref={containerRef}
                className={`h-[480px] overflow-y-auto px-4 py-3 font-mono ${sizeClasses[fontSize]} bg-slate-950/95 space-y-1.5 custom-terminal-scrollbar`}
                style={{ 
                    scrollbarWidth: "auto", 
                    scrollbarColor: "#1e293b #090d16" 
                }}
            >
                {filteredLogs.length > 0 ? (
                    filteredLogs.map((log, index) => {
                        const { style, prefix } = getLogStyleAndIcon(log);
                        return (
                            <div key={index} className={`flex items-start ${style} whitespace-pre-wrap break-all`}>
                                <span className="mr-2.5 text-[10px] select-none opacity-60 flex-shrink-0 w-4 text-center">
                                    {prefix}
                                </span>
                                <span className="flex-1">{log}</span>
                            </div>
                        );
                    })
                ) : (
                    <div className="h-full flex items-center justify-center text-slate-500 text-xs italic font-sans select-none">
                        {filterText ? "Nenhum log corresponde ao filtro." : "Console limpo. Aguardando saída do servidor..."}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TerminalController;
