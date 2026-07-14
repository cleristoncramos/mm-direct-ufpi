import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import { Chart as ChartJS, registerables, ChartOptions } from "chart.js";
import Loading from "./Loading";

try {
    ChartJS.register(...registerables);
} catch (e) {
    console.error("Error registering ChartJS in ScatterChart", e);
}

interface ScatterChartProps {
    data: [number, number | null, number | null][];
    chartMode?: "default" | "minimalist";
}

export const ScatterChart = ({ chartMode = "default", data }: ScatterChartProps) => {
    if (data.length === 0) {
        return <Loading />;
    }

    // Ordena os dados pelo tempo (eixo x) para evitar linhas diagonais confusas
    const sortedData = useMemo(() => {
        return [...data].sort((a, b) => a[0] - b[0]);
    }, [data]);

    const chartData = useMemo(() => {
        return {
            datasets: [
                {
                    label: "Normal",
                    data: sortedData.map((item) => ({ x: item[0], y: item[1] })),
                    borderColor: "#3b82f6", // Blue
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.15,
                    spanGaps: true, // Conecta os pontos através de lacunas
                },
                {
                    label: "Anormal (Fase de Falha)",
                    data: sortedData.map((item) => ({ x: item[0], y: item[2] })),
                    borderColor: "#f43f5e", // Rose/red
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.15,
                    spanGaps: true, // Conecta os pontos através de lacunas
                }
            ]
        };
    }, [sortedData]);

    const chartOptions = useMemo<ChartOptions<"line">>(() => {
        const isMinimal = chartMode === "minimalist";
        return {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: "linear" as const,
                    display: !isMinimal,
                    grid: { color: "#334155" },
                    ticks: { color: "#94a3b8" }
                },
                y: {
                    display: !isMinimal,
                    grid: { color: "#334155" },
                    ticks: { color: "#94a3b8" }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: !isMinimal }
            }
        };
    }, [chartMode]);

    return (
        <div
            id="Latency_chart"
            className="w-full h-[160px] pt-2 pb-1 bg-slate-900/40 rounded-lg border border-slate-800/80"
        >
            <Line data={chartData} options={chartOptions} />
        </div>
    );
};