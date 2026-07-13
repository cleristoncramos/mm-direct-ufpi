interface NavBarProps {
    currentTab: "experiment" | "history";
    setCurrentTab: (tab: "experiment" | "history") => void;
}

const NavBar = ({ currentTab, setCurrentTab }: NavBarProps) => {
    return (
        <header className="bg-my_blue px-6 py-3 shadow-md border-b border-blue-800/30">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                {/* Lado Esquerdo: Título e Descrição Simplificada */}
                <div className="flex flex-col space-y-0.5 max-w-xl text-center md:text-left">
                    <div className="flex flex-col sm:flex-row items-center gap-2">
                        <h1 className="text-white font-black tracking-wider text-xl">MM-DIRECT</h1>
                        <span className="h-4 w-[1px] bg-blue-700 hidden sm:block"></span>
                        <span className="text-blue-100 text-xs font-semibold font-sans">
                            Painel de Controle de Validação
                        </span>
                    </div>
                    <p className="text-[10px] text-blue-200/70 leading-normal hidden md:block font-sans">
                        Plataforma de execução e instrumentação científica para o banco de dados MM-DIRECT. Configure o ensaio utilizando os parâmetros abaixo e inicie a carga para gerar a telemetria em tempo real.
                    </p>
                </div>

                {/* Lado Direito: Abas de Navegação Proeminentes */}
                <div className="flex items-center space-x-2.5 flex-shrink-0">
                    <button
                        onClick={() => setCurrentTab("experiment")}
                        className={`px-4 py-2 text-xs font-bold rounded-lg border transition duration-200 ${
                            currentTab === "experiment"
                                ? "bg-white text-blue-900 border-white shadow-lg font-extrabold"
                                : "bg-blue-900/30 text-blue-100 border-blue-700/50 hover:bg-blue-850"
                        }`}
                    >
                        Novo Experimento
                    </button>
                    <button
                        onClick={() => setCurrentTab("history")}
                        className={`px-4 py-2 text-xs font-bold rounded-lg border transition duration-200 ${
                            currentTab === "history"
                                ? "bg-white text-blue-900 border-white shadow-lg font-extrabold"
                                : "bg-blue-900/30 text-blue-100 border-blue-700/50 hover:bg-blue-850"
                        }`}
                    >
                        Histórico & Comparação
                    </button>
                </div>
            </div>
        </header>
    );
};

export default NavBar;
